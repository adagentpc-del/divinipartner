/**
 * Divini AI COO V2 - Divini Command Center (data-access layer).
 *
 * ask(actor, questionKey) gathers the per-question inputs from the already-built
 * engines + existing tables (org / role scoped), then hands them to the pure
 * deterministic router (lib/commandCenter.answer) which shapes the structured
 * answer. No alert / leakage / match math lives here; this layer only loads and
 * authorizes data.
 *
 * IDOR posture (mirrors db/opportunity.ts, db/relationship.ts, db/warroom.ts):
 *   - Venue / event / sponsorship reads are constrained to the actor's org (a
 *     super_admin / admin may operate across the dataset).
 *   - Event war-room scans go through db/warroom.runScan, which is access-checked
 *     via getEvent (so a scan only runs against an event the actor can already
 *     see). We only scan events returned by the org-scoped event list.
 *   - Partnership / sponsorship marketplace candidates are inherently discoverable
 *     in the marketplace (same posture as routes/partnership-match.ts): the
 *     candidate pool is global by design, while private relationship-edge signal
 *     stays scoped to the actor's org.
 *
 * Server imports use .js per project convention.
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import {
  answer,
  type CommandAnswer,
  type CommandContext,
  type QuestionKey,
  type CtxOpportunity,
  type CtxLeak,
  type CtxPartnerMatch,
  type CtxSponsorship,
  type CtxOnboard,
  type CtxEventRisk,
} from "../lib/commandCenter.js";
import {
  generateOpportunities,
  type OpportunityRole,
  type OpportunityInputs,
} from "../lib/opportunityEngine.js";
import { scanVenue, scanEvent } from "../lib/revenueLeakage.js";
import { match, type MatchEntity } from "../lib/partnershipMatch.js";
import { runScan } from "./warroom.js";

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

function isStaff(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** The actor's opportunity-engine role (defaults to venue when unmapped). */
function actorRole(actor: Actor): OpportunityRole {
  const r = (actor.user.role ?? "").toLowerCase();
  if (r === "venue" || r === "vendor" || r === "planner" || r === "sponsor" || r === "client") {
    return r as OpportunityRole;
  }
  return "venue";
}

/** Extract a numeric price from a pricing jsonb blob ({amount|price}). */
function priceOf(pricing: unknown): number | null {
  if (!pricing || typeof pricing !== "object") return null;
  const rec = pricing as Record<string, unknown>;
  const v = Number(rec.amount ?? rec.price ?? 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Per-question input gatherers. Each loads exactly what the matching router
// branch consumes, scoped to the actor, and degrades to empty arrays.
// ---------------------------------------------------------------------------

/** focus_today: the actor's role-scoped opportunity feed (computed live). */
async function gatherOpportunities(actor: Actor): Promise<CtxOpportunity[]> {
  const role = actorRole(actor);
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;
  const inputs: OpportunityInputs = {};

  if (role === "venue" && orgId) {
    const venues = await q<{
      id: string;
      name: string | null;
      venue_type: string | null;
      capacity: number | null;
    }>(`select id, name, venue_type, capacity from venues where organization_id = $1 limit 50`, [orgId]);
    inputs.venues = [];
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
        `select count(*)::int as n from sponsorship_opportunities where venue_id = $1 and status = 'open'`,
        [v.id],
      );
      const reaches = inv
        .map((a) => num(a.audience_size ?? a.impression_estimate ?? 0))
        .filter((n) => n > 0);
      const avgReach = reaches.length ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length) : 0;
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
    );
    inputs.openProjects = openProjects.map((p) => ({
      eventId: p.id,
      name: p.name,
      category: p.type,
      budget: p.budget,
    }));
  }

  const generated = generateOpportunities({ orgId, userId }, role, inputs);
  return generated.map((g) => ({
    kind: g.kind,
    title: g.title,
    potential_value: g.potential_value,
    source: g.source,
  }));
}

