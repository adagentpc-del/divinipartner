/**
 * Phase 8 - Feedback + Feature Request routes. Mount base: /api/feedback.
 * requireUser for everyone; admin-only actions enforced in the db layer.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as feedback from "../db/feedback.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ types: feedback.FEEDBACK_TYPES, statuses: feedback.FEEDBACK_STATUSES });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      feedback: await feedback.listFeedback(a, isAdmin, {
        type: (req.query.type as string) || undefined,
        status: (req.query.status as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const { a } = await actor(req);
    const { description } = req.body ?? {};
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description required" });
    }
    const item = await feedback.createFeedback(a, req.body);
    // Confirmation to the submitter. Best-effort: never block the request.
    if (a.user.email) {
      await notify.featureRequestReceived(a.user.email).catch(() => undefined);
    }
    res.status(201).json({ feedback: item });
  }),
);

router.post(
  "/:id/vote",
  h(async (req, res) => {
    res.json({ feedback: await feedback.voteFeedback(req.params.id) });
  }),
);

router.post(
  "/:id/status",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const { status, admin_notes } = req.body ?? {};
    if (!feedback.isFeedbackStatus(status)) return res.status(400).json({ error: "invalid status" });
    const { prev, next } = await feedback.setStatus(a, isAdmin, req.params.id, status, admin_notes);
    await logAction(a, "feedback.status_changed", "feedback_item", req.params.id, prev, next, {
      summary: `feedback -> ${status}`,
    });
    res.json({ feedback: next });
  }),
);

// AI pattern note (deterministic count by type). Admin-facing roll-up.
router.get(
  "/patterns",
  h(async (_req, res) => {
    res.json({ pattern: await feedback.patternSummary() });
  }),
);

export default router;
