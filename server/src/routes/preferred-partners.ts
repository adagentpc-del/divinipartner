/**
 * WS-2 - Preferred Partners routes. Mount base: /api/preferred-partners.
 * Requires a signed-in user; every operation is scoped to the caller's own org.
 *
 *   GET    /?kind=sponsor          list the caller org's saved partners
 *   GET    /suggestions?kind=vendor deterministic suggestions from past events
 *   POST   /                       save { partner_org_id, partner_kind, tier?, ... }
 *   PATCH  /:id                    update tier/label/note
 *   DELETE /:id                    remove
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as pp from "../db/preferredPartners.js";

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

/** Suggestions must be declared before the catch-all "/:id" is irrelevant here,
 * but keep it above POST for clarity. */
router.get(
  "/suggestions",
  h(async (req, res) => {
    const a = await actor(req);
    const kind = (req.query.kind as string | undefined)?.trim() || "vendor";
    res.json({ suggestions: await pp.suggestPreferred(a, kind) });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const kind = (req.query.kind as string | undefined)?.trim() || null;
    res.json({ partners: await pp.listPreferred(a, kind) });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { partner_org_id, partner_kind } = req.body ?? {};
    if (!partner_org_id || !partner_kind) {
      return res.status(400).json({ error: "partner_org_id and partner_kind required" });
    }
    res.status(201).json({ partner: await pp.savePreferred(a, req.body) });
  }),
);

router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ partner: await pp.updatePreferred(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await pp.removePreferred(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "preferred partner not found" });
    res.status(204).end();
  }),
);

export default router;
