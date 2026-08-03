/**
 * Multi-org membership + switcher. Mounted by the parent at /api/orgs.
 *
 *   GET  /api/orgs/mine    every org this user belongs to, flagged with which
 *                          one is currently active on their session
 *   POST /api/orgs         create an ADDITIONAL organization for this user
 *                          (e.g. a planner who also runs a venue)
 *   POST /api/orgs/switch  change which org is active on this session
 *
 * A user's first organization is still created by POST /register
 * (routes/foundation.ts) at signup; this router is for everything after
 * that: adding a second (or third) org, and switching between them.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { ROLES, type Role } from "../db.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/mine",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const orgs = await db.listMyOrganizations(auth.userId!);
    res.json({ organizations: orgs });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const b = req.body ?? {};
    const role = String(b.role || "") as Role;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ROLES.join(", ")}` });
    }
    const orgName = String(b.orgName || "").trim();
    if (!orgName) return res.status(400).json({ error: "orgName is required" });

    const org = await db.addOrganization(auth.userId!, {
      role,
      orgName,
      makeActive: !!b.makeActive,
    });
    res.status(201).json({ organization: org });
  }),
);

router.post(
  "/switch",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const organizationId = String(req.body?.organizationId || "");
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
    const org = await db.switchActiveOrganization(auth.userId!, organizationId);
    if (!org) return res.status(403).json({ error: "not a member of that organization" });
    res.json({ organization: org });
  }),
);

export default router;
