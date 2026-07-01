/**
 * Divini AI COO V2 - Business Health + Event Risk data-access layer
 * (AI-COO-V2-ROADMAP.md section 3).
 *
 * Org-scoped, IDOR-safe aggregation behind the org-level executive Business
 * Health Score and the portfolio Event Risk rollup. The score is an AGGREGATE:
 * this repo gathers signals from the tables the platform already maintains for
 * the ACTOR'S OWN ORG, hands them to the pure computeBusinessHealth
 * (server/src/lib/businessHealth.ts), and persists the result in
 * business_health_scores so reads are a single cached lookup.
 *
 * Tables aggregated (all scoped to the actor's organization):
 *   - events     : throughput, live pipeline, won/total bookings, repeat clients
 *                  (events.organization_id = the org).
 *   - quotes     : open pipeline + accepted share (scoped via the parent event's
 *                  organization_id, since quotes carry no org column).
 *   - invoices   : paid revenue + overdue/disputed penalty
 *                  (invoices.organization_id = the org).
 *   - payments   : collected revenue (payments -> invoices of the org).
 *   - platform_invites : referral / network growth (inviter_org_id = the org).
 *   - contract_pricing : active partnership contracts (partner_a_org / partner_b_org).
 *   - vendor_readiness : response/quote speed for the org's vendors.
 *   - vendor_compliance: compliance coverage for the org's vendors.
 *
 * This is an ORG-LEVEL score, DISTINCT from the per-entity Divini Score
 * (db/divini-score.ts). It does NOT touch divini_scores.
 *
 * The Event Risk rollup REUSES the existing per-event war-room scanner without
 * re-implementing any alert math: rollupOrgEventRisk lists the org's active
 * (non-terminal) events, runs each one through server/src/db/warroom.runScan
 * (which is itself IDOR-safe via the events repo getEvent), and hands the
 * resulting alert arrays to the pure lib/eventRiskRollup.rollupEventRisk.
 *
 * Authorization: every entry point requires the actor to belong to an org and
 * operates only on that org's id, so a forged id cannot widen the tenant
 * boundary. runScan additionally re-checks access per event.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { listMyEvents } from "./events.js";
import { runScan } from "./warroom.js";
import {
  computeBusinessHealth,
  type BusinessHealthSignals,
  type BusinessHealthResult,
} from "../lib/businessHealth.js";
import {
  rollupEventRisk,
  type PerEventScan,
  type EventRiskRollupResult,
} from "../lib/eventRiskRollup.js";

// ---- Row + view types -------------------------------------------------------

export type BusinessHealthRow = {
  id: string;
  org_id: string;
  score: number;
  components: unknown;
  recommendations: unknown;
  updated_at: string;
};

export type BusinessHealthView = {
  org_id: string;
  score: number;
  components: BusinessHealthResult["components"];
  recommendations: BusinessHealthResult["recommendations"];
  signals: BusinessHealthSignals;
  updated_at: string | null;
};

// ---- Numeric helpers --------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** A count/amount saturated to [0, 1] at `sat`. */
function saturate(value: number, sat: number): number {
  if (sat <= 0) return 0;
  return clamp01(value / sat);
}

// ---- Authorization ----------------------------------------------------------

/** Resolve the actor's own org id, or throw. This score is per the actor's org. */
function requireOrgId(actor: Actor): string {
  const orgId = actor.org?.id ?? null;
  if (!orgId) throw new ForbiddenError("an organization is required for the Business Health Score");
  return orgId;
}

// ---- Signal gathering -------------------------------------------------------

/**
 * Aggregate the org's signals from the existing tables into the pre-normalized
 * BusinessHealthSignals bag. Read-only; authorization is the caller's job
 * (every public entry resolves the actor's own org first). Degrades gracefully:
 * an org with no data yields all-zero signals (score 0), never throws.
 */
