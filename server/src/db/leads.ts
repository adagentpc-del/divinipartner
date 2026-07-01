/**
 * Friction Elimination - Lead Quality Engine (U4) + Verified Lead Program (U5)
 * data-access layer.
 *
 * Backed by db/schema-fe-leads.sql (event_inquiries, verification_badges).
 *
 * Authorization mirrors server/src/db/venue-twin.ts: an inquiry targets a venue,
 * and a venue belongs to the organization that owns the underlying `venues` row
 * (venues.organization_id). A venue may read only the inquiries addressed to its
 * own venues (IDOR gate via assertVenueAccess); the inbox is therefore strictly
 * venue-scoped. Any signed-in user may submit an inquiry. Verification badges may
 * be set by an admin, or by the party that owns the subject (the venue's org for
 * a venue subject; the requester or the venue's org for an inquiry-bound subject).
 *
 * On create, the Lead Quality Engine (server/src/lib/leadQuality.ts)
 * computeLeadQuality derives the score + intent, which are persisted so the
 * inbox sorts by stored score without recomputing.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { computeLeadQuality, type LeadInquiry } from "../lib/leadQuality.js";

// ---- Row types --------------------------------------------------------------

export type EventInquiryRow = {
  id: string;
  venue_id: string | null;
  vendor_id: string | null;
  requester_user_id: string | null;
  event_type: string | null;
  budget_range: string | null;
  guest_count: number | null;
  date_range: unknown;
  decision_maker_name: string | null;
  company: string | null;
  timeline: string | null;
  message: string | null;
  lead_quality_score: number | null;
  intent: "high" | "medium" | "low" | null;
  created_at: string;
};

export type VerificationBadgeRow = {
  id: string;
  subject_type: BadgeSubjectType | null;
  subject_id: string | null;
  subject_ref: string | null;
  verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  evidence: unknown;
  created_at: string;
};

export type BadgeSubjectType = "budget" | "decision_maker" | "event" | "company" | "venue";
const BADGE_SUBJECT_TYPES = new Set<string>([
  "budget",
  "decision_maker",
  "event",
  "company",
  "venue",
]);
export function isBadgeSubjectType(v: unknown): v is BadgeSubjectType {
  return typeof v === "string" && BADGE_SUBJECT_TYPES.has(v);
}

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** Resolve the organization that owns a venue, or throw NotFound. */
async function venueOrgId(venueId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  return row.organization_id;
}

/**
 * Assert the actor may act on this venue (their org owns it, or admin). Throws
 * NotFoundError when the venue does not exist, ForbiddenError when it belongs to
 * another org. Returns the venue's owning org id.
 */
