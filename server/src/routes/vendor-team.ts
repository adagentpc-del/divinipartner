/**
 * Vendor Team routes (Phase 1, Workstream A). Mount base: /api/vendor-team.
 *
 * Manage a vendor org's internal team: list / create / update / remove members,
 * each carrying a vendor sub-role (validated against VENDOR_TEAM_ROLES). All
 * mutations are gated on the acting user holding the `manage_team` permission via
 * their own vendor sub-role (requireVendorPermission); reads are org-scoped to the
 * actor's own organization. Mirrors server/src/routes/vendor-requirements.ts:
 * requireUser, getActor, the h() async wrapper, ForbiddenError/NotFoundError from
 * the repo.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as repo from "../db/vendor-team.js";
import { requireVendorPermission, resolveVendorRole, actorVendorCan } from "../lib/vendorTeam.js";
import { VENDOR_TEAM_ROLES } from "../lib/vendorPermissions.js";

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

/** The available vendor sub-roles (for the add-member dropdown). */
router.get(
  "/roles",
  h(async (_req, res) => {
    res.json({ roles: VENDOR_TEAM_ROLES });
  }),
);

/**
 * The acting user's own vendor sub-role + a permission summary, so the UI can
 * show/hide controls. Returns role: null when the user is not on a team.
 */
router.get(
  "/me",
  h(async (req, res) => {
    const a = await actor(req);
    const role = await resolveVendorRole(a);
    res.json({
      role,
      can: {
        manage_team: await actorVendorCan(a, "manage_team"),
        assign_accounts: await actorVendorCan(a, "assign_accounts"),
        view_intake: await actorVendorCan(a, "view_intake"),
        approve_sales: await actorVendorCan(a, "approve_sales"),
        approve_pm: await actorVendorCan(a, "approve_pm"),
        edit_quote: await actorVendorCan(a, "edit_quote"),
      },
    });
  }),
);

/** List the actor's org's team members. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ members: await repo.listTeamMembers(a) });
  }),
);

/** Create a team member (requires manage_team). */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "manage_team");
    res.status(201).json({ member: await repo.createTeamMember(a, req.body ?? {}) });
  }),
);

/** Get one team member. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ member: await repo.getTeamMember(a, req.params.id) });
  }),
);

/** Patch a team member (requires manage_team). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "manage_team");
    res.json({ member: await repo.updateTeamMember(a, req.params.id, req.body ?? {}) });
  }),
);

/** Soft-remove a team member (requires manage_team). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "manage_team");
    await repo.removeTeamMember(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
