/**
 * Divini Pipeline. Mounted at /api/pipeline.
 *
 *   GET  /stages                       the org's stage list (seeded on first use)
 *   POST /stages                       add a custom stage
 *   GET  /opportunities                list (optional ?stage_id=, ?status=)
 *   POST /opportunities                create
 *   GET  /opportunities/:id            detail
 *   PATCH /opportunities/:id           update fields
 *   POST /opportunities/:id/stage      move stage { stage_id, loss_reason? }
 *   GET  /opportunities/:id/readiness  deterministic readiness score
 *   GET  /opportunities/:id/activities list
 *   POST /opportunities/:id/activities add { activity_type, body }
 *
 * See docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md section 6. Org-scoped
 * throughout via db/pipeline.ts; no LLM dependency.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as pipeline from "../db/pipeline.js";

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
  "/stages",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ stages: [] });
    res.json({ stages: await pipeline.listStages(a.org.id) });
  }),
);

router.post(
  "/stages",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "register an organization first" });
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!key || !label) return res.status(400).json({ error: "key and label are required" });
    res.status(201).json({ stage: await pipeline.addStage(a.org.id, key, label) });
  }),
);

router.get(
  "/opportunities",
  h(async (req, res) => {
    const a = await actor(req);
    const stageId = typeof req.query.stage_id === "string" ? req.query.stage_id : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ opportunities: await pipeline.listOpportunities(a, { stageId, status }) });
  }),
);

router.post(
  "/opportunities",
  h(async (req, res) => {
    const a = await actor(req);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name is required" });
    const opp = await pipeline.createOpportunity(a, { ...req.body, name });
    res.status(201).json({ opportunity: opp });
  }),
);

router.get(
  "/opportunities/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ opportunity: await pipeline.getOpportunity(a, req.params.id) });
  }),
);

router.patch(
  "/opportunities/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ opportunity: await pipeline.updateOpportunity(a, req.params.id, req.body ?? {}) });
  }),
);

router.post(
  "/opportunities/:id/stage",
  h(async (req, res) => {
    const a = await actor(req);
    const stageId = typeof req.body?.stage_id === "string" ? req.body.stage_id : "";
    if (!stageId) return res.status(400).json({ error: "stage_id is required" });
    const lossReason = typeof req.body?.loss_reason === "string" ? req.body.loss_reason : null;
    res.json({ opportunity: await pipeline.moveStage(a, req.params.id, stageId, lossReason) });
  }),
);

router.get(
  "/opportunities/:id/readiness",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ readiness: await pipeline.getReadinessScore(a, req.params.id) });
  }),
);

router.get(
  "/opportunities/:id/activities",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ activities: await pipeline.listActivities(a, req.params.id) });
  }),
);

router.post(
  "/opportunities/:id/activities",
  h(async (req, res) => {
    const a = await actor(req);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ error: "body is required" });
    const type = typeof req.body?.activity_type === "string" ? req.body.activity_type : "note";
    res.status(201).json({ activity: await pipeline.addActivity(a, req.params.id, type, body) });
  }),
);

export default router;
