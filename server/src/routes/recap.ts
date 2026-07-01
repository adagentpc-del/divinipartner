/**
 * Nonprofit post-event recap routes. Mount base: /api/recap.
 *
 * Generate a DETERMINISTIC fundraising performance recap for a fundraising
 * event: goal, total raised (payments when linked, else committed = sponsorship
 * + tickets + donations + paid auction), the per-source breakdown, expenses,
 * net, guest count, sponsor recap summary, and a board report text. Real data
 * only - empty data yields zeros. Generating fires recapReady + boardReportReady.
 * Every route is org-scoped + IDOR-safe via the donor repo (server/src/db/donor.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as donor from "../db/donor.js";
import { notify } from "../lib/notify.js";

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
 * Generate (and return) the recap for a fundraising event. Fires recapReady +
 * boardReportReady to the org. Idempotent / read-only on the data (computes from
 * current rows each time).
 */
router.get(
  "/:fundraisingEventId",
  h(async (req, res) => {
    const a = await actor(req);
    const recap = await donor.generateRecap(a, req.params.fundraisingEventId);
    const orgTo = a.user.email ?? a.org?.name ?? "nonprofit";
    void notify.recapReady(orgTo, recap.eventName, {
      fundraisingEventId: req.params.fundraisingEventId,
      totalRaised: recap.totalRaised,
    });
    void notify.boardReportReady(orgTo, recap.eventName, {
      fundraisingEventId: req.params.fundraisingEventId,
      netRaised: recap.netRaised,
    });
    res.json({ recap });
  }),
);

export default router;
