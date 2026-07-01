/**
 * Phase 7 - Starred / preferred vendor routes. Mount base: /api/starred
 * (blueprint 27.4).
 *
 * Star / unstar partner orgs and surface repeat-relationship prompts ("You have
 * booked this vendor 3 times. Star them?").
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as starred from "../db/starred.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function requireOrg(req: Request, res: Response): Promise<db.Actor | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor;
}

const router = Router();
router.use(requireUser);

/** List the orgs this org has starred. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    res.json({ starred: await starred.listStarred(a.org!.id) });
  }),
);

/** Repeat-relationship prompts (unstarred counterparties booked repeatedly). */
router.get(
  "/repeat-prompts",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const threshold = Number(req.query.threshold) || 2;
    res.json({ prompts: await starred.detectRepeatRelationships(a.org!.id, threshold) });
  }),
);

/** Star a partner org. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const { vendor_org_id } = req.body ?? {};
    if (!vendor_org_id) return res.status(400).json({ error: "vendor_org_id required" });
    res.status(201).json({ starred: await starred.starVendor(a.org!.id, a.user.id, req.body) });
  }),
);

/** Unstar a partner org. */
router.delete(
  "/:vendorOrgId",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const ok = await starred.unstarVendor(a.org!.id, req.params.vendorOrgId);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

export default router;
