/**
 * Friction Elimination - Lead Quality Engine (U4) + Verified Lead Program (U5)
 * routes. Mount base: /api/leads.
 *
 * Mirrors server/src/routes/events.ts and server/src/routes/venue-twin.ts:
 * requireUser, an actor resolved from the verified OIDC token, the h() async
 * wrapper, 400 on bad input, and 403/404/400 surfaced from the repo's
 * ForbiddenError / NotFoundError / BadRequestError (each carries a `.status`).
 *
 *   POST /                       submit a qualified inquiry (scored on create)
 *   GET  /venue/:venueId         ranked inbox for a venue (org-scoped, IDOR-safe)
 *   POST /badges                 set / verify a verification badge
 *   GET  /badges?subject_type=&subject_id=&subject_ref=   list badges for a subject
 *   GET  /badges/batch?subject_type=&subject_ids=a,b,c    badges for many subjects
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as leads from "../db/leads.js";

/**
 * Async wrapper. The shared errorHandler (server/src/routes.ts) only maps
 * ForbiddenError -> 403 and NotFoundError -> 404; everything else is a 500. The
 * leads repo raises BadRequestError for invalid / incomplete input, so this
 * wrapper translates that one class to a 400 here (additive, no edit to the
 * shared handler) and forwards anything else to next().
 */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof leads.BadRequestError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    });

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Submit a qualified inquiry. The repo enforces the required fields (400). */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const inquiry = await leads.createInquiry(a, req.body ?? {});
    res.status(201).json({ inquiry });
  }),
);

/** Ranked inbox of inquiries for a venue (org-scoped, IDOR-safe, score desc). */
router.get(
  "/venue/:venueId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ inquiries: await leads.listInquiriesForVenue(a, req.params.venueId) });
  }),
);

/** Set / verify a verification badge for a subject (admin or owning party). */
router.post(
  "/badges",
  h(async (req, res) => {
    const a = await actor(req);
    const { subject_type } = req.body ?? {};
    if (!leads.isBadgeSubjectType(subject_type)) {
      return res.status(400).json({ error: "valid subject_type required" });
    }
    const badge = await leads.setVerified(a, req.body);
    res.status(201).json({ badge });
  }),
);

/** List verification badges for a subject (subject_type + subject_id|subject_ref). */
router.get(
  "/badges",
  h(async (req, res) => {
    const subjectType = typeof req.query.subject_type === "string" ? req.query.subject_type : "";
    if (!leads.isBadgeSubjectType(subjectType)) {
      return res.status(400).json({ error: "valid subject_type required" });
    }
    const subjectId = typeof req.query.subject_id === "string" ? req.query.subject_id : null;
    const subjectRef = typeof req.query.subject_ref === "string" ? req.query.subject_ref : null;
    res.json({
      badges: await leads.listBadges(subjectType, { subjectId, subjectRef }),
    });
  }),
);

/**
 * Batch list verification badges for many subjects of one subject_type. List
 * pages (marketplace, preferred vendors) call this ONCE for all visible row ids
 * instead of one request per row, avoiding an N+1 request storm. Returns a map
 * { subjectId: Badge[] } for the ids that have badges; ids with none are simply
 * omitted. Badges are public-display trust markers (same authorization posture
 * as the single-subject GET /badges), and the repo de-duplicates and caps the
 * id list, so a forged or oversized list cannot drive an unbounded query.
 */
router.get(
  "/badges/batch",
  h(async (req, res) => {
    const subjectType = typeof req.query.subject_type === "string" ? req.query.subject_type : "";
    if (!leads.isBadgeSubjectType(subjectType)) {
      return res.status(400).json({ error: "valid subject_type required" });
    }
    const raw = typeof req.query.subject_ids === "string" ? req.query.subject_ids : "";
    const subjectIds = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    res.json({ badges: await leads.listBadgesBatch(subjectType, subjectIds) });
  }),
);

export default router;
