/**
 * Intelligence Moat - Feature 4 (Revenue Leakage) + Feature 13 (Opportunity
 * Engine) data-access layer.
 *
 * Backed by db/schema-im-opportunity.sql (opportunities, revenue_scans).
 *
 * Authorization model:
 *   - opportunities are audience-scoped. A row targets an audience_role and
 *     optionally an audience_org_id / audience_user_id. The feed query
 *     (listOpportunities) returns ONLY rows whose audience matches the actor's
 *     org/user (plus role-broadcast rows with no org/user set, filtered to the
 *     actor's role). A forged feed request therefore cannot read another
 *     tenant's opportunities (IDOR-safe). dismiss/action verify the same scope
 *     before mutating.
 *   - revenue_scans hang off a venue / event. We authorize the venue or event
 *     against the actor's org (mirroring revenue-inventory.ts / events.ts)
 *     before recording a scan, then gather the scan inputs from existing tables
 *     and run the deterministic library.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  scanVenue,
  scanEvent,
  type RevenueScanResult,
  type VenueAsset,
  type EventLineItem,
} from "../lib/revenueLeakage.js";
import {
  generateOpportunities,
  type GeneratedOpportunity,
  type OpportunityRole,
} from "../lib/opportunityEngine.js";
import type {
  PartnershipMatch,
  MatchEntityType,
  TargetKind,
} from "../lib/partnershipMatch.js";

// ---- Row types --------------------------------------------------------------

export type OpportunityRow = {
  id: string;
  audience_role: string | null;
  audience_org_id: string | null;
  audience_user_id: string | null;
  kind: string | null;
  title: string | null;
  detail: unknown;
  potential_value: number | null;
  status: "open" | "dismissed" | "actioned";
  source: string | null;
  created_at: string;
};

export type RevenueScanRow = {
  id: string;
  scope: "venue" | "event";
  scope_id: string | null;
  potential: number | null;
  captured: number | null;
  missed: number | null;
  suggestions: unknown;
  created_at: string;
};

const OPP_ROLES = new Set<string>(["venue", "vendor", "planner", "sponsor", "client"]);

// ---- Authorization helpers --------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

function jsonbParam(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

/** Resolve + authorize a venue against the actor's org. Returns the owning org. */
async function assertVenueAccess(actor: Actor, venueId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  if (isAdmin(actor)) return row.organization_id;
  if (!actor.org?.id || row.organization_id !== actor.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
  return row.organization_id;
}

/** Resolve + authorize an event against the actor (org owner / client / planner). */
async function assertEventAccess(actor: Actor, eventId: string): Promise<void> {
  const ev = await q1<{
    organization_id: string | null;
    client_id: string | null;
    planner_id: string | null;
  }>(`select organization_id, client_id, planner_id from events where id = $1`, [eventId]);
  if (!ev) throw new NotFoundError("event not found");
  if (isAdmin(actor)) return;
  const myOrg = actor.org?.id ?? null;
  const myUser = actor.user.id;
  const linked = await q1<{ n: number }>(
    `select count(*)::int as n from event_vendors where event_id = $1 and organization_id = $2`,
    [eventId, myOrg],
  );
  const ok =
    (myOrg != null && ev.organization_id === myOrg) ||
    ev.client_id === myUser ||
    ev.planner_id === myUser ||
    (linked?.n ?? 0) > 0;
  if (!ok) throw new ForbiddenError("no access to event");
}

// ============================================================================
// opportunities: list (feed) / dismiss / action / bulk insert
// ============================================================================

/**
 * The role-scoped daily feed for the actor. Returns OPEN opportunities whose
 * audience matches the actor: rows explicitly targeted at the actor's user or
 * org, plus role-broadcast rows (no org/user set) for the actor's role. Admins
 * see the full open feed. Newest first, capped.
 */
export async function listOpportunities(
  actor: Actor,
  opts: { role?: string | null; status?: string | null; limit?: number } = {},
): Promise<OpportunityRow[]> {
  const cap = Math.max(1, Math.min(500, Number.isFinite(opts.limit) ? Number(opts.limit) : 100));
  const status =
    opts.status === "dismissed" || opts.status === "actioned" || opts.status === "open"
      ? opts.status
      : "open";

  if (isAdmin(actor)) {
    if (opts.role && OPP_ROLES.has(opts.role)) {
      return q<OpportunityRow>(
        `select * from opportunities where status = $1 and audience_role = $2
          order by created_at desc, potential_value desc limit $3`,
        [status, opts.role, cap],
      );
    }
    return q<OpportunityRow>(
      `select * from opportunities where status = $1
        order by created_at desc, potential_value desc limit $2`,
      [status, cap],
    );
  }

  const myOrg = actor.org?.id ?? null;
  const myUser = actor.user.id;
  const role = opts.role && OPP_ROLES.has(opts.role) ? opts.role : actor.user.role ?? null;

  return q<OpportunityRow>(
    `select * from opportunities
      where status = $1
        and (
          audience_user_id = $2
          or ($3::uuid is not null and audience_org_id = $3)
          or (audience_org_id is null and audience_user_id is null
              and ($4::text is null or audience_role = $4))
        )
      order by created_at desc, potential_value desc
      limit $5`,
    [status, myUser, myOrg, role, cap],
  );
}

/** Load one opportunity the actor may see, or throw NotFound/Forbidden. */
async function getScopedOpportunity(actor: Actor, id: string): Promise<OpportunityRow> {
  const row = await q1<OpportunityRow>(`select * from opportunities where id = $1`, [id]);
  if (!row) throw new NotFoundError("opportunity not found");
  if (isAdmin(actor)) return row;
  const myOrg = actor.org?.id ?? null;
  const myUser = actor.user.id;
  const visible =
    row.audience_user_id === myUser ||
    (myOrg != null && row.audience_org_id === myOrg) ||
    (row.audience_org_id === null &&
      row.audience_user_id === null &&
      row.audience_role === (actor.user.role ?? null));
  if (!visible) throw new ForbiddenError("no access to this opportunity");
  return row;
}

/** Set an opportunity's status (dismissed / actioned), audience-scoped. */
export async function setOpportunityStatus(
  actor: Actor,
  id: string,
  status: "dismissed" | "actioned" | "open",
): Promise<OpportunityRow> {
  await getScopedOpportunity(actor, id);
  const row = await q1<OpportunityRow>(
    `update opportunities set status = $2 where id = $1 returning *`,
    [id, status],
  );
  return row as OpportunityRow;
}

/**
 * Replace the actor-scoped, engine-generated feed for a role. We delete the
 * actor's existing OPEN, engine-sourced opportunities for the role first (so the
 * feed does not accumulate duplicates across runs), then insert the freshly
 * generated rows. User-dismissed / actioned rows are left untouched. Runs in a
 * transaction. Returns the inserted rows.
 */
export async function replaceGeneratedFeed(
  actor: Actor,
  role: OpportunityRole,
  rows: GeneratedOpportunity[],
): Promise<OpportunityRow[]> {
  const myOrg = actor.org?.id ?? null;
  const myUser = actor.user.id;
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Clear prior OPEN generated rows for this actor + role to avoid duplicates.
    // Partnership-match rows are persisted by a separate idempotent path (F6 ->
    // F13) keyed on their own dedupe key, so they are explicitly preserved here
    // rather than wiped on every engine regenerate.
    await client.query(
      `delete from opportunities
        where status = 'open'
          and audience_role = $1
          and coalesce(source, '') <> 'partnership_match'
          and kind is distinct from 'partnership_match'
          and (
            (audience_org_id is not null and audience_org_id = $2)
            or (audience_org_id is null and audience_user_id = $3)
          )`,
      [role, myOrg, myUser],
    );
    const inserted: OpportunityRow[] = [];
    for (const r of rows) {
      const row = (
        await client.query(
          `insert into opportunities
             (audience_role, audience_org_id, audience_user_id, kind, title, detail,
              potential_value, status, source)
           values ($1,$2,$3,$4,$5,$6,$7,'open',$8)
           returning *`,
          [
            r.audience_role,
            r.audience_org_id ?? myOrg,
            r.audience_user_id ?? (r.audience_org_id == null && myOrg == null ? myUser : null),
            r.kind,
            r.title,
            jsonbParam(r.detail),
            r.potential_value,
            r.source,
          ],
        )
      ).rows[0] as OpportunityRow;
      inserted.push(row);
    }
    await client.query("commit");
    return inserted;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================================
// Partnership-match write-back (F6 -> Opportunity Feed)
// ============================================================================

/**
 * Map a partnership-match source type onto a valid opportunity audience_role so
 * the persisted rows show up in the right role feed. Source types that are not
 * themselves feed roles (agency / brand) fall back to the actor's own role, and
 * finally to "vendor" so the row always carries a concrete role.
 */
function audienceRoleForSource(actor: Actor, sourceType: MatchEntityType): string {
  if (OPP_ROLES.has(sourceType)) return sourceType;
  const ar = actor.user.role ?? "";
  if (OPP_ROLES.has(ar)) return ar;
  return "vendor";
}

/** Deterministic dedupe key for a single source/candidate partnership pairing. */
function partnershipDedupeKey(sourceId: string, candidateId: string): string {
  return `partnership_match:${sourceId}:${candidateId}`;
}

/**
 * Persist qualifying partnership matches into the opportunities feed (F6 -> F13).
 *
 * Deterministic + idempotent: each (source, candidate) pairing carries a stable
 * dedupe key (stored in detail.dedupe_key). Re-running an identical match UPDATES
 * the existing open row in place rather than inserting a duplicate, so the feed
 * never accumulates copies. Only matches at or above `minScore` are stored.
 *
 * IDOR-safe: rows are scoped to the actor's own organization (audience_org_id),
 * or to the actor's user when the actor has no org. A forged request can only
 * ever write opportunities the actor would themselves be allowed to read.
 *
 * No schema change: dedupe is done via detail->>'dedupe_key' against the existing
 * jsonb column; source = 'partnership_match'; status = 'open'.
 */
export async function persistPartnershipMatches(
  actor: Actor,
  source: { type: MatchEntityType; id: string; name?: string | null },
  targetKind: TargetKind,
  matches: PartnershipMatch[],
  minScore = 60,
): Promise<number> {
  const myOrg = actor.org?.id ?? null;
  const myUser = actor.user.id;
  const audienceRole = audienceRoleForSource(actor, source.type);
  // Scope: prefer org; only fall back to the user when there is no org.
  const audienceOrg = myOrg;
  const audienceUser = myOrg == null ? myUser : null;

  const qualifying = matches.filter(
    (m) => Number.isFinite(m.score) && m.score >= minScore && m.candidate?.id,
  );
  if (qualifying.length === 0) return 0;

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query("begin");
    for (const m of qualifying) {
      const candidateId = m.candidate.id;
      const dedupeKey = partnershipDedupeKey(source.id, candidateId);
      const candidateName = m.candidate.name ?? "a partner";
      const sourceName = source.name ?? "your organization";
      const title = `Partnership match: ${candidateName} (${m.score}/100) for ${sourceName}`;
      const detail = {
        dedupe_key: dedupeKey,
        source_type: source.type,
        source_id: source.id,
        target_kind: targetKind,
        candidate_id: candidateId,
        candidate_kind: m.candidate.kind,
        candidate_name: m.candidate.name ?? null,
        score: m.score,
        fit: m.fit,
        components: m.components,
        reasons: m.reasons,
      };

      // Check-then-upsert on the deterministic dedupe key within the same audience
      // scope. Update keeps the row fresh (score/reasons may shift as data changes)
      // without creating duplicates.
      const existing = (
        await client.query<{ id: string }>(
          `select id from opportunities
            where kind = 'partnership_match'
              and detail->>'dedupe_key' = $1
              and (
                ($2::uuid is not null and audience_org_id = $2)
                or ($2::uuid is null and audience_user_id = $3)
              )
            limit 1`,
          [dedupeKey, audienceOrg, audienceUser],
        )
      ).rows[0];

      if (existing) {
        await client.query(
          `update opportunities
              set title = $2,
                  detail = $3,
                  potential_value = $4,
                  source = 'partnership_match'
            where id = $1`,
          [existing.id, title, jsonbParam(detail), m.score],
        );
      } else {
        await client.query(
          `insert into opportunities
             (audience_role, audience_org_id, audience_user_id, kind, title, detail,
              potential_value, status, source)
           values ($1,$2,$3,'partnership_match',$4,$5,$6,'open','partnership_match')`,
          [audienceRole, audienceOrg, audienceUser, title, jsonbParam(detail), m.score],
        );
      }
      written++;
    }
    await client.query("commit");
    return written;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================================
// revenue_scans: record + scan loaders
// ============================================================================

/** Persist a revenue scan result for a venue / event. */
export async function recordRevenueScan(
  scope: "venue" | "event",
  scopeId: string,
  result: RevenueScanResult,
): Promise<RevenueScanRow> {
  const row = await q1<RevenueScanRow>(
    `insert into revenue_scans (scope, scope_id, potential, captured, missed, suggestions)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [scope, scopeId, result.potential, result.captured, result.missed, jsonbParam(result.suggestions)],
  );
  return row as RevenueScanRow;
}

/**
 * Scan a venue for revenue leakage (org-scoped + IDOR-safe). Gathers the venue's
 * inventory + open sponsorship assets, runs the deterministic library, records
 * the scan, and returns the result.
 */
export async function scanVenueAndRecord(
  actor: Actor,
  venueId: string,
): Promise<{ scan: RevenueScanResult; record: RevenueScanRow }> {
  await assertVenueAccess(actor, venueId);

  const venue = await q1<{
    capacity: number | null;
    venue_type: string | null;
  }>(`select capacity, venue_type from venues where id = $1`, [venueId]);

  const inventory = await q<{
    category: string | null;
    pricing: unknown;
    audience_size: number | null;
    impression_estimate: number | null;
  }>(
    `select category, pricing, audience_size, impression_estimate
       from revenue_inventory where venue_id = $1`,
    [venueId],
  );
  const sponsorships = await q<{
    category: string | null;
    pricing: unknown;
    audience_size: number | null;
    impression_estimate: number | null;
    status: string | null;
  }>(
    `select category, pricing, audience_size, impression_estimate, status
       from sponsorship_opportunities where venue_id = $1`,
    [venueId],
  );

  // Average reach across known assets, falling back to venue capacity.
  const reaches = [...inventory, ...sponsorships]
    .map((a) => Number(a.audience_size ?? a.impression_estimate ?? 0) || 0)
    .filter((n) => n > 0);
  const avgReach = reaches.length ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length) : 0;

  const assets: VenueAsset[] = [
    // Revenue inventory items exist but are treated as unsold capacity (a gap to
    // close) unless they carry an explicit booked flag, which this table lacks;
    // so they inform reach but do not pre-credit capture.
    ...inventory.map((it) => ({ category: it.category, value: priceOf(it.pricing), booked: false })),
    // A sponsorship that is not 'open' is treated as already captured.
    ...sponsorships.map((s) => ({
      category: s.category,
      value: priceOf(s.pricing),
      booked: s.status != null && s.status !== "open" && s.status !== "draft",
    })),
  ];

  const scan = scanVenue({
    venueId,
    audienceSize: avgReach || null,
    capacity: venue?.capacity ?? null,
    assets,
  });
  const record = await recordRevenueScan("venue", venueId, scan);
  return { scan, record };
}

/**
 * Scan an event for revenue leakage (authorized + IDOR-safe). Gathers the
 * event's guest count / budget and whether sponsors are attached, runs the
 * deterministic library, records the scan, and returns the result.
 */
export async function scanEventAndRecord(
  actor: Actor,
  eventId: string,
): Promise<{ scan: RevenueScanResult; record: RevenueScanRow }> {
  await assertEventAccess(actor, eventId);

  const ev = await q1<{ guest_count: number | null; budget: number | null }>(
    `select guest_count, budget from events where id = $1`,
    [eventId],
  );

  // Booked add-ons come from quote line items on this event. We map each line's
  // category/description onto a leak type via the library's inference.
  const quotes = await q<{ line_items: unknown }>(
    `select line_items from quotes where event_id = $1`,
    [eventId],
  );
  const bookedItems: EventLineItem[] = [];
  for (const qrow of quotes) {
    const items = Array.isArray(qrow.line_items) ? (qrow.line_items as unknown[]) : [];
    for (const li of items) {
      if (li && typeof li === "object") {
        const rec = li as Record<string, unknown>;
        const category =
          (typeof rec.category === "string" && rec.category) ||
          (typeof rec.label === "string" && rec.label) ||
          (typeof rec.name === "string" && rec.name) ||
          null;
        const value =
          Number(rec.amount ?? rec.total ?? rec.price ?? 0) || 0;
        if (category) bookedItems.push({ category, value });
      }
    }
  }

  const sponsorCount = await q1<{ n: number }>(
    `select count(*)::int as n from event_vendors where event_id = $1 and role = 'sponsor'`,
    [eventId],
  );

  const scan = scanEvent({
    eventId,
    guestCount: ev?.guest_count ?? null,
    budget: ev?.budget ?? null,
    bookedItems,
    hasSponsors: (sponsorCount?.n ?? 0) > 0,
  });
  const record = await recordRevenueScan("event", eventId, scan);
  return { scan, record };
}

/** Extract a numeric price from a pricing jsonb blob ({amount|price}). */
function priceOf(pricing: unknown): number | null {
  if (!pricing || typeof pricing !== "object") return null;
  const rec = pricing as Record<string, unknown>;
  const v = Number(rec.amount ?? rec.price ?? 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ============================================================================
// Opportunity feed generation (gather inputs -> engine -> persist)
// ============================================================================

/**
 * Generate + persist the actor's role-scoped opportunity feed. Loads the
 * role-relevant raw data (org-scoped), runs the deterministic engine, and
 * replaces the actor's prior open generated feed for the role. Returns the rows.
 */
export async function generateAndStoreFeed(
  actor: Actor,
  role: OpportunityRole,
): Promise<OpportunityRow[]> {
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;

  const inputs: Parameters<typeof generateOpportunities>[2] = {};

  if (role === "venue" && orgId) {
    const venues = await q<{
      id: string;
      name: string | null;
      venue_type: string | null;
      capacity: number | null;
    }>(`select id, name, venue_type, capacity from venues where organization_id = $1 limit 50`, [orgId]);

    inputs.venues = [];
    inputs.events = [];
    for (const v of venues) {
      const inv = await q<{
        category: string | null;
        pricing: unknown;
        audience_size: number | null;
        impression_estimate: number | null;
      }>(
        `select category, pricing, audience_size, impression_estimate
           from revenue_inventory where venue_id = $1`,
        [v.id],
      );
      const unsold = await q1<{ n: number }>(
        `select count(*)::int as n from sponsorship_opportunities
          where venue_id = $1 and status = 'open'`,
        [v.id],
      );
      const reaches = inv
        .map((a) => Number(a.audience_size ?? a.impression_estimate ?? 0) || 0)
        .filter((n) => n > 0);
      const avgReach = reaches.length
        ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length)
        : 0;
      inputs.venues.push({
        venueId: v.id,
        name: v.name,
        venueType: v.venue_type,
        audienceSize: avgReach || null,
        capacity: v.capacity,
        assets: inv.map((it) => ({ category: it.category, value: priceOf(it.pricing), booked: false })),
        unsoldInventoryCount: unsold?.n ?? 0,
      });
    }
  }

  if (role === "venue" || role === "planner" || role === "client") {
    inputs.events = inputs.events ?? [];
    const events = await q<{
      id: string;
      name: string | null;
      type: string | null;
      guest_count: number | null;
      budget: number | null;
    }>(
      `select e.id, e.name, e.type, e.guest_count, e.budget
         from events e
        where ($1::uuid is not null and e.organization_id = $1)
           or e.client_id = $2
           or e.planner_id = $2
        order by e.created_at desc
        limit 50`,
      [orgId, userId],
    );
    for (const e of events) {
      const sponsorCount = await q1<{ n: number }>(
        `select count(*)::int as n from event_vendors where event_id = $1 and role = 'sponsor'`,
        [e.id],
      );
      inputs.events.push({
        eventId: e.id,
        name: e.name,
        eventType: e.type,
        guestCount: e.guest_count,
        budget: e.budget,
        hasSponsors: (sponsorCount?.n ?? 0) > 0,
      });
    }
  }

  if (role === "vendor" || role === "planner") {
    const openProjects = await q<{
      id: string;
      name: string | null;
      type: string | null;
      budget: number | null;
    }>(
      `select id, name, type, budget from events
        where status in ('vendor_bidding','quotes_received','inquiry')
        order by created_at desc limit 40`,
      [],
    );
    inputs.openProjects = openProjects.map((p) => ({
      eventId: p.id,
      name: p.name,
      category: p.type,
      budget: p.budget,
    }));
  }

  if (role === "vendor" && orgId) {
    const reqs = await q<{ venue_id: string | null; venue_name: string | null; tier: string | null }>(
      `select pv.venue_id, v.name as venue_name, pv.tier
         from preferred_vendors pv
         join vendors ven on ven.id = pv.vendor_id
         left join venues v on v.id = pv.venue_id
        where ven.organization_id = $1
        limit 40`,
      [orgId],
    );
    inputs.preferredRequests = reqs.map((r) => ({
      venueId: r.venue_id,
      venueName: r.venue_name,
      tier: r.tier,
    }));
  }

  if (role === "sponsor") {
    // Sponsors browse open sponsorship inventory across venues (cross-org read,
    // status = open), surfaced as audience matches.
    const open = await q<{
      venue_id: string | null;
      audience_size: number | null;
      impression_estimate: number | null;
    }>(
      `select so.venue_id, so.audience_size, so.impression_estimate
         from sponsorship_opportunities so
        where so.status = 'open'
        order by coalesce(so.audience_size, so.impression_estimate, 0) desc
        limit 40`,
      [],
    );
    const seen = new Set<string>();
    inputs.venues = [];
    for (const o of open) {
      if (!o.venue_id || seen.has(o.venue_id)) continue;
      seen.add(o.venue_id);
      const v = await q1<{ name: string | null; venue_type: string | null }>(
        `select name, venue_type from venues where id = $1`,
        [o.venue_id],
      );
      inputs.venues.push({
        venueId: o.venue_id,
        name: v?.name ?? null,
        venueType: v?.venue_type ?? null,
        audienceSize: o.audience_size,
        impressionEstimate: o.impression_estimate,
      });
    }
  }

  const generated = generateOpportunities({ orgId, userId }, role, inputs);
  return replaceGeneratedFeed(actor, role, generated);
}
