/**
 * Venue Intelligence - vendor quote-requirement routes. Mount base:
 * /api/vendor-requirements.
 *
 * The vendor Quote Requirement Builder: the custom intake schema a vendor needs
 * filled in before quoting a service category, plus reusable templates. Every
 * route is org-scoped and IDOR-safe via the repo (server/src/db/vendor-requirements.ts),
 * which validates the vendor against the actor's org before any read or write.
 * Mirrors server/src/routes/venue-twin.ts patterns: requireUser, getActor, the
 * h() async wrapper, 400 on bad input, 403/404 from the repo's
 * ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as repo from "../db/vendor-requirements.js";

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

/** List a vendor's requirement sets (optional ?templates=1 for templates only). */
router.get(
  "/vendor/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    if (req.query.templates === "1" || req.query.templates === "true") {
      res.json({ requirements: await repo.listRequirementTemplates(a, req.params.vendorId) });
      return;
    }
    res.json({ requirements: await repo.listRequirements(a, req.params.vendorId) });
  }),
);

/** List only the saved templates for a vendor. */
router.get(
  "/vendor/:vendorId/templates",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirements: await repo.listRequirementTemplates(a, req.params.vendorId) });
  }),
);

/** Create a requirement set for a vendor. */
router.post(
  "/vendor/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    res
      .status(201)
      .json({ requirement: await repo.createRequirement(a, req.params.vendorId, req.body ?? {}) });
  }),
);

/** Get one requirement set. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirement: await repo.getRequirement(a, req.params.id) });
  }),
);

/** Patch a requirement set. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirement: await repo.updateRequirement(a, req.params.id, req.body ?? {}) });
  }),
);

/** Save an existing requirement set as a reusable template. */
router.post(
  "/:id/template",
  h(async (req, res) => {
    const a = await actor(req);
    const { template_name } = req.body ?? {};
    if (!template_name || typeof template_name !== "string") {
      return res.status(400).json({ error: "template_name required" });
    }
    res.json({ requirement: await repo.saveRequirementAsTemplate(a, req.params.id, template_name) });
  }),
);

/** Delete a requirement set. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await repo.deleteRequirement(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
