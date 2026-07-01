/**
 * Pricing V2 - Featured Vendor routes. Mount base: /api/featured.
 *
 *   GET    /api/featured          status for the acting org (price + featured?)
 *   POST   /api/featured/buy      buy / re-activate the $49/mo upgrade (record only)
 *   POST   /api/featured/cancel   turn the upgrade off
 *
 * Everything is gated on PRICING_V2: when the flag is off the upgrade is not
 * available and buy/cancel return 404 so legacy behavior is untouched. This is
 * advertising, not membership: it never moves money (record / track only) and
 * never changes platform fees, bid access, or seats.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as featured from "../db/featured.js";
import { PRICING_V2 } from "../config.js";

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

/** Featured status for the acting org (price, whether currently featured). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await featured.statusFor(a.org?.id ?? null));
  }),
);

/** Buy / re-activate the Featured Vendor advertising upgrade (record only). */
router.post(
  "/buy",
  h(async (req, res) => {
    if (!PRICING_V2) return res.status(404).json({ error: "Featured Vendor is not available." });
    const a = await actor(req);
    if (!a.org?.id) return res.status(400).json({ error: "Set up your account first." });
    if (a.org.type !== "vendor") {
      return res.status(403).json({ error: "Featured Vendor is for vendor accounts." });
    }
    const row = await featured.buyFeatured(a.org.id, req.body?.processor_ref ?? null);
    res.status(201).json({ placement: row, status: await featured.statusFor(a.org.id) });
  }),
);

/** Cancel the Featured Vendor upgrade for the acting org. */
router.post(
  "/cancel",
  h(async (req, res) => {
    if (!PRICING_V2) return res.status(404).json({ error: "Featured Vendor is not available." });
    const a = await actor(req);
    if (!a.org?.id) return res.status(400).json({ error: "Set up your account first." });
    await featured.cancelFeatured(a.org.id);
    res.json({ status: await featured.statusFor(a.org.id) });
  }),
);

export default router;
