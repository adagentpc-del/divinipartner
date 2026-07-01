/**
 * Account Assignment routes (Phase 1, Workstream A). Mount base:
 * /api/account-assignments.
 *
 * Assign a vendor team member as owner / collaborator / backup of an account (a
 * venue, client org, or event), and list current assignments. Mutations are gated
 * on the acting user holding the `assign_accounts` permission via their vendor
 * sub-role; reads are org-scoped to the actor's own organization. Mirrors
 * server/src/routes/vendor-requirements.ts patterns.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as repo from "../db/vendor-team.js";
import { requireVendorPermission } from "../lib/vendorTeam.js";

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

/**
 * List assignments for the actor's org. Optional filters:
 *   ?subject_type=venue|client|event  ?subject_id=<uuid>  ?member_id=<uuid>
 */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({
      assignments: await repo.listAssignments(a, {
        subject_type: typeof req.query.subject_type === "string" ? req.query.subject_type : null,
        subject_id: typeof req.query.subject_id === "string" ? req.query.subject_id : null,
        member_id: typeof req.query.member_id === "string" ? req.query.member_id : null,
      }),
    });
  }),
);

/** Assign a member to a subject (requires assign_accounts). Idempotent on conflict. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "assign_accounts");
    const { member_id, subject_type, subject_id, role } = req.body ?? {};
    if (!member_id || !subject_type || !subject_id) {
      return res.status(400).json({ error: "member_id, subject_type, subject_id required" });
    }
    res.status(201).json({
      assignment: await repo.assignAccount(a, { member_id, subject_type, subject_id, role }),
    });
  }),
);

/** Remove an assignment (requires assign_accounts). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "assign_accounts");
    await repo.unassignAccount(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
