/**
 * Divini Scope Builder. Mounted at /api/scope-builder.
 *
 *   GET  /templates                    org's own + platform-default templates for its role
 *   POST /templates                    create a custom template (Plus+)
 *   GET  /templates/:id                template detail with fields
 *   GET  /instances                    list (optional ?opportunity_id=, ?status=)
 *   POST /instances                    create { template_id, name, opportunity_id? }
 *   GET  /instances/:id                detail: instance + template + current responses
 *   POST /instances/:id/responses      save answers { answers: { field_id_or_key: value } }, appends a version
 *   GET  /instances/:id/versions       append-only version history
 *   POST /instances/:id/publish        publish (validates required fields first)
 *
 * See docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md section 9. Org-scoped
 * throughout via db/scopeBuilder.ts; no LLM dependency.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as scopeBuilder from "../db/scopeBuilder.js";
import { FeatureLockedError } from "../db/scopeBuilder.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof FeatureLockedError) {
        res.status(403).json(err.payload);
        return;
      }
      if (err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number") {
        res.status((err as Error & { status: number }).status).json({ error: err.message });
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

router.get(
  "/templates",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ templates: await scopeBuilder.listTemplates(a) });
  }),
);

router.post(
  "/templates",
  h(async (req, res) => {
    const a = await actor(req);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const category = typeof req.body?.category === "string" ? req.body.category : null;
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
    if (!name) return res.status(400).json({ error: "name is required" });
    const tpl = await scopeBuilder.createTemplate(a, { name, category, fields });
    res.status(201).json({ template: tpl });
  }),
);

router.get(
  "/templates/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ template: await scopeBuilder.getTemplate(a, req.params.id) });
  }),
);

router.get(
  "/instances",
  h(async (req, res) => {
    const a = await actor(req);
    const opportunityId = typeof req.query.opportunity_id === "string" ? req.query.opportunity_id : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ instances: await scopeBuilder.listInstances(a, { opportunityId, status }) });
  }),
);

router.post(
  "/instances",
  h(async (req, res) => {
    const a = await actor(req);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const templateId = typeof req.body?.template_id === "string" ? req.body.template_id : "";
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!templateId) return res.status(400).json({ error: "template_id is required" });
    const opportunityId = typeof req.body?.opportunity_id === "string" ? req.body.opportunity_id : null;
    const instance = await scopeBuilder.createInstance(a, { template_id: templateId, name, opportunity_id: opportunityId });
    res.status(201).json({ instance });
  }),
);

router.get(
  "/instances/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await scopeBuilder.getInstance(a, req.params.id));
  }),
);

router.post(
  "/instances/:id/responses",
  h(async (req, res) => {
    const a = await actor(req);
    const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    res.json(await scopeBuilder.saveResponses(a, req.params.id, answers));
  }),
);

router.get(
  "/instances/:id/versions",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ versions: await scopeBuilder.listVersions(a, req.params.id) });
  }),
);

router.post(
  "/instances/:id/publish",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ instance: await scopeBuilder.publishInstance(a, req.params.id) });
  }),
);

export default router;