/** losing_money: revenue-leakage scans for the org's venues + events. */
async function gatherLeaks(actor: Actor): Promise<CtxLeak[]> {
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;
  const staff = isStaff(actor);
  const out: CtxLeak[] = [];

  // Venues owned by the org (staff with no org scan a bounded global sample).
  const venues = await q<{
    id: string;
    name: string | null;
    capacity: number | null;
  }>(
    staff && !orgId
      ? `select id, name, capacity from venues order by created_at desc limit 25`
      : `select id, name, capacity from venues where organization_id = $1 limit 25`,
    staff && !orgId ? [] : [orgId],
  );
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
    const sponsorships = await q<{
      category: string | null;
      pricing: unknown;
      audience_size: number | null;
      impression_estimate: number | null;
      status: string | null;
    }>(
      `select category, pricing, audience_size, impression_estimate, status
         from sponsorship_opportunities where venue_id = $1`,
      [v.id],
    );
    const reaches = [...inv, ...sponsorships]
      .map((a) => num(a.audience_size ?? a.impression_estimate ?? 0))
      .filter((n) => n > 0);
    const avgReach = reaches.length ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length) : 0;
    const scan = scanVenue({
      venueId: v.id,
      audienceSize: avgReach || null,
      capacity: v.capacity ?? null,
      assets: [
        ...inv.map((it) => ({ category: it.category, value: priceOf(it.pricing), booked: false })),
        ...sponsorships.map((s) => ({
          category: s.category,
          value: priceOf(s.pricing),
          booked: s.status != null && s.status !== "open" && s.status !== "draft",
        })),
      ],
    });
    if (scan.missed > 0) {
      const top = scan.suggestions[0];
      out.push({
        scope: "venue",
        name: v.name,
        missed: scan.missed,
        topSuggestion: top ? { label: top.label, missed: top.missed } : null,
      });
    }
  }

  // Events the actor owns / plans / books.
  const events = await q<{
    id: string;
    name: string | null;
    guest_count: number | null;
    budget: number | null;
  }>(
    staff && !orgId
      ? `select id, name, guest_count, budget from events order by created_at desc limit 25`
      : `select id, name, guest_count, budget from events
           where ($1::uuid is not null and organization_id = $1)
              or client_id = $2 or planner_id = $2
           order by created_at desc limit 25`,
    staff && !orgId ? [] : [orgId, userId],
  );
  for (const e of events) {
    const sponsorCount = await q1<{ n: number }>(
      `select count(*)::int as n from event_vendors where event_id = $1 and role = 'sponsor'`,
      [e.id],
    );
    const scan = scanEvent({
      eventId: e.id,
      guestCount: e.guest_count,
      budget: e.budget,
      hasSponsors: (sponsorCount?.n ?? 0) > 0,
    });
    if (scan.missed > 0) {
      const top = scan.suggestions[0];
      out.push({
        scope: "event",
        name: e.name,
        missed: scan.missed,
        topSuggestion: top ? { label: top.label, missed: top.missed } : null,
      });
    }
  }

  return out;
}

/**
 * partnerships: rank vendor + sponsor candidates against the actor's primary
 * venue (the most common partnership source). Falls back gracefully when the
 * org owns no venue. Relationship-edge strength is org-scoped (IDOR-safe).
 */
