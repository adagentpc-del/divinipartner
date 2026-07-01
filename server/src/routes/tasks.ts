/**
 * Phase 6 - Tasks + Timeline routes. Mount base: /api/tasks.
 *
 * Task CRUD per event, status quick-set, workflow-template seeding, and a
 * grouped timeline view. Read needs event access, mutation needs event
 * ownership (enforced in server/src/db/tasks.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as tasks from "../db/tasks.js";

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

/** Reference data (categories, statuses, priorities, workflow template). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      categories: tasks.TASK_CATEGORIES,
      statuses: tasks.TASK_STATUSES,
      priorities: tasks.TASK_PRIORITIES,
      workflow_template: tasks.EVENT_WORKFLOW_TEMPLATE,
    });
  }),
);

/** List tasks on an event. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tasks: await tasks.listTasks(a, req.params.eventId) });
  }),
);

/** Grouped timeline view for an event. */
router.get(
  "/event/:eventId/timeline",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ timeline: await tasks.buildTimeline(a, req.params.eventId) });
  }),
);

/** Add a task. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ task: await tasks.addTask(a, req.params.eventId, req.body ?? {}) });
  }),
);

/** Seed the standard event workflow template onto an event. */
router.post(
  "/event/:eventId/seed-workflow",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json(await tasks.seedWorkflow(a, req.params.eventId));
  }),
);

/** Patch a task. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ task: await tasks.updateTask(a, req.params.id, req.body ?? {}) });
  }),
);

/** Quick status set (body: { status }). */
router.post(
  "/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status required" });
    res.json({ task: await tasks.setTaskStatus(a, req.params.id, status) });
  }),
);

/** Delete a task. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await tasks.deleteTask(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
