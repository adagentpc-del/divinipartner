/**
 * Phase 7 - Reviews data-access (blueprint 27). Post-event reviews across the
 * relationships in the marketplace plus the inputs the trust engine needs.
 *
 * Backed by the `reviews` table (db/schema.sql) extended in db/schema-phase7.sql
 * (relationship, target_type/target_id, org scoping, request lifecycle). Reads
 * are org-scoped: an org sees reviews it wrote, reviews about it, and (for the
 * public profile) published reviews about a given target.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import {
  computeTrustScore,
  averageRating,
  type TrustScore,
  type TrustTargetType,
  type TrustInputs,
} from "../lib/trust.js";
import { refreshAfterReview } from "../lib/score-refresh.js";

// ---- Relationship + criteria model (blueprint 27.1 / 27.2) -----------------
export type ReviewRelationship =
  | "client_to_vendor"
  | "planner_to_vendor"
  | "venue_to_vendor"
  | "vendor_to_client"
  | "client_to_venue"
  | "venue_to_client"
  | "client_to_planner"
  | "vendor_to_venue"
  | "planner_to_venue";

export type ReviewTargetType = "vendor" | "venue" | "client" | "planner" | "org";

export const REVIEW_RELATIONSHIPS: {
  key: ReviewRelationship;
  label: string;
  targetType: ReviewTargetType;
}[] = [
  { key: "client_to_vendor", label: "Client reviews vendor", targetType: "vendor" },
  { key: "planner_to_vendor", label: "Planner reviews vendor", targetType: "vendor" },
  { key: "venue_to_vendor", label: "Venue reviews vendor", targetType: "vendor" },
  { key: "vendor_to_client", label: "Vendor reviews client", targetType: "client" },
  { key: "client_to_venue", label: "Client reviews venue", targetType: "venue" },
  { key: "venue_to_client", label: "Venue reviews client", targetType: "client" },
  { key: "client_to_planner", label: "Client reviews planner", targetType: "planner" },
  { key: "vendor_to_venue", label: "Vendor reviews venue", targetType: "venue" },
  { key: "planner_to_venue", label: "Planner reviews venue", targetType: "venue" },
];

const REL_KEYS = new Set<string>(REVIEW_RELATIONSHIPS.map((r) => r.key));
export function isReviewRelationship(v: unknown): v is ReviewRelationship {
  return typeof v === "string" && REL_KEYS.has(v);
}
export function targetTypeForRelationship(rel: ReviewRelationship): ReviewTargetType {
  return REVIEW_RELATIONSHIPS.find((r) => r.key === rel)?.targetType ?? "org";
}

/** Criteria sets per target type (blueprint 27.2). 1..5 each. */
export const REVIEW_CRITERIA: Record<ReviewTargetType, { key: string; label: string }[]> = {
  vendor: [
    { key: "quality", label: "Quality of work" },
    { key: "communication", label: "Communication" },
    { key: "timeliness", label: "Timeliness" },
    { key: "professionalism", label: "Professionalism" },
    { key: "value", label: "Value for money" },
  ],
  venue: [
    { key: "space", label: "Space and condition" },
    { key: "staff", label: "Staff and support" },
    { key: "communication", label: "Communication" },
    { key: "flexibility", label: "Flexibility" },
    { key: "value", label: "Value for money" },
  ],
  client: [
    { key: "communication", label: "Communication" },
    { key: "payment", label: "Payment promptness" },
    { key: "clarity", label: "Scope clarity" },
    { key: "professionalism", label: "Professionalism" },
  ],
  planner: [
    { key: "communication", label: "Communication" },
    { key: "organization", label: "Organization" },
    { key: "clarity", label: "Scope clarity" },
    { key: "professionalism", label: "Professionalism" },
  ],
  org: [
    { key: "communication", label: "Communication" },
    { key: "professionalism", label: "Professionalism" },
    { key: "value", label: "Overall" },
  ],
};

export function criteriaForTarget(targetType: ReviewTargetType) {
  return REVIEW_CRITERIA[targetType] ?? REVIEW_CRITERIA.org;
}

export type ReviewRow = {
  id: string;
  event_id: string | null;
  reviewer_id: string | null;
  reviewee_id: string | null;
  organization_id: string | null;
  reviewer_org_id: string | null;
  reviewee_org_id: string | null;
  relationship: string | null;
  target_type: string | null;
  target_id: string | null;
  vendor_id: string | null;
  venue_id: string | null;
  rating: string | null;
  criteria: Record<string, number> | null;
  body: string | null;
  status: string | null;
  is_public: boolean | null;
  requested_at: string | null;
  submitted_at: string | null;
  created_at: string;
};

