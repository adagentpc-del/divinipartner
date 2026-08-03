/**
 * Divini Follow-Up Desk. Mounted at /api/follow-up-desk.
 *
 *   GET  /tasks                list (default: open + snoozed; optional ?status=)
 *                                reconciles deterministic system rules on every call
 *   POST /tasks                create a manual task { title, note?, due_at?, opportunity_id?, proposal_id? }
 *   POST /tasks/:id/status     { status: 'done'|'dismissed'|'open'|'snoozed', snoozed_until? }
 *   DELETE /tasks/:id          delete a manual task (system tasks cannot be deleted, only resolved)
 *
 * See docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md. Org-scoped throughout via
 * db/followUpDesk.ts; no LLM dependency, no cron worker -- rules reconcile
 * live on every list.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as followUp from "../db/followUpDesk.js";

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

router.get(
  "/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ tasks: await followUp.listTasks(a, { status }) });
  }),
);

router.post(
  "/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "title is required" });
    const task = await followUp.createManualTask(a, { ...req.body, title });
    res.status(201).json({ task });
  }),
);

router.post(
  "/tasks/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const status = req.body?.status;
    if (!["done", "dismissed", "open", "snoozed"].includes(status)) {
      return res.status(400).json({ error: "status must be one of: done, dismissed, open, snoozed" });
    }
    const snoozedUntil = typeof req.body?.snoozed_until === "string" ? req.body.snoozed_until : null;
    const task = await followUp.setTaskStatus(a, req.params.id, status, snoozedUntil);
    res.json({ task });
  }),
);

router.delete(
  "/tasks/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await followUp.deleteManualTask(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
