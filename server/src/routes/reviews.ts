/**
 * Phase 7 - Review routes. Mount base: /api/reviews (blueprint 27).
 *
 * Post-event reviews across marketplace relationships, review requests, the
 * inputs the trust engine needs, and the criteria sets the UI renders.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as reviews from "../db/reviews.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Reference data for the UI: relationships + criteria sets. */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      relationships: reviews.REVIEW_RELATIONSHIPS,
      criteria: reviews.REVIEW_CRITERIA,
    });
  }),
);

/** Reviews the acting org wrote. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ reviews: [] });
    res.json({ reviews: await reviews.listReviewsByOrg(a.org.id) });
  }),
);

/** Reviews written about the acting org (received). */
router.get(
  "/received",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ reviews: [] });
    res.json({ reviews: await reviews.listReviewsAboutOrg(a.org.id) });
  }),
);

/** Pending review requests assigned to the acting user. */
router.get(
  "/requests",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ reviews: await reviews.listMyReviewRequests(a) });
  }),
);

/** Published reviews about a target (for public profiles). */
router.get(
  "/for/:targetType/:targetId",
  h(async (req, res) => {
    const targetType = req.params.targetType as reviews.ReviewTargetType;
    res.json({
      reviews: await reviews.listPublishedReviewsForTarget(targetType, req.params.targetId),
      criteria: reviews.criteriaForTarget(targetType),
    });
  }),
);

/** Submit a new review. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { relationship } = req.body ?? {};
    if (!reviews.isReviewRelationship(relationship)) {
      return res.status(400).json({ error: "valid relationship required" });
    }
    res.status(201).json({ review: await reviews.createReview(a, req.body) });
  }),
);

/** Open a review request for a counterparty to fill in. */
router.post(
  "/request",
  h(async (req, res) => {
    const a = await actor(req);
    const { relationship } = req.body ?? {};
    if (!reviews.isReviewRelationship(relationship)) {
      return res.status(400).json({ error: "valid relationship required" });
    }
    res.status(201).json({ review: await reviews.requestReview(a, req.body) });
  }),
);

/** Fill in a requested review. */
router.post(
  "/:id/submit",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ review: await reviews.submitRequestedReview(a, req.params.id, req.body ?? {}) });
  }),
);

export default router;
