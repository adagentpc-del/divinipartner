/**
 * Divini AI COO (V2) - executive intelligence routes.
 * Mount base: /api/coo (the lead wires the mount in routes.ts).
 *
 *   GET  /briefing            the actor's live daily executive briefing
 *   GET  /dashboard           the same briefing (executive dashboard payload)
 *   GET  /tasks               the actor's ranked task feed (?status=&limit=)
 *   POST /tasks/generate      (re)generate the actor's tasks from the briefing
 *   POST /tasks/:id/status    set one task's disposition { status }
 *
 * Mirrors the existing route patterns: requireUser guard, getActor via actor(),
 * the h() async wrapper, 400 on bad input, and 403/404 surfaced from the repo's
 * ForbiddenError/NotFoundError. The briefing is computed live + org-scoped and
 * tasks are audience-scoped in the repo, so an actor only ever sees and mutates
 * its own org/user material (IDOR-safe).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { gatherBriefing, tasks } from "../db/coo.js";

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

/** The actor's live daily executive briefing. */
router.get(
  "/briefing",
  h(async (req, res) => {
    const a = await actor(req);
    const briefing = await gatherBriefing(a);
    res.json({ briefing });
  }),
);

/** The executive dashboard payload (the assembled briefing). */
router.get(
  "/dashboard",
  h(async (req, res) => {
    const a = await actor(req);
    const briefing = await gatherBriefing(a);
    res.json({ dashboard: briefing });
  }),
);

/** The actor's ranked task feed. */
router.get(
  "/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const limit =
      typeof req.query.limit === "string" && req.query.limit.trim()
        ? Number(req.query.limit)
        : undefined;
    const items = await tasks.listForActor(a, { status, limit });
    res.json({ tasks: items });
  }),
);

/** (Re)generate the actor's tasks from the live briefing and return them. */
router.post(
  "/tasks/generate",
  h(async (req, res) => {
    const a = await actor(req);
    const items = await tasks.generate(a);
    res.json({ tasks: items });
  }),
);

/** Set one task's disposition (open | done | dismissed). */
router.post(
  "/tasks/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";
    if (!status) return res.status(400).json({ error: "status required (open | done | dismissed)" });
    const row = await tasks.setStatus(a, req.params.id, status);
    res.json({ task: row });
  }),
);

export default router;
