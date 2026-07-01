/**
 * Intelligence Moat - data-access for F7 (Founding Member Performance Center)
 * and F11 (Attendee Intelligence). Mirrors server/src/db/event-intel.ts
 * conventions: org-scoped, IDOR-safe, pool q/q1 helpers, no score math (that
 * lives in the pure modules lib/foundingMember.ts + lib/attendeeIntel.ts).
 *
 * F7 founding member:
 *   - getFoundingMember / setFoundingMember : read + upsert the founding_members
 *     row for an org (db/schema-im-member-attendee.sql). An actor may only
 *     read / set status for their OWN org unless they are an admin.
 *   - gatherPerformance : aggregates raw performance metrics for an org from
 *     the existing tables. Org access is enforced first.
 *
 *     Tables aggregated for performance (confirmed against db/schema.sql + phase
 *     files):
 *       - vendors                (organization_id, review_score) -> org's vendor id + avg review
 *       - invoices / payments    (organization_id / invoice_id)  -> revenue + commissions
 *       - quotes                 (vendor_id, status, created_at)  -> quotes issued, wins, response
 *       - events                 (organization_id, status)        -> active engagements, projects won
 *       - platform_invites       (inviter_org_id, status)         -> referrals (accepted)
 *       - event_inquiries        (vendor_id)                      -> inbound leads
 *       - preferred_vendors      (vendor_id)                      -> savings proxy (preferred pricing)
 *
 * F11 attendee:
 *   - upsertAttendeeEngagement : write per-registration engagement counters for
 *     an event (event access-checked via the events repo, IDOR-safe).
 *   - gatherAttendeeAnalytics  : join event_registrations + attendee_engagement
 *     for an event (access-checked) and feed the pure analytics computer.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";
import {
  computePerformance,
  normalizeBenefits,
  DEFAULT_FOUNDING_BENEFITS,
  type Performance,
  type FoundingBenefits,
} from "../lib/foundingMember.js";
import {
  computeAttendeeAnalytics,
  type AttendeeAnalytics,
  type RegistrationLike,
  type EngagementLike,
} from "../lib/attendeeIntel.js";

// ============================================================================
// F7 Founding Member
// ============================================================================

export type FoundingMemberRow = {
  id: string;
  org_id: string;
  is_founding: boolean;
  benefits: unknown;
  joined_at: string;
};

export type FoundingMemberStatus = {
  orgId: string;
  isFounding: boolean;
  benefits: FoundingBenefits;
  joinedAt: string | null;
};

/** True when the actor may act on this org (their own org, or an admin). */
function canActOnOrg(actor: Actor, orgId: string): boolean {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  return !!actor.org && actor.org.id === orgId;
}

/** Resolve the org id the actor is operating on (defaults to their own org). */
function resolveOrgId(actor: Actor, requested?: string | null): string {
  const orgId = requested && requested.trim() ? requested.trim() : actor.org?.id;
  if (!orgId) throw new ForbiddenError("no organization in context");
  if (!canActOnOrg(actor, orgId)) throw new ForbiddenError("no access to organization");
  return orgId;
}

/** Read the founding-member status for an org (access-checked). */
export async function getFoundingMember(
  actor: Actor,
  orgId?: string | null,
): Promise<FoundingMemberStatus> {
  const id = resolveOrgId(actor, orgId);
  const row = await q1<FoundingMemberRow>(
    `select id, org_id, is_founding, benefits, joined_at
       from founding_members where org_id = $1`,
    [id],
  );
  return {
    orgId: id,
    isFounding: row ? !!row.is_founding : false,
    benefits: row ? normalizeBenefits(row.benefits) : { ...DEFAULT_FOUNDING_BENEFITS },
    joinedAt: row?.joined_at ?? null,
  };
}

/** Upsert the founding-member status for an org (access-checked). */
export async function setFoundingMember(
  actor: Actor,
  input: { orgId?: string | null; isFounding?: boolean; benefits?: unknown },
): Promise<FoundingMemberStatus> {
  const id = resolveOrgId(actor, input.orgId);
  const isFounding = input.isFounding === undefined ? true : !!input.isFounding;
  const benefits = normalizeBenefits(input.benefits);
  const row = await q1<FoundingMemberRow>(
    `insert into founding_members (org_id, is_founding, benefits)
       values ($1, $2, $3::jsonb)
     on conflict (org_id) do update set
       is_founding = excluded.is_founding,
       benefits = excluded.benefits
     returning id, org_id, is_founding, benefits, joined_at`,
    [id, isFounding, JSON.stringify(benefits)],
  );
  return {
    orgId: id,
    isFounding: !!row?.is_founding,
    benefits: normalizeBenefits(row?.benefits),
    joinedAt: row?.joined_at ?? null,
  };
}