const COLS = `
  id, event_id, reviewer_id, reviewee_id, organization_id, reviewer_org_id,
  reviewee_org_id, relationship, target_type, target_id, vendor_id, venue_id,
  rating, criteria, body, status, is_public, requested_at, submitted_at, created_at
`;

/** Average a criteria map (1..5 each) to a single 1..5 rating, or null. */
export function ratingFromCriteria(criteria: Record<string, number> | null | undefined): number | null {
  if (!criteria) return null;
  const vals = Object.values(criteria).map(Number).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 100) / 100;
}

export type CreateReviewInput = {
  relationship: ReviewRelationship;
  event_id?: string | null;
  reviewee_id?: string | null;
  reviewee_org_id?: string | null;
  target_id?: string | null;
  vendor_id?: string | null;
  venue_id?: string | null;
  criteria?: Record<string, number>;
  rating?: number;
  body?: string | null;
  is_public?: boolean;
};

/**
 * Create (submit) a review. The reviewer is the acting user/org. A rating is
 * derived from the criteria map when not supplied explicitly.
 */
export async function createReview(actor: Actor, input: CreateReviewInput): Promise<ReviewRow> {
  if (!isReviewRelationship(input.relationship)) {
    throw new ForbiddenError("invalid review relationship");
  }
  const targetType = targetTypeForRelationship(input.relationship);
  const rating = input.rating ?? ratingFromCriteria(input.criteria) ?? null;
  const row = await q1<ReviewRow>(
    `insert into reviews
       (event_id, reviewer_id, reviewee_id, organization_id, reviewer_org_id,
        reviewee_org_id, relationship, target_type, target_id, vendor_id, venue_id,
        rating, criteria, body, status, is_public, submitted_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'submitted',$15, now(), now())
     returning ${COLS}`,
    [
      input.event_id ?? null,
      actor.user.id,
      input.reviewee_id ?? null,
      actor.org?.id ?? null,
      actor.org?.id ?? null,
      input.reviewee_org_id ?? null,
      input.relationship,
      targetType,
      input.target_id ?? input.reviewee_org_id ?? null,
      input.vendor_id ?? null,
      input.venue_id ?? null,
      rating,
      input.criteria ? JSON.stringify(input.criteria) : null,
      input.body ?? null,
      input.is_public ?? true,
    ],
  );
  // Feedback -> recompute: refresh the reviewed party's Divini Score so the next
  // match reflects this review. Fire-and-forget; never blocks or fails the write.
  if (row) void refreshAfterReview(row);
  return row as ReviewRow;
}

/**
 * Open a review request (status = requested) so the counterparty is prompted to
 * leave a review after an event completes. Idempotent per (event, reviewer_org,
 * reviewee_org, relationship) is not enforced at the db level here; callers
 * typically request once per completed engagement.
 */
export async function requestReview(
  actor: Actor,
  input: {
    relationship: ReviewRelationship;
    event_id?: string | null;
    reviewee_id?: string | null;
    reviewee_org_id?: string | null;
    target_id?: string | null;
  },
): Promise<ReviewRow> {
  if (!isReviewRelationship(input.relationship)) {
    throw new ForbiddenError("invalid review relationship");
  }
  const targetType = targetTypeForRelationship(input.relationship);
  const row = await q1<ReviewRow>(
    `insert into reviews
       (event_id, reviewer_id, organization_id, reviewer_org_id, reviewee_id,
        reviewee_org_id, relationship, target_type, target_id, status, requested_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'requested', now(), now())
     returning ${COLS}`,
    [
      input.event_id ?? null,
      actor.user.id,
      actor.org?.id ?? null,
      actor.org?.id ?? null,
      input.reviewee_id ?? null,
      input.reviewee_org_id ?? null,
      input.relationship,
      targetType,
      input.target_id ?? input.reviewee_org_id ?? null,
    ],
  );
  return row as ReviewRow;
}

/** Fill in a requested review (turn it into a submitted one). */
export async function submitRequestedReview(
  actor: Actor,
  id: string,
  input: { criteria?: Record<string, number>; rating?: number; body?: string | null; is_public?: boolean },
): Promise<ReviewRow> {
  const existing = await q1<ReviewRow>(`select ${COLS} from reviews where id = $1`, [id]);
  if (!existing) throw new ForbiddenError("review not found");
  if (existing.reviewer_id !== actor.user.id) {
    throw new ForbiddenError("only the requested reviewer can submit");
  }
  const rating = input.rating ?? ratingFromCriteria(input.criteria) ?? existing.rating ?? null;
  const row = await q1<ReviewRow>(
    `update reviews set
        criteria = coalesce($2, criteria),
        rating = $3,
        body = coalesce($4, body),
        is_public = coalesce($5, is_public),
        status = 'submitted',
        submitted_at = now(),
        updated_at = now()
      where id = $1
      returning ${COLS}`,
    [
      id,
      input.criteria ? JSON.stringify(input.criteria) : null,
      rating,
      input.body ?? null,
      input.is_public ?? null,
    ],
  );
  // A requested review now carries a rating: refresh the reviewed party's Divini
  // Score. Fire-and-forget; never blocks or fails the write.
  if (row) void refreshAfterReview(row);
  return row as ReviewRow;
}