export async function gatherOrgSignals(actor: Actor): Promise<BusinessHealthSignals> {
  const orgId = requireOrgId(actor);

  // ---- events: throughput, pipeline, bookings, retention -------------------
  const TERMINAL = "('completed','closed','archived')";
  const WON = "('vendor_selected','deposit_due','in_production','install_scheduled','itinerary_confirmed','event_day','completed','closed','archived')";
  const evt = await q1<{
    total: string | null;
    recent: string | null;
    live: string | null;
    won: string | null;
  }>(
    `select
        count(*)                                                              as total,
        count(*) filter (where created_at >= now() - interval '90 days')      as recent,
        count(*) filter (where status is null or status not in ${TERMINAL})   as live,
        count(*) filter (where status in ${WON})                              as won
       from events where organization_id = $1`,
    [orgId],
  );
  // Repeat clients: clients who booked this org more than once.
  const repeat = await q1<{ repeats: string | null; clients: string | null }>(
    `select
        count(*) filter (where c > 1) as repeats,
        count(*)                      as clients
       from (
         select client_id, count(*) c
           from events
          where organization_id = $1 and client_id is not null
          group by client_id
       ) t`,
    [orgId],
  );

  // ---- quotes: pipeline + accepted share (scoped via the parent event) -----
  const quote = await q1<{ total: string | null; open: string | null; accepted: string | null; recent: string | null }>(
    `select
        count(*)                                                                          as total,
        count(*) filter (where q.status in ('generated','submitted','viewed','revised','revision_requested')) as open,
        count(*) filter (where q.status in ('accepted','converted'))                      as accepted,
        count(*) filter (where q.created_at >= now() - interval '90 days')                as recent
       from quotes q
       join events e on e.id = q.event_id
      where e.organization_id = $1`,
    [orgId],
  );

  // ---- invoices: paid revenue + overdue/disputed penalty -------------------
  const inv = await q1<{
    total: string | null;
    bad: string | null;
    recent: string | null;
    paid_amount: string | null;
  }>(
    `select
        count(*)                                                          as total,
        count(*) filter (where status in ('overdue','disputed'))          as bad,
        count(*) filter (where created_at >= now() - interval '90 days')  as recent,
        coalesce(sum(total) filter (where status in
          ('paid','closed','partially_paid','deposit_paid')), 0)          as paid_amount
       from invoices where organization_id = $1`,
    [orgId],
  );
  // Collected revenue (recorded payments against the org's invoices).
  const pay = await q1<{ collected: string | null }>(
    `select coalesce(sum(p.amount), 0) as collected
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.organization_id = $1
        and (p.status is null or p.status not in ('refunded','disputed'))`,
    [orgId],
  );

  // ---- platform_invites: referral / network growth ------------------------
  const invite = await q1<{ sent: string | null; accepted: string | null }>(
    `select
        count(*)                                       as sent,
        count(*) filter (where status = 'accepted')    as accepted
       from platform_invites where inviter_org_id = $1`,
    [orgId],
  );

  // ---- contract_pricing: active partnership contracts ----------------------
  const contract = await q1<{ active: string | null }>(
    `select count(*) as active
       from contract_pricing
      where (partner_a_org = $1 or partner_b_org = $1)
        and (status is null or status = 'active')
        and (end_date is null or end_date >= current_date)`,
    [orgId],
  );

  // ---- vendor_readiness: response/quote speed across the org's vendors -----
  const readiness = await q1<{ avg_speed: string | null; n: string | null }>(
    `select
        avg((coalesce(vr.response_speed, 0) + coalesce(vr.quote_speed, 0)) / 2.0) as avg_speed,
        count(*) as n
       from vendor_readiness vr
       join vendors v on v.id = vr.vendor_id
      where v.organization_id = $1`,
    [orgId],
  );

  // ---- vendor_compliance: compliance coverage across the org's vendors -----
  const compliance = await q1<{ avg_score: string | null; n: string | null }>(
    `select avg(vc.score) as avg_score, count(*) as n
       from vendor_compliance vc
       join vendors v on v.id = vc.vendor_id
      where v.organization_id = $1`,
    [orgId],
  );

  // ---- normalize into the signal bag ---------------------------------------
  const evtTotal = num(evt?.total);
  const evtWon = num(evt?.won);
  const quoteTotal = num(quote?.total);
  const quoteAccepted = num(quote?.accepted);
  const invTotal = num(inv?.total);
  const invBad = num(inv?.bad);
  const clients = num(repeat?.clients);
  const repeats = num(repeat?.repeats);

  // Contract health: accepted-quote share minus the bad-invoice share.
  const acceptedShare = quoteTotal > 0 ? quoteAccepted / quoteTotal : 0;
  const badShare = invTotal > 0 ? invBad / invTotal : 0;
  const contractHealth = clamp01(acceptedShare - badShare) * (quoteTotal > 0 || invTotal > 0 ? 1 : 0);

  // Referral strength blends accepted invites (heavier) with sent volume.
  const referralStrength = clamp01(
    saturate(num(invite?.accepted), 10) * 0.7 + saturate(num(invite?.sent), 25) * 0.3,
  );

  // Response speed: vendor_readiness speeds are stored on a 0-1 (or 0-100) basis;
  // treat >1 as a 0-100 value and normalize, else use as a unit fraction.
  const rawSpeed = num(readiness?.avg_speed);
  const responseSpeed = num(readiness?.n) > 0 ? clamp01(rawSpeed > 1 ? rawSpeed / 100 : rawSpeed) : 0;

  // Compliance: vendor_compliance.score is 0-100.
  const complianceCov = num(compliance?.n) > 0 ? clamp01(num(compliance?.avg_score) / 100) : 0;

  return {
    // Revenue: collected payments first, falling back to paid-invoice totals.
    revenue: saturate(Math.max(num(pay?.collected), num(inv?.paid_amount)), 500_000),
    // Activity: trailing-90-day event + quote + invoice volume, saturating.
    activity: saturate(num(evt?.recent) + num(quote?.recent) + num(inv?.recent), 40),
    // Pipeline: open quotes + live events, saturating.
    pipeline: saturate(num(quote?.open) + num(evt?.live), 20),
    contracts: contractHealth,
    referrals: referralStrength,
    // Bookings: won events / total events.
    bookings: evtTotal > 0 ? clamp01(evtWon / evtTotal) : 0,
    // Retention: repeat-client share.
    retention: clients > 0 ? clamp01(repeats / clients) : 0,
    response_speed: responseSpeed,
    compliance: complianceCov,
  };
}

