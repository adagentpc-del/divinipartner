/**
 * Shareable Bid Links - PUBLIC surface (no auth). Mount base: /api/public/bids.
 *
 *   GET  /:token         resolve the public bid payload (records a view)
 *   POST /:token/track   log a funnel step { kind, email?, org_id?, meta? }
 *
 * This router intentionally does NOT require a signed-in user: the whole point
 * is that a vendor/sponsor who received the link out of band can see the bid and
 * start registering. Only whitelisted fields are returned; a draft/closed bid or
 * an inactive/unknown token yields 404.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as shares from "../db/bidShares.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/:token",
  h(async (req, res) => {
    const view = await shares.getPublicBidByToken(req.params.token);
    if (!view) return res.status(404).json({ error: "This bid link is no longer available." });
    res.json({ bid_share: view });
  }),
);

router.post(
  "/:token/track",
  h(async (req, res) => {
    const { kind, email, org_id, meta } = req.body ?? {};
    if (!kind || typeof kind !== "string") {
      return res.status(400).json({ error: "kind required" });
    }
    await shares.trackShareFunnel(req.params.token, kind, {
      email: typeof email === "string" ? email : null,
      org_id: typeof org_id === "string" ? org_id : null,
      meta,
    });
    res.status(204).end();
  }),
);

export default router;
