/**
 * Phase 7 - Event template + history routes. Mount base: /api/templates
 * (blueprint 28).
 *
 * Reusable event templates (CRUD), event history memory (list + record), and a
 * "duplicate this event" endpoint that turns a history entry into a template.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as tpl from "../db/templates.js";

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

/** List templates visible to the org (own + global). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ templates: await tpl.listTemplates(a.org?.id ?? null) });
  }),
);

/** Event history memory (most recent first). */
router.get(
  "/history",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ history: [] });
    res.json({ history: await tpl.listHistory(a.org.id) });
  }),
);

/** Record a completed-event summary into history. */
router.post(
  "/history",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ history: await tpl.recordHistory(a, req.body ?? {}) });
  }),
);

/** Duplicate a past event: create a template from a history entry. */
router.post(
  "/history/:id/duplicate",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ template: await tpl.templateFromHistory(a, req.params.id) });
  }),
);

/** Single template. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ template: await tpl.getTemplate(a.org?.id ?? null, req.params.id) });
  }),
);

/** Create a template. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    res.status(201).json({ template: await tpl.createTemplate(a, req.body) });
  }),
);

/** Patch a template. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ template: await tpl.updateTemplate(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a template. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await tpl.deleteTemplate(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

export default router;