async function assertVenueAccess(actor: Actor, venueId: string): Promise<string | null> {
  const orgId = await venueOrgId(venueId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
  return orgId;
}

// ---- event_inquiries: create / list ----------------------------------------

export type CreateInquiryInput = {
  venue_id?: string | null;
  vendor_id?: string | null;
  event_type?: string | null;
  budget_range?: string | null;
  guest_count?: number | null;
  date_range?: unknown;
  decision_maker_name?: string | null;
  company?: string | null;
  timeline?: string | null;
  message?: string | null;
};

/** Bad-input error surfaced as a 400 by the route layer. */
export class BadRequestError extends Error {
  status = 400;
  constructor(msg = "bad request") {
    super(msg);
    this.name = "BadRequestError";
  }
}

/** Serialize an optional jsonb input; undefined stays undefined. */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function hasDateRange(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  return false;
}

/**
 * Create a qualified inquiry. The seven qualifying fields (event_type,
 * budget_range, guest_count, date_range, decision_maker_name, company, timeline)
 * are required; any missing one throws BadRequestError (400). venue_id is
 * required so the inquiry has an inbox. Computes + stores score and intent.
 */
export async function createInquiry(
  actor: Actor,
  input: CreateInquiryInput,
): Promise<EventInquiryRow> {
  if (!input.venue_id || typeof input.venue_id !== "string") {
    throw new BadRequestError("venue_id required");
  }
  // The venue must exist (a bad id is a 404 from venueOrgId). We do NOT require
  // org ownership here: any signed-in user may submit an inquiry to a venue.
  await venueOrgId(input.venue_id);

  const missing: string[] = [];
  if (!hasText(input.event_type)) missing.push("event_type");
  if (!hasText(input.budget_range)) missing.push("budget_range");
  if (!(typeof input.guest_count === "number" && input.guest_count > 0))
    missing.push("guest_count");
  if (!hasDateRange(input.date_range)) missing.push("date_range");
  if (!hasText(input.decision_maker_name)) missing.push("decision_maker_name");
  if (!hasText(input.company)) missing.push("company");
  if (!hasText(input.timeline)) missing.push("timeline");
  if (missing.length) {
    throw new BadRequestError(`missing required fields: ${missing.join(", ")}`);
  }

  const forScore: LeadInquiry = {
    event_type: input.event_type ?? null,
    budget_range: input.budget_range ?? null,
    guest_count: input.guest_count ?? null,
    date_range: input.date_range ?? null,
    decision_maker_name: input.decision_maker_name ?? null,
    company: input.company ?? null,
    timeline: input.timeline ?? null,
    message: input.message ?? null,
  };
  const { score, intent } = computeLeadQuality(forScore);

  const row = await q1<EventInquiryRow>(
    `insert into event_inquiries
       (venue_id, vendor_id, requester_user_id, event_type, budget_range,
        guest_count, date_range, decision_maker_name, company, timeline, message,
        lead_quality_score, intent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      input.venue_id,
      input.vendor_id ?? null,
      actor.user.id,
      input.event_type ?? null,
      input.budget_range ?? null,
      input.guest_count ?? null,
      jsonbParam(input.date_range) ?? null,
      input.decision_maker_name ?? null,
      input.company ?? null,
      input.timeline ?? null,
      input.message ?? null,
      score,
      intent,
    ],
  );
  return row as EventInquiryRow;
}

/**
 * List the inquiries addressed to a venue, ranked by lead_quality_score desc
 * (newest first on ties). Org-scoped and IDOR-safe: only the owning org (or an
 * admin) may read a venue's inbox.
 */
export async function listInquiriesForVenue(
  actor: Actor,
  venueId: string,
): Promise<EventInquiryRow[]> {
  await assertVenueAccess(actor, venueId);
  return q<EventInquiryRow>(
    `select * from event_inquiries
      where venue_id = $1
      order by lead_quality_score desc nulls last, created_at desc
      limit 500`,
    [venueId],
  );
}

// ---- verification_badges: get / list / setVerified -------------------------

/**
 * Authorize a badge write for a subject. Admins may always write. A `venue`
 * subject is owned by the venue's org (subject_id is the venue id). For the
 * inquiry-bound subject types (budget / decision_maker / event / company), the
 * subject is identified by subject_ref against an inquiry id when supplied; the
 * inquiry's venue org or the original requester may write. When no resolvable
 * owner can be determined, only an admin may write (fail closed).
 */
async function assertBadgeWriteAccess(
  actor: Actor,
  subjectType: BadgeSubjectType,
  subjectId: string | null,
  inquiryId: string | null,
): Promise<void> {
  if (isAdmin(actor)) return;

  if (subjectType === "venue") {
    if (!subjectId) throw new ForbiddenError("venue subject_id required");
    await assertVenueAccess(actor, subjectId); // owning org or admin
    return;
  }

  // For non-venue subjects, anchor authorization to an inquiry when one is
  // referenced (via inquiryId). The venue's org or the requester may verify.
  if (inquiryId) {
    const inq = await q1<{ venue_id: string | null; requester_user_id: string | null }>(
      `select venue_id, requester_user_id from event_inquiries where id = $1`,
      [inquiryId],
    );
    if (!inq) throw new NotFoundError("inquiry not found");
    if (inq.requester_user_id && inq.requester_user_id === actor.user.id) return;
    if (inq.venue_id) {
      await assertVenueAccess(actor, inq.venue_id);
      return;
    }
  }
  throw new ForbiddenError("not allowed to verify this subject");
}

/** Get a single badge by id (no scoping: badges are public-display markers). */
export async function getBadge(id: string): Promise<VerificationBadgeRow> {
  const row = await q1<VerificationBadgeRow>(
    `select * from verification_badges where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("badge not found");
  return row;
}

/**
 * List badges for a subject. Badges are display markers shown across the UI, so
 * reads are not org-scoped; the caller passes the subject_type and either a
 * subject_id or a subject_ref.
 */
export async function listBadges(
  subjectType: BadgeSubjectType,
  opts: { subjectId?: string | null; subjectRef?: string | null },
): Promise<VerificationBadgeRow[]> {
  if (opts.subjectId) {
    return q<VerificationBadgeRow>(
      `select * from verification_badges
        where subject_type = $1 and subject_id = $2
        order by created_at desc`,
      [subjectType, opts.subjectId],
    );
  }
  if (opts.subjectRef) {
    return q<VerificationBadgeRow>(
      `select * from verification_badges
        where subject_type = $1 and subject_ref = $2
        order by created_at desc`,
      [subjectType, opts.subjectRef],
    );
  }
  return q<VerificationBadgeRow>(
    `select * from verification_badges where subject_type = $1 order by created_at desc`,
    [subjectType],
  );
}

/**
 * Batch variant of listBadges: fetch badges for MANY subject ids of one
 * subject_type in a single query, returning a map keyed by subject_id. List
 * pages (marketplace, preferred vendors) use this to render verified-badge
 * chips on every row WITHOUT a per-row request storm (no N+1). Badges are
 * public-display trust markers, so this read is not org-scoped (mirrors
 * listBadges). Input ids are de-duplicated and capped to a sane bound; an empty
 * id list short-circuits to an empty map. Subject ids that have no badges are
 * simply absent from the map (the caller renders nothing for them).
 */
const BADGE_BATCH_MAX = 200;
export async function listBadgesBatch(
  subjectType: BadgeSubjectType,
  subjectIds: string[],
): Promise<Record<string, VerificationBadgeRow[]>> {
  const ids = Array.from(
    new Set(subjectIds.filter((s): s is string => typeof s === "string" && s.length > 0)),
  ).slice(0, BADGE_BATCH_MAX);
  if (ids.length === 0) return {};
  const rows = await q<VerificationBadgeRow>(
    `select * from verification_badges
      where subject_type = $1 and subject_id = any($2::uuid[])
      order by created_at desc`,
    [subjectType, ids],
  );
  const map: Record<string, VerificationBadgeRow[]> = {};
  for (const row of rows) {
    if (!row.subject_id) continue;
    (map[row.subject_id] ??= []).push(row);
  }
  return map;
}

export type SetBadgeInput = {
  subject_type: BadgeSubjectType;
  subject_id?: string | null;
  subject_ref?: string | null;
  verified?: boolean;
  evidence?: unknown;
  /** Optional inquiry id used to authorize non-venue subject verification. */
  inquiry_id?: string | null;
};

/**
 * Set / verify a badge for a subject. Upserts on (subject_type, subject_id) when
 * a subject_id is present, otherwise inserts a fresh row keyed by subject_ref.
 * Records verified_by + verified_at when verifying. Admin or owning party only.
 */
export async function setVerified(
  actor: Actor,
  input: SetBadgeInput,
): Promise<VerificationBadgeRow> {
  if (!isBadgeSubjectType(input.subject_type)) {
    throw new BadRequestError("invalid subject_type");
  }
  if (!input.subject_id && !hasText(input.subject_ref)) {
    throw new BadRequestError("subject_id or subject_ref required");
  }
  await assertBadgeWriteAccess(
    actor,
    input.subject_type,
    input.subject_id ?? null,
    input.inquiry_id ?? null,
  );

  const verified = input.verified ?? true;
  const verifiedBy = verified ? actor.user.id : null;
  const verifiedAt = verified ? new Date().toISOString() : null;
  const evidence = jsonbParam(input.evidence) ?? null;

  // Upsert by (subject_type, subject_id) when we have an id; the unique pairing
  // is enforced in application logic (the schema indexes it). Otherwise insert.
  if (input.subject_id) {
    const existing = await q1<VerificationBadgeRow>(
      `select * from verification_badges where subject_type = $1 and subject_id = $2 limit 1`,
      [input.subject_type, input.subject_id],
    );
    if (existing) {
      const row = await q1<VerificationBadgeRow>(
        `update verification_badges set
            verified = $2,
            verified_by = $3,
            verified_at = $4,
            evidence = coalesce($5, evidence),
            subject_ref = coalesce($6, subject_ref)
          where id = $1
          returning *`,
        [existing.id, verified, verifiedBy, verifiedAt, evidence, input.subject_ref ?? null],
      );
      return row as VerificationBadgeRow;
    }
  }

  const row = await q1<VerificationBadgeRow>(
    `insert into verification_badges
       (subject_type, subject_id, subject_ref, verified, verified_by, verified_at, evidence)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning *`,
    [
      input.subject_type,
      input.subject_id ?? null,
      input.subject_ref ?? null,
      verified,
      verifiedBy,
      verifiedAt,
      evidence,
    ],
  );
  return row as VerificationBadgeRow;
}