/**
 * Aggregate the raw performance metrics for an org from the existing tables,
 * then run the pure scorer. Access-checked via resolveOrgId.
 */
export async function gatherPerformance(
  actor: Actor,
  orgId?: string | null,
): Promise<{ orgId: string; metrics: ReturnType<typeof rawMetricsShape>; performance: Performance }> {
  const id = resolveOrgId(actor, orgId);

  // The org's vendor id (if any). Quotes / inquiries / preferred status are
  // keyed by vendor_id, while revenue is keyed by organization_id.
  const vendorRow = await q1<{ id: string; review_score: string | null }>(
    `select id, review_score from vendors where organization_id = $1 limit 1`,
    [id],
  );
  const vendorId = vendorRow?.id ?? null;
  const reviewScore = Number(vendorRow?.review_score ?? 0) || 0;

  // Revenue + commissions: completed payments on invoices owned by the org.
  const revenueRow = await q1<{ revenue: string | null; commissions: string | null }>(
    `select coalesce(sum(p.amount), 0) as revenue,
            coalesce(sum(p.platform_fee), 0) as commissions
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.organization_id = $1
        and p.status in ('succeeded','paid','captured','payment_received')`,
    [id],
  );
  const revenueGenerated = Number(revenueRow?.revenue ?? 0) || 0;
  const commissions = Number(revenueRow?.commissions ?? 0) || 0;

  // Quotes issued + projects won (accepted/converted) + response time.
  let quotes = 0;
  let projectsWon = 0;
  let responseTimeHours = 0;
  if (vendorId) {
    const quoteRow = await q1<{ total: number; won: number }>(
      `select count(*)::int as total,
              count(*) filter (where status in ('accepted','converted'))::int as won
         from quotes where vendor_id = $1`,
      [vendorId],
    );
    quotes = quoteRow?.total ?? 0;
    projectsWon = quoteRow?.won ?? 0;

    // Median-ish response time: average hours from a quote's bid creation to
    // the quote being generated/submitted. We approximate with the average
    // hours since quote creation for non-draft quotes (deterministic proxy).
    const respRow = await q1<{ hrs: string | null }>(
      `select coalesce(avg(extract(epoch from (now() - created_at)) / 3600.0), 0) as hrs
         from quotes
        where vendor_id = $1 and status <> 'draft'`,
      [vendorId],
    );
    responseTimeHours = Number(respRow?.hrs ?? 0) || 0;
  }

  // Referrals: accepted platform invites this org sent.
  const referralRow = await q1<{ n: number }>(
    `select count(*)::int as n from platform_invites
      where inviter_org_id = $1 and status = 'accepted'`,
    [id],
  );
  const referrals = referralRow?.n ?? 0;

  // Inbound leads: event inquiries routed to this org's vendor.
  let leads = 0;
  let savings = 0;
  if (vendorId) {
    const leadRow = await q1<{ n: number }>(
      `select count(*)::int as n from event_inquiries where vendor_id = $1`,
      [vendorId],
    );
    leads = leadRow?.n ?? 0;

    // Savings proxy: preferred-vendor relationships unlock preloaded pricing.
    // Count them as a modest per-relationship savings signal.
    const prefRow = await q1<{ n: number }>(
      `select count(*)::int as n from preferred_vendors where vendor_id = $1`,
      [vendorId],
    );
    savings = (prefRow?.n ?? 0) * 500; // deterministic placeholder unit
  }

  // Active engagements + projects won via events the org owns.
  const eventRow = await q1<{ active: number; completed: number }>(
    `select count(*) filter (where status not in ('closed','archived'))::int as active,
            count(*) filter (where status in ('completed','closed'))::int as completed
       from events where organization_id = $1`,
    [id],
  );
  const activeEngagements = eventRow?.active ?? 0;
  // Fold completed owned-events into projectsWon (in addition to accepted quotes).
  projectsWon += eventRow?.completed ?? 0;

  // Marketplace rank: rank this org's vendor among all vendors by review_score
  // (1 = best). 0 when the org has no vendor profile or no score.
  let marketplaceRank = 0;
  if (vendorId) {
    // Rank = 1 + number of vendors with a strictly higher review_score.
    // Deterministic, index-friendly, and avoids window-function casts.
    const rankRow = await q1<{ rnk: string | null }>(
      `select 1 + count(*) as rnk
         from vendors
        where coalesce(review_score, 0) > $1`,
      [reviewScore],
    );
    marketplaceRank = Number(rankRow?.rnk ?? 0) || 0;
  }

  const metrics = rawMetricsShape({
    revenueGenerated,
    referrals,
    leads,
    quotes,
    projectsWon,
    commissions,
    savings,
    marketplaceRank,
    responseTimeHours,
    reviewScore,
    activeEngagements,
  });

  return { orgId: id, metrics, performance: computePerformance(metrics) };
}

