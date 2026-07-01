/**
 * Nonprofit / Charity core - ticket-packages routes. Mount base:
 * /api/ticket-packages.
 *
 * CRUD over ticket / table packages (individual, VIP, table, sponsor_table) for
 * a nonprofit's fundraising event. Packages are listed/created under a
 * fundraising event and patched/deleted by their own id. Org-scoped + IDOR-safe
 * via the fundraising repo. Mirrors server/src/routes/venue-twin.ts conventions.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as fr from "../db/fundraising.js";

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

/** List ticket / table packages for a fundraising event (org-scoped). */
router.get(
  "/event/:fundraisingEventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ packages: await fr.listTicketPackages(a, req.params.fundraisingEventId) });
  }),
);

/** Create a ticket / table package for a fundraising event (org-scoped). */
router.post(
  "/event/:fundraisingEventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({
      package: await fr.createTicketPackage(a, req.params.fundraisingEventId, req.body ?? {}),
    });
  }),
);

/** Patch a ticket package (org-scoped). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ package: await fr.updateTicketPackage(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a ticket package (org-scoped). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await fr.deleteTicketPackage(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