/** Reviews the acting org wrote. */
export async function listReviewsByOrg(orgId: string): Promise<ReviewRow[]> {
  return q<ReviewRow>(
    `select ${COLS} from reviews
      where organization_id = $1 or reviewer_org_id = $1
      order by created_at desc limit 500`,
    [orgId],
  );
}

/** Reviews written ABOUT the acting org (received). */
export async function listReviewsAboutOrg(orgId: string): Promise<ReviewRow[]> {
  return q<ReviewRow>(
    `select ${COLS} from reviews
      where reviewee_org_id = $1 or target_id = $1
      order by created_at desc limit 500`,
    [orgId],
  );
}

/** Pending review requests assigned to the acting user (status = requested). */
export async function listMyReviewRequests(actor: Actor): Promise<ReviewRow[]> {
  return q<ReviewRow>(
    `select ${COLS} from reviews
      where reviewer_id = $1 and status = 'requested'
      order by created_at desc limit 200`,
    [actor.user.id],
  );
}

/** Published reviews about a specific target (for public profiles). */
export async function listPublishedReviewsForTarget(
  targetType: ReviewTargetType,
  targetId: string,
): Promise<ReviewRow[]> {
  return q<ReviewRow>(
    `select ${COLS} from reviews
      where target_type = $1 and target_id = $2
        and is_public = true and status in ('submitted','published')
      order by created_at desc limit 200`,
    [targetType, targetId],
  );
}

/**
 * Gather the trust inputs for an org acting in a given target role and compute
 * the score. Review-derived signals are read here; operational signals
 * (completion, on-time, docs, repeat, disputes, response) are derived from the
 * surrounding tables where available and otherwise left unknown.
 */
export async function computeTrustForOrg(
  orgId: string,
  targetType: TrustTargetType,
): Promise<TrustScore & { inputs: TrustInputs }> {
  // Reviews about this org.
  const reviews = await q<{ rating: string | null }>(
    `select rating from reviews
      where (reviewee_org_id = $1 or target_id = $1)
        and status in ('submitted','published')`,
    [orgId],
  );
  const avgRating = averageRating(reviews.map((r) => (r.rating == null ? null : Number(r.rating))));
  const reviewCount = reviews.length;

  // Dispute rate from invoices flagged disputed vs total (best-effort).
  const disputeStats = await q1<{ total: string; disputed: string }>(
    `select count(*)::int as total,
            count(*) filter (where status = 'disputed')::int as disputed
       from invoices
      where organization_id = $1 or vendor_id in (select id from vendors where organization_id = $1)`,
    [orgId],
  );
  const totalInv = Number(disputeStats?.total ?? 0);
  const disputeRate = totalInv > 0 ? Number(disputeStats?.disputed ?? 0) / totalInv : null;

  // Document readiness: present, unexpired docs vs a small expected baseline.
  const docStats = await q1<{ ready: string }>(
    `select count(*)::int as ready from documents
      where organization_id = $1
        and (expiration_date is null or expiration_date > now())`,
    [orgId],
  );
  const readyDocs = Number(docStats?.ready ?? 0);
  // Expect at least 2 core docs (COI + W-9). Readiness saturates at 2+.
  const docReadiness = readyDocs >= 2 ? 1 : readyDocs / 2;

  // Completion rate from event_history outcomes when present.
  const histStats = await q1<{ total: string; completed: string }>(
    `select count(*)::int as total,
            count(*) filter (where outcome = 'completed')::int as completed
       from event_history
      where organization_id = $1 or $1 = any(vendor_org_ids)`,
    [orgId],
  );
  const totalHist = Number(histStats?.total ?? 0);
  const completionRate = totalHist > 0 ? Number(histStats?.completed ?? 0) / totalHist : null;

  const inputs: TrustInputs = {
    avgRating,
    reviewCount,
    disputeRate,
    docReadiness,
    completionRate,
    // response / on-time / repeat are left unknown (re-normalized away) until
    // dedicated signals exist; the engine handles missing inputs gracefully.
    responseHours: null,
    onTimeRate: null,
    repeatRate: null,
  };

  const score = computeTrustScore(targetType, inputs);
  return { ...score, inputs };
}
