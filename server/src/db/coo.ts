/**
 * Divini AI COO (V2) - data-access layer.
 *
 * Backed by db/schema-coo-tasks.sql (coo_tasks). The briefing + dashboard are
 * computed LIVE from existing tables and engines (no new persisted state beyond
 * the generated tasks). Everything is role-aware and org-scoped:
 *
 *   - gatherBriefing(actor): loads the actor's org-scoped venues / events /
 *     contracts / sponsorships, runs the EXISTING engines
 *       * generateOpportunities (lib/opportunityEngine)   -> revenue + matches
 *       * runScan               (db/warroom)              -> per-event risks
 *       * match                 (lib/partnershipMatch)    -> partner suggestions
 *     and shapes them via assembleBriefing (lib/cooBriefing). IDOR-safe: every
 *     event scanned is one runScan can already see (it gates on getEvent), and
 *     every venue / contract / sponsorship read is filtered to the actor's org.
 *
 *   - tasks.generate(actor): assembles the briefing, builds ranked task rows
 *     (lib/cooTasks), and replaces the actor's prior open generated tasks.
 *   - tasks.listForActor(actor): the actor's audience-scoped task feed.
 *   - tasks.setStatus(actor, id, status): scoped disposition update.
 *
 * Mirrors db/opportunity.ts conventions (pool q/q1, Actor, audience scoping,
 * replace-then-insert in a transaction). Server imports use .js.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import {
  generateOpportunities,
  type OpportunityRole,
  type OpportunityInputs,
} from "../lib/opportunityEngine.js";
import { runScan } from "./warroom.js";
import { match, type MatchEntity } from "../lib/partnershipMatch.js";
import {
  assembleBriefing,
  type Briefing,
  type BriefingInputs,
} from "../lib/cooBriefing.js";
import { buildTasksFromBriefing } from "../lib/cooTasks.js";

// ---- helpers ----------------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

function jsonbParam(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

/** Whole days from now until a timestamp (UTC-day granularity), or null. */
function daysUntil(ts: string | Date | null): number | null {
  if (!ts) return null;
  const t = ts instanceof Date ? ts.getTime() : Date.parse(String(ts));
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
}

const OPP_ROLES = new Set<OpportunityRole>(["venue", "vendor", "planner", "sponsor", "client"]);

/** The opportunity-engine role for the actor (falls back to venue for staff). */
function actorRole(actor: Actor): OpportunityRole {
  const r = actor.user.role ?? "";
  return OPP_ROLES.has(r as OpportunityRole) ? (r as OpportunityRole) : "venue";
}

const numOr0 = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