async function gatherPartnerMatches(actor: Actor): Promise<CtxPartnerMatch[]> {
  const orgId = actor.org?.id ?? null;
  const venue = await q1<{
    id: string;
    name: string | null;
    city: string | null;
    region: string | null;
    venue_type: string | null;
    capacity: number | null;
    amenities: string[] | null;
    review_score: number | null;
  }>(
    orgId
      ? `select id, name, city, region, venue_type, capacity, amenities, review_score
           from venues where organization_id = $1 order by created_at desc limit 1`
      : `select id, name, city, region, venue_type, capacity, amenities, review_score
           from venues order by created_at desc limit 1`,
    orgId ? [orgId] : [],
  );
  if (!venue) return [];

  const source: MatchEntity = {
    id: venue.id,
    kind: "venue",
    name: venue.name ?? null,
    city: venue.city ?? null,
    region: venue.region ?? null,
    category: venue.venue_type ?? null,
    capabilities: Array.isArray(venue.amenities) ? venue.amenities : [],
    capacity: num(venue.capacity) || null,
    review_score: venue.review_score != null ? num(venue.review_score) : null,
  };

  // Edge strength + revenue scoped to the actor's org (private signal stays in-org).
  const edgeRows = await q<{ from_id: string; to_id: string; weight: number; revenue: number }>(
    `select from_id, to_id, weight, revenue from relationship_edges
      where ($1::uuid is null or organization_id = $1) and (from_id = $2 or to_id = $2)`,
    [orgId, venue.id],
  );
  const strength: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  for (const r of edgeRows) {
    const other = r.from_id === venue.id ? r.to_id : r.from_id;
    strength[other] = (strength[other] ?? 0) + num(r.weight);
    revenue[other] = (revenue[other] ?? 0) + num(r.revenue);
  }

  // Vendor candidates (with ecosystem revenue).
  const vendorRows = await q<{
    id: string;
    category: string | null;
    subcategories: string[] | null;
    review_score: number | null;
    revenue: number | null;
  }>(
    `select v.id, v.category, v.subcategories, v.review_score,
            coalesce(sum(case when iv.total is not null then iv.total else 0 end),0) as revenue
       from vendors v
       left join invoices iv on iv.vendor_id = v.id
      group by v.id order by v.id limit 200`,
  );
  const vendors: MatchEntity[] = vendorRows.map((v) => ({
    id: v.id,
    kind: "vendor",
    name: v.category ?? "Vendor",
    category: v.category ?? null,
    capabilities: Array.isArray(v.subcategories) ? v.subcategories : [],
    review_score: v.review_score != null ? num(v.review_score) : null,
    revenue: num(v.revenue) || null,
  }));

  // Sponsor candidates (open inventory).
  const sponsorRows = await q<{
    id: string;
    name: string | null;
    category: string | null;
    audience_size: number | null;
  }>(
    `select id, name, category, audience_size from sponsorship_opportunities
      where status = 'open' order by id limit 200`,
  );
  const sponsors: MatchEntity[] = sponsorRows.map((s) => ({
    id: s.id,
    kind: "sponsor",
    name: s.name ?? "Sponsorship",
    category: s.category ?? null,
    audience_size: num(s.audience_size) || null,
  }));

  const vendorMatches = match("venue", venue.id, "vendor", {
    source,
    candidates: vendors,
    edgeStrength: strength,
    edgeRevenue: revenue,
  })
    .slice(0, 6)
    .map((m) => ({ match: m, targetKind: "vendor" }));
  const sponsorMatches = match("venue", venue.id, "sponsor", {
    source,
    candidates: sponsors,
    edgeStrength: strength,
    edgeRevenue: revenue,
  })
    .slice(0, 6)
    .map((m) => ({ match: m, targetKind: "sponsor" }));

  return [...vendorMatches, ...sponsorMatches];
}

/** sponsorships: open sponsorship inventory on the org's venues, by reach. */
async function gatherSponsorships(actor: Actor): Promise<CtxSponsorship[]> {
  const orgId = actor.org?.id ?? null;
  const staff = isStaff(actor);
  const rows = await q<{
    id: string;
    name: string | null;
    category: string | null;
    audience_size: number | null;
    impression_estimate: number | null;
    venue_name: string | null;
  }>(
    staff && !orgId
      ? `select so.id, so.name, so.category, so.audience_size, so.impression_estimate, v.name as venue_name
           from sponsorship_opportunities so
           left join venues v on v.id = so.venue_id
          where so.status = 'open'
          order by coalesce(so.audience_size, so.impression_estimate, 0) desc limit 50`
      : `select so.id, so.name, so.category, so.audience_size, so.impression_estimate, v.name as venue_name
           from sponsorship_opportunities so
           left join venues v on v.id = so.venue_id
          where so.status = 'open'
            and ($1::uuid is not null and (so.organization_id = $1 or v.organization_id = $1))
          order by coalesce(so.audience_size, so.impression_estimate, 0) desc limit 50`,
    staff && !orgId ? [] : [orgId],
  );
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    audienceSize: num(s.audience_size ?? s.impression_estimate ?? 0) || null,
    venueName: s.venue_name,
  }));
}

/**
 * onboard_vendors: vendor gaps + match suggestions. Gaps come from the org's
 * events whose required_services are not yet filled by an attached vendor role;
 * each gap then surfaces the best ranked vendor for that capability.
 */