// ---- Cache read / write -----------------------------------------------------

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/**
 * Get the cached Business Health Score for the actor's org, computing (without
 * persisting) a fresh value when no cached row exists yet so a first read never
 * returns null. Org-scoped + IDOR-safe (operates only on the actor's own org).
 */
export async function getHealth(actor: Actor): Promise<BusinessHealthView> {
  const orgId = requireOrgId(actor);
  const signals = await gatherOrgSignals(actor);
  const row = await q1<BusinessHealthRow>(
    `select * from business_health_scores where org_id = $1`,
    [orgId],
  );
  if (row) {
    const fresh = computeBusinessHealth(signals);
    return {
      org_id: orgId,
      score: row.score,
      components: parseJson(row.components, fresh.components),
      recommendations: parseJson(row.recommendations, fresh.recommendations),
      signals,
      updated_at: row.updated_at,
    };
  }
  const fresh = computeBusinessHealth(signals);
  return {
    org_id: orgId,
    score: fresh.score,
    components: fresh.components,
    recommendations: fresh.recommendations,
    signals,
    updated_at: null,
  };
}

/**
 * Recompute the Business Health Score for the actor's org from freshly-gathered
 * signals and persist it (upsert on org_id). Org-scoped + IDOR-safe. Returns
 * the stored view.
 */
export async function upsertHealth(actor: Actor): Promise<BusinessHealthView> {
  const orgId = requireOrgId(actor);
  const signals = await gatherOrgSignals(actor);
  const result = computeBusinessHealth(signals);

  const row = await q1<BusinessHealthRow>(
    `insert into business_health_scores (org_id, score, components, recommendations, updated_at)
       values ($1, $2, $3, $4, now())
     on conflict (org_id) do update set
        score = excluded.score,
        components = excluded.components,
        recommendations = excluded.recommendations,
        updated_at = now()
     returning *`,
    [orgId, result.score, JSON.stringify(result.components), JSON.stringify(result.recommendations)],
  );

  return {
    org_id: orgId,
    score: row?.score ?? result.score,
    components: parseJson(row?.components, result.components),
    recommendations: parseJson(row?.recommendations, result.recommendations),
    signals,
    updated_at: row?.updated_at ?? null,
  };
}

// ---- Event Risk rollup ------------------------------------------------------

/** Lifecycle statuses that are still "active" (not terminal) for risk scanning. */
const TERMINAL_EVENT_STATUSES = new Set(["completed", "closed", "archived"]);

/** Cap on how many events to scan in one rollup (war-room scan is per-event work). */
const MAX_SCAN_EVENTS = 50;

/**
 * Roll the org's active events up into a single portfolio risk picture. REUSES
 * the existing per-event scanner: lists the events the actor can access (via the
 * events repo, IDOR-safe), filters to active (non-terminal) events, runs each
 * through server/src/db/warroom.runScan, and hands the resulting alert arrays to
 * the pure lib/eventRiskRollup.rollupEventRisk. Never re-derives alert math.
 *
 * runScan re-checks access per event, so even if listMyEvents widened, a forged
 * event could not be scanned. Degrades gracefully: no events -> all-zero rollup.
 */
export async function rollupOrgEventRisk(actor: Actor): Promise<EventRiskRollupResult> {
  requireOrgId(actor);
  const events = await listMyEvents(actor);
  const active = events
    .filter((e) => !TERMINAL_EVENT_STATUSES.has(String(e.status ?? "")))
    .slice(0, MAX_SCAN_EVENTS);

  const scans: PerEventScan[] = [];
  for (const ev of active) {
    try {
      const result = await runScan(actor, ev.id);
      scans.push({
        eventId: ev.id,
        eventName: ev.name ?? null,
        alerts: result.alerts,
      });
    } catch {
      // Skip any event that cannot be scanned (access/data race); the rollup is
      // best-effort over the events that scan cleanly.
    }
  }

  return rollupEventRisk(scans);
}