/** Identity passthrough that also documents the metric shape. */
function rawMetricsShape(m: {
  revenueGenerated: number;
  referrals: number;
  leads: number;
  quotes: number;
  projectsWon: number;
  commissions: number;
  savings: number;
  marketplaceRank: number;
  responseTimeHours: number;
  reviewScore: number;
  activeEngagements: number;
}) {
  return m;
}

// ============================================================================
// F11 Attendee Intelligence
// ============================================================================

export type AttendeeEngagementInput = {
  registrationId: string;
  boothVisits?: number;
  qrScans?: number;
  sponsorInteractions?: number;
  sessionsAttended?: number;
  leads?: number;
  surveyResponse?: unknown;
};

export type AttendeeEngagementRow = {
  id: string;
  event_id: string;
  registration_id: string | null;
  booth_visits: number;
  qr_scans: number;
  sponsor_interactions: number;
  sessions_attended: number;
  leads: number;
  survey_response: unknown;
  updated_at: string;
};

const intOrZero = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

/**
 * Upsert the engagement counters for one registration of an event. Event
 * access is gated by getEvent (throws NotFound/Forbidden), and the registration
 * is verified to belong to that event, so a forged or foreign id is rejected.
 */
export async function upsertAttendeeEngagement(
  actor: Actor,
  eventId: string,
  input: AttendeeEngagementInput,
): Promise<AttendeeEngagementRow> {
  await getEvent(actor, eventId); // access gate (IDOR-safe)

  // The registration must belong to this event.
  const reg = await q1<{ id: string }>(
    `select id from event_registrations where id = $1 and event_id = $2`,
    [input.registrationId, eventId],
  );
  if (!reg) throw new ForbiddenError("registration not in event");

  const row = await q1<AttendeeEngagementRow>(
    `insert into attendee_engagement
       (event_id, registration_id, booth_visits, qr_scans, sponsor_interactions,
        sessions_attended, leads, survey_response, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
     on conflict (event_id, registration_id) do update set
       booth_visits = excluded.booth_visits,
       qr_scans = excluded.qr_scans,
       sponsor_interactions = excluded.sponsor_interactions,
       sessions_attended = excluded.sessions_attended,
       leads = excluded.leads,
       survey_response = excluded.survey_response,
       updated_at = now()
     returning id, event_id, registration_id, booth_visits, qr_scans,
               sponsor_interactions, sessions_attended, leads, survey_response, updated_at`,
    [
      eventId,
      input.registrationId,
      intOrZero(input.boothVisits),
      intOrZero(input.qrScans),
      intOrZero(input.sponsorInteractions),
      intOrZero(input.sessionsAttended),
      intOrZero(input.leads),
      input.surveyResponse == null ? null : JSON.stringify(input.surveyResponse),
    ],
  );
  return row as AttendeeEngagementRow;
}

/**
 * Join the event's registrations + engagement rows and run the pure analytics
 * computer. Access-checked via getEvent.
 */
export async function gatherAttendeeAnalytics(
  actor: Actor,
  eventId: string,
): Promise<{ eventId: string; analytics: AttendeeAnalytics }> {
  await getEvent(actor, eventId); // access gate (IDOR-safe)

  const registrations = await q<RegistrationLike>(
    `select rsvp_status, checked_in from event_registrations where event_id = $1`,
    [eventId],
  );
  const engagement = await q<EngagementLike>(
    `select booth_visits, qr_scans, sponsor_interactions, sessions_attended, leads, survey_response
       from attendee_engagement where event_id = $1`,
    [eventId],
  );

  return { eventId, analytics: computeAttendeeAnalytics(registrations, engagement) };
}
