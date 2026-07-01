/**
 * Phase 4 - Package routes. Mounted at /api/packages.
 *
 * Org-scoped CRUD for named bundles of inventory + services (blueprint 17).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as pkg from "../db/packages.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function requireOrg(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor.org.id;
}

const router = Router();

// GET /api/packages - list (optional ?status=)
router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const packages = await pkg.listPackages(orgId, status);
    res.json({ packages });
  }),
);

// GET /api/packages/:id - single
router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await pkg.getPackage(orgId, req.params.id);
    if (!item) return res.status(404).json({ error: "not found" });
    res.json({ package: item });
  }),
);

// POST /api/packages - create
router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await pkg.createPackage(orgId, req.body ?? {});
    res.status(201).json({ package: item });
  }),
);

// PUT /api/packages/:id - update
router.put(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await pkg.updatePackage(orgId, req.params.id, req.body ?? {});
    res.json({ package: item });
  }),
);

// DELETE /api/packages/:id - remove
router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const ok = await pkg.deletePackage(orgId, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

export default router;