/** Extract a numeric price from a pricing jsonb blob ({amount|price}). */
function priceOf(pricing: unknown): number | null {
  if (!pricing || typeof pricing !== "object") return null;
  const rec = pricing as Record<string, unknown>;
  const v = Number(rec.amount ?? rec.price ?? 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ============================================================================
// gatherBriefing: load org-scoped data -> run existing engines -> assemble
// ============================================================================

/**
 * Build the per-actor executive briefing live. Role-aware + org-scoped. Calls
 * the existing engines and assembles the result; never fabricates data, so a
 * brand-new org gets an honest empty briefing.
 */
export async function gatherBriefing(actor: Actor): Promise<Briefing> {
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;
  const role = actorRole(actor);

  const oppInputs: OpportunityInputs = {};

  // ---- venues owned by the org (leakage + sponsorship inventory) -----------
  const venues =
    orgId || isAdmin(actor)
      ? await q<{
          id: string;
          name: string | null;
          venue_type: string | null;
          city: string | null;
          region: string | null;
          capacity: number | null;
          review_score: number | null;
        }>(
          `select id, name, venue_type, city, region, capacity, review_score
             from venues
            where $1::uuid is null or organization_id = $1
            order by created_at desc
            limit 50`,
          [orgId],
        )
      : [];

  const sponsorships: NonNullable<BriefingInputs["sponsorships"]> = [];
  if (venues.length) {
    oppInputs.venues = [];
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
      const reaches = inv
        .map((a) => numOr0(a.audience_size ?? a.impression_estimate ?? 0))
        .filter((n) => n > 0);
      const avgReach = reaches.length
        ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length)
        : 0;
      const unsold = await q1<{ n: number }>(
        `select count(*)::int as n from sponsorship_opportunities
          where venue_id = $1 and status = 'open'`,
        [v.id],
      );
      oppInputs.venues.push({
        venueId: v.id,
        name: v.name,
        venueType: v.venue_type,
        audienceSize: avgReach || null,
        capacity: v.capacity,
        assets: inv.map((it) => ({ category: it.category, value: priceOf(it.pricing), booked: false })),
        unsoldInventoryCount: unsold?.n ?? 0,
      });

      // Open sponsorship inventory -> sponsorship opportunities (value from pricing).
      const open = await q<{ id: string; name: string | null; pricing: unknown; audience_size: number | null }>(
        `select id, name, pricing, audience_size
           from sponsorship_opportunities
          where venue_id = $1 and status = 'open'
          order by coalesce(audience_size, impression_estimate, 0) desc
          limit 20`,
        [v.id],
      );
      for (const s of open) {
        sponsorships.push({
          title: `${s.name ?? "Sponsorship"} at ${v.name ?? "venue"}`,
          value: priceOf(s.pricing) ?? 0,
          ref: { sponsorship_id: s.id, venue_id: v.id },
        });
      }
    }
  }

  // ---- events the actor owns (leakage + war-room risks) --------------------
  const events = await q<{
    id: string;
    name: string | null;
    type: string | null;
    guest_count: number | null;
    budget: number | null;
  }>(
    `select e.id, e.name, e.type, e.guest_count, e.budget
       from events e
      where ($1::uuid is null and $3)
         or ($1::uuid is not null and e.organization_id = $1)
         or e.client_id = $2
         or e.planner_id = $2
         or exists (
           select 1 from event_vendors ev
            where ev.event_id = e.id and $1::uuid is not null and ev.organization_id = $1
         )
      order by e.created_at desc
      limit 25`,
    [orgId, userId, isAdmin(actor)],
  );

  if (events.length) {
    oppInputs.events = [];
    for (const e of events) {
      const sponsorCount = await q1<{ n: number }>(
        `select count(*)::int as n from event_vendors where event_id = $1 and role = 'sponsor'`,
        [e.id],
      );
      oppInputs.events.push({
        eventId: e.id,
        name: e.name,
        eventType: e.type,
        guestCount: e.guest_count,
        budget: e.budget,
        hasSponsors: (sponsorCount?.n ?? 0) > 0,
      });
    }
  }

  // ---- open projects + preferred requests for vendor / planner roles -------
  if (role === "vendor" || role === "planner") {
    const openProjects = await q<{ id: string; name: string | null; type: string | null; budget: number | null }>(
      `select id, name, type, budget from events
        where status in ('vendor_bidding','quotes_received','inquiry')
        order by created_at desc limit 25`,
      [],
    );
    oppInputs.openProjects = openProjects.map((p) => ({
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
        limit 25`,
      [orgId],
    );
    oppInputs.preferredRequests = reqs.map((r) => ({
      venueId: r.venue_id,
      venueName: r.venue_name,
      tier: r.tier,
    }));
  }

  // ---- run the existing opportunity engine ---------------------------------
  const opportunities = generateOpportunities({ orgId, userId }, role, oppInputs);

  // ---- war-room risk rollup across the actor's events (IDOR-safe runScan) --
  const risks: NonNullable<BriefingInputs["risks"]> = [];
  for (const e of events.slice(0, 12)) {
    try {
      const scan = await runScan(actor, e.id);
      for (const a of scan.alerts) {
        if (a.status !== "open") continue;
        risks.push({
          eventId: e.id,
          eventName: e.name,
          code: a.code,
          severity: a.severity,
          message: a.message,
          recommendation: a.recommendation,
        });
      }
    } catch {
      // runScan gates on getEvent; skip any event the actor cannot scan.
    }
  }

  // ---- approvals + follow-ups + contracts expiring (org-scoped reads) ------
  const approvals: NonNullable<BriefingInputs["approvals"]> = [];
  const followUps: NonNullable<BriefingInputs["followUps"]> = [];
  const contractsExpiring: NonNullable<BriefingInputs["contractsExpiring"]> = [];

  if (orgId || isAdmin(actor)) {
    // Pending document approvals owned by the org.
    const pendingDocs = await q1<{ n: number }>(
      `select count(*)::int as n from documents
        where approval_status = 'pending'
          and ($1::uuid is null or organization_id = $1)`,
      [orgId],
    );
    if ((pendingDocs?.n ?? 0) > 0) {
      approvals.push({ label: "Documents pending approval", count: pendingDocs!.n, ref: { kind: "documents" } });
    }

    // Overdue invoices for the org -> follow-ups + an approval-style queue.
    const overdue = await q1<{ n: number; amt: number }>(
      `select count(*)::int as n, coalesce(sum(coalesce(balance_due,0)),0)::float8 as amt
         from invoices
        where status = 'overdue'
          and ($1::uuid is null or organization_id = $1)`,
      [orgId],
    );
    if ((overdue?.n ?? 0) > 0) {
      followUps.push({
        title: `${overdue!.n} overdue invoice${overdue!.n === 1 ? "" : "s"} ($${Math.round(overdue!.amt).toLocaleString()} outstanding)`,
        detail: "Chase payment to recover outstanding balance.",
        ref: { kind: "overdue_invoices" },
      });
    }

    // Quotes sent but not yet accepted/declined -> follow-ups.
    const staleQuotes = await q1<{ n: number }>(
      `select count(*)::int as n
         from quotes qt
         left join events e on e.id = qt.event_id
        where qt.status in ('submitted','viewed','revision_requested')
          and ($1::uuid is null or e.organization_id = $1)`,
      [orgId],
    );
    if ((staleQuotes?.n ?? 0) > 0) {
      followUps.push({
        title: `${staleQuotes!.n} quote${staleQuotes!.n === 1 ? "" : "s"} awaiting a response`,
        detail: "Follow up to move quotes toward acceptance.",
        ref: { kind: "stale_quotes" },
      });
    }

    // Contract pricing agreements expiring within 60 days.
    const contracts = await q<{ id: string; partner_type: string | null; end_date: string | null }>(
      `select id, partner_type, end_date
         from contract_pricing
        where status = 'active'
          and end_date is not null
          and end_date >= now()::date
          and end_date < (now() + interval '60 days')::date
          and ($1::uuid is null or partner_a_org = $1 or partner_b_org = $1)
        order by end_date asc
        limit 25`,
      [orgId],
    );
    for (const c of contracts) {
      contractsExpiring.push({
        title: `${c.partner_type ?? "Partner"} contract pricing expiring`,
        daysUntil: daysUntil(c.end_date),
        ref: { contract_id: c.id },
      });
    }

    // Documents (insurance / permits) approaching expiry within 30 days.
    const expiringDocs = await q<{ id: string; document_type: string | null; expiration_date: string | null }>(
      `select id, document_type, expiration_date
         from documents
        where expiration_date is not null
          and expiration_date >= now()
          and expiration_date < now() + interval '30 days'
          and ($1::uuid is null or organization_id = $1)
        order by expiration_date asc
        limit 25`,
      [orgId],
    );
    for (const d of expiringDocs) {
      contractsExpiring.push({
        title: `${d.document_type ?? "Document"} expiring`,
        daysUntil: daysUntil(d.expiration_date),
        ref: { document_id: d.id },
      });
    }
  }

  // ---- partnership matches (existing partnershipMatch engine) --------------
  const partnerships: NonNullable<BriefingInputs["partnerships"]> = [];
  if (venues.length) {
    // For the org's primary venue, match candidate vendors (location/category/
    // capacity/review). Cross-org candidate read, scored deterministically.
    const source = venues[0];
    const candidates = await q<{
      id: string;
      category: string | null;
      city: string | null;
      region: string | null;
      review_score: number | null;
      subcategories: string[] | null;
    }>(
      `select v.id, v.category, o.id as org_id, v.review_score, v.subcategories,
              null::text as city, null::text as region
         from vendors v
         join organizations o on o.id = v.organization_id
        where ($1::uuid is null or v.organization_id <> $1)
          and coalesce(v.status, 'active') <> 'suspended'
        order by coalesce(v.review_score, 0) desc
        limit 40`,
      [orgId],
    );
    const srcEntity: MatchEntity = {
      id: source.id,
      kind: "venue",
      name: source.name,
      city: source.city,
      region: source.region,
      capacity: source.capacity,
      review_score: source.review_score,
    };
    const candEntities: MatchEntity[] = candidates.map((c) => ({
      id: c.id,
      kind: "vendor",
      category: c.category,
      capabilities: Array.isArray(c.subcategories) ? c.subcategories : null,
      review_score: c.review_score,
    }));
    if (candEntities.length) {
      const matches = match("venue", source.id, "vendor", { source: srcEntity, candidates: candEntities });
      for (const m of matches.slice(0, 6)) {
        if (m.score <= 0) continue;
        partnerships.push({
          title: `${m.candidate.category ?? "Vendor"} for ${source.name ?? "your venue"}`,
          score: m.score,
          reasons: m.reasons,
          ref: { vendor_id: m.candidate.id, venue_id: source.id },
        });
      }
    }
  }

  return assembleBriefing({
    name: actor.user.name ?? null,
    hour: new Date().getHours(),
    opportunities,
    risks,
    approvals,
    followUps,
    contractsExpiring,
    sponsorships,
    partnerships,
  });
}

// ============================================================================
// coo_tasks: list / generate / setStatus  (audience-scoped, IDOR-safe)
// ============================================================================

export type CooTaskRow = {
  id: string;
  audience_org_id: string | null;
  audience_user_id: string | null;
  title: string;
  action_type: string | null;
  detail: unknown;
  impact_score: number | null;
  status: "open" | "done" | "dismissed";
  due_at: string | null;
  source: string | null;
  created_at: string;
};

const TASK_STATUS = new Set<CooTaskRow["status"]>(["open", "done", "dismissed"]);

export const tasks = {
  /**
   * The actor's task feed: rows targeted at their user or org, plus (for staff)
   * the full feed. Open first, then by impact descending.
   */
  async listForActor(
    actor: Actor,
    opts: { status?: string | null; limit?: number } = {},
  ): Promise<CooTaskRow[]> {
    const cap = Math.max(1, Math.min(500, Number.isFinite(opts.limit) ? Number(opts.limit) : 100));
    const status =
      opts.status === "done" || opts.status === "dismissed" || opts.status === "open"
        ? opts.status
        : null;

    if (isAdmin(actor)) {
      return q<CooTaskRow>(
        `select * from coo_tasks
          where ($1::text is null or status = $1)
          order by (status = 'open') desc, impact_score desc, created_at desc
          limit $2`,
        [status, cap],
      );
    }

    const myOrg = actor.org?.id ?? null;
    const myUser = actor.user.id;
    return q<CooTaskRow>(
      `select * from coo_tasks
        where ($1::text is null or status = $1)
          and (audience_user_id = $2 or ($3::uuid is not null and audience_org_id = $3))
        order by (status = 'open') desc, impact_score desc, created_at desc
        limit $4`,
      [status, myUser, myOrg, cap],
    );
  },

  /**
   * Assemble the actor's briefing, build ranked tasks, and replace the actor's
   * prior open generated tasks (so the list does not accumulate duplicates).
   * Done / dismissed tasks are left untouched. Returns the inserted rows.
   */
  async generate(actor: Actor): Promise<CooTaskRow[]> {
    const briefing = await gatherBriefing(actor);
    const rows = buildTasksFromBriefing(briefing);

    const myOrg = actor.org?.id ?? null;
    const myUser = actor.user.id;

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `delete from coo_tasks
          where status = 'open'
            and source = 'coo_briefing'
            and (
              ($1::uuid is not null and audience_org_id = $1)
              or (audience_org_id is null and audience_user_id = $2)
            )`,
        [myOrg, myUser],
      );
      const inserted: CooTaskRow[] = [];
      for (const t of rows) {
        const row = (
          await client.query(
            `insert into coo_tasks
               (audience_org_id, audience_user_id, title, action_type, detail,
                impact_score, status, due_at, source)
             values ($1,$2,$3,$4,$5,$6,'open',$7,$8)
             returning *`,
            [
              myOrg,
              myOrg == null ? myUser : null,
              t.title,
              t.action_type,
              jsonbParam(t.detail),
              t.impact_score,
              t.due_at,
              t.source,
            ],
          )
        ).rows[0] as CooTaskRow;
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
  },

  /** Set a task's disposition (done / dismissed / open), audience-scoped. */
  async setStatus(actor: Actor, id: string, status: string): Promise<CooTaskRow> {
    if (!TASK_STATUS.has(status as CooTaskRow["status"])) {
      throw new ForbiddenError("invalid status");
    }
    const row = await q1<CooTaskRow>(`select * from coo_tasks where id = $1`, [id]);
    if (!row) throw new NotFoundError("task not found");
    if (!isAdmin(actor)) {
      const myOrg = actor.org?.id ?? null;
      const myUser = actor.user.id;
      const visible =
        row.audience_user_id === myUser || (myOrg != null && row.audience_org_id === myOrg);
      if (!visible) throw new ForbiddenError("no access to this task");
    }
    const updated = await q1<CooTaskRow>(
      `update coo_tasks set status = $2 where id = $1 returning *`,
      [id, status],
    );
    return updated as CooTaskRow;
  },
};
