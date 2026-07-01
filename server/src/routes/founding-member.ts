/**
 * Intelligence Moat - F7 Founding Member Performance Center routes.
 * Mount base: /api/founding-member.
 *
 *   GET  /performance         -> aggregated + scored performance for the actor's
 *                                org (or ?orgId= for an admin).
 *   GET  /status              -> founding-member status + benefit flags.
 *   POST /status              -> upsert founding-member status + benefits.
 *
 * Org access is enforced inside the data layer (member-attendee.ts): a
 * non-admin actor may only read / set their OWN org. IDOR-safe.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as ma from "../db/member-attendee.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Aggregated + scored performance for the actor's org (admins may pass ?orgId=). */
router.get(
  "/performance",
  h(async (req, res) => {
    const a = await getActor(req);
    const orgId = typeof req.query.orgId === "string" ? req.query.orgId : null;
    res.json(await ma.gatherPerformance(a, orgId));
  }),
);

/** Founding-member status + benefit flags for the actor's org. */
router.get(
  "/status",
  h(async (req, res) => {
    const a = await getActor(req);
    const orgId = typeof req.query.orgId === "string" ? req.query.orgId : null;
    res.json({ status: await ma.getFoundingMember(a, orgId) });
  }),
);

/** Upsert founding-member status + benefits for the actor's org. */
router.post(
  "/status",
  h(async (req, res) => {
    const a = await getActor(req);
    const { orgId, isFounding, benefits } = req.body ?? {};
    res.json({ status: await ma.setFoundingMember(a, { orgId, isFounding, benefits }) });
  }),
);

export default router;
