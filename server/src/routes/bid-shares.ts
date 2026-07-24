/**
 * Shareable Bid Links - owner management. Mount base: /api/bid-shares.
 * Requires a signed-in user; every operation is IDOR-gated to the bid's event
 * owner inside the data layer.
 *
 *   POST   /                       create a share link { bid_id, label?, audience? }
 *   GET    /bid/:bidId             list a bid's links (+ funnel counts)
 *   GET    /:id/funnel             the view->register->submit log for a link
 *   POST   /:id/deactivate         turn a link off
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as shares from "../db/bidShares.js";

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

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { bid_id } = req.body ?? {};
    if (!bid_id || typeof bid_id !== "string") {
      return res.status(400).json({ error: "bid_id required" });
    }
    const link = await shares.createShareLink(a, req.body);
    res.status(201).json({ link });
  }),
);

router.get(
  "/bid/:bidId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ links: await shares.listShareLinks(a, req.params.bidId) });
  }),
);

router.get(
  "/:id/funnel",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ funnel: await shares.listShareFunnel(a, req.params.id) });
  }),
);

router.post(
  "/:id/deactivate",
  h(async (req, res) => {
    const a = await actor(req);
    await shares.deactivateShareLink(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
