/**
 * Divini Partners - feedback-driven Divini Score refresh.
 *
 * The Divini Score (lib/diviniScore.ts) is computed-but-cached: db/divini-score.ts
 * recomputes and persists it on write, and the matching engine now CONSUMES that
 * cached score to rank partners. The missing link was a path to recompute a
 * party's score AFTER new feedback/review so the next match reflects it. This is
 * that wiring point.
 *
 * recomputeScoreInternal (db/divini-score.ts) does the work: it validates the
 * entity exists, regathers signals from the existing tables, recomputes the pure
 * score, and upserts the divini_scores cache. It deliberately skips the per-actor
 * org IDOR check because these triggers fire AFTER a write that already passed its
 * own authorization gate (a review the actor was allowed to submit), and we are
 * only refreshing the score of the legitimately-reviewed counterparty.
 *
 * BEST-EFFORT: every helper here swallows + logs errors and never throws, so a
 * slow or failing recompute can never block, fail, or roll back the request that
 * triggered it. Callers fire these as `void refreshAfterReview(row)`.
 *
 * Zero em dashes by convention.
 */
import { recomputeScoreInternal } from "../db/divini-score.js";
import type { DiviniEntityType } from "./diviniScore.js";

/** A review/feedback row, narrowed to the fields needed to resolve its subject. */
export type ReviewSubjectRef = {
  target_type?: string | null;
  target_id?: string | null;
  vendor_id?: string | null;
  venue_id?: string | null;
  reviewee_id?: string | null;
};

/**
 * Recompute + re-persist the Divini Score for one entity. Best-effort: never
 * throws. Returns the new score when it could be recomputed, else null (unknown
 * entity type, missing id, or a deleted/forged entity).
 */
export async function refreshEntityScore(
  entityType: DiviniEntityType,
  entityId: string | null | undefined,
): Promise<number | null> {
  if (!entityId) return null;
  try {
    const view = await recomputeScoreInternal(entityType, entityId);
    return view ? view.score : null;
  } catch (err) {
    console.error(`[score-refresh] recompute failed for ${entityType}:${entityId}:`, err);
    return null;
  }
}

/**
 * Resolve the Divini entity a review is about (its subject) so its score can be
 * refreshed. Maps the review's target columns to a (entityType, entityId) pair:
 *   - target_type 'vendor'  -> vendors.id   (vendor_id, then target_id)
 *   - target_type 'venue'   -> venues.id    (venue_id, then target_id)
 *   - target_type 'client'  -> users.id     (reviewee_id, then target_id)
 *   - target_type 'planner' -> users.id     (reviewee_id, then target_id)
 *   - target_type 'org'     -> no per-entity Divini Score; returns null (skip)
 * Returns null when the subject cannot be resolved to a scored entity type.
 */
export function reviewSubject(
  review: ReviewSubjectRef,
): { entityType: DiviniEntityType; entityId: string } | null {
  const t = String(review.target_type ?? "").trim();
  if (t === "vendor") {
    const id = review.vendor_id ?? review.target_id ?? null;
    return id ? { entityType: "vendor", entityId: id } : null;
  }
  if (t === "venue") {
    const id = review.venue_id ?? review.target_id ?? null;
    return id ? { entityType: "venue", entityId: id } : null;
  }
  if (t === "client") {
    const id = review.reviewee_id ?? review.target_id ?? null;
    return id ? { entityType: "client", entityId: id } : null;
  }
  if (t === "planner") {
    const id = review.reviewee_id ?? review.target_id ?? null;
    return id ? { entityType: "planner", entityId: id } : null;
  }
  // 'org' (and anything else) has no single per-entity Divini Score to refresh.
  return null;
}

/**
 * Fired after a review/rating is written for a counterparty: recompute that
 * counterparty's Divini Score so the next match reflects the new feedback.
 * Best-effort and non-blocking by the same contract as refreshEntityScore.
 * Returns the new score, or null when the review has no scored subject.
 */
export async function refreshAfterReview(review: ReviewSubjectRef): Promise<number | null> {
  const subject = reviewSubject(review);
  if (!subject) return null;
  return refreshEntityScore(subject.entityType, subject.entityId);
}