async function gatherOnboard(actor: Actor): Promise<CtxOnboard[]> {
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;
  const out: CtxOnboard[] = [];

  const events = await q<{
    id: string;
    name: string | null;
    required_services: string[] | null;
  }>(
    `select id, name, required_services from events
      where ($1::uuid is not null and organization_id = $1)
         or client_id = $2 or planner_id = $2
      order by created_at desc limit 40`,
    [orgId, userId],
  );

  // Vendor candidates pool (deterministic ranking via capability overlap).
  const vendorRows = await q<{
    id: string;
    category: string | null;
    subcategories: string[] | null;
    review_score: number | null;
  }>(`select id, category, subcategories, review_score from vendors order by id limit 300`);
  const vendors: MatchEntity[] = vendorRows.map((v) => ({
    id: v.id,
    kind: "vendor",
    name: v.category ?? "Vendor",
    category: v.category ?? null,
    capabilities: Array.isArray(v.subcategories) ? v.subcategories : [],
    review_score: v.review_score != null ? num(v.review_score) : null,
  }));

  for (const e of events) {
    const required = Array.isArray(e.required_services) ? e.required_services : [];
    if (required.length === 0) continue;
    const filledRows = await q<{ role: string | null }>(
      `select distinct role from event_vendors where event_id = $1 and role is not null`,
      [e.id],
    );
    const filled = new Set(filledRows.map((r) => (r.role ?? "").toLowerCase()));
    for (const svc of required) {
      const key = String(svc).toLowerCase();
      if (filled.has(key)) continue;
      // Best vendor for this capability via the deterministic matcher.
      const source: MatchEntity = {
        id: e.id,
        kind: "client",
        category: key,
        capabilities: [key],
      };
      const ranked = match("agency", e.id, "vendor", { source, candidates: vendors });
      const best = ranked[0];
      out.push({
        title: `${e.name ?? "Event"} needs ${svc}`,
        detail: best
          ? `Top candidate: ${best.candidate.name ?? "Vendor"} (${best.score}/100)`
          : "No matching vendor yet - a gap to onboard.",
        score: best?.score ?? null,
      });
    }
  }

  return out;
}

/**
 * risks_this_week / events_attention: war-room roll-up across the org's events.
 * Each scan is IDOR-safe (runScan -> getEvent access gate). We only scan events
 * the org-scoped list returns, capped to keep the call bounded.
 */
async function gatherEventRisks(actor: Actor): Promise<CtxEventRisk[]> {
  const orgId = actor.org?.id ?? null;
  const userId = actor.user.id;
  const staff = isStaff(actor);

  const events = await q<{ id: string; name: string | null }>(
    staff
      ? `select id, name from events
          where status not in ('completed','closed','archived')
          order by created_at desc limit 25`
      : `select distinct e.id, e.name from events e
          left join event_vendors ev on ev.event_id = e.id
         where (($1::uuid is not null and e.organization_id = $1)
             or e.client_id = $2 or e.planner_id = $2
             or ($1::uuid is not null and ev.organization_id = $1))
           and e.status not in ('completed','closed','archived')
         order by e.id limit 25`,
    staff ? [] : [orgId, userId],
  );

  const out: CtxEventRisk[] = [];
  for (const e of events) {
    try {
      const scan = await runScan(actor, e.id);
      const topAlert = scan.alerts.find((a) => a.status === "open")?.message ?? null;
      out.push({
        eventId: e.id,
        name: e.name,
        critical: scan.counts.critical,
        warning: scan.counts.warning,
        open: scan.counts.open,
        topAlert,
      });
    } catch {
      // Access gate or scan failure on a single event must not break the rollup.
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Answer one canned executive question for the actor. Gathers only the inputs
 * the matching router branch consumes (org / role scoped, IDOR-safe), then runs
 * the pure deterministic router. Returns the structured answer.
 */
export async function ask(actor: Actor, questionKey: QuestionKey): Promise<CommandAnswer> {
  const ctx: CommandContext = { role: actor.user.role ?? null };

  switch (questionKey) {
    case "focus_today":
      ctx.opportunities = await gatherOpportunities(actor);
      break;
    case "losing_money":
      ctx.leaks = await gatherLeaks(actor);
      break;
    case "partnerships":
      ctx.partnerMatches = await gatherPartnerMatches(actor);
      break;
    case "sponsorships":
      ctx.sponsorships = await gatherSponsorships(actor);
      break;
    case "onboard_vendors":
      ctx.onboard = await gatherOnboard(actor);
      break;
    case "risks_this_week":
    case "events_attention":
      ctx.eventRisks = await gatherEventRisks(actor);
      break;
    default:
      break;
  }

  return answer(questionKey, ctx);
}
