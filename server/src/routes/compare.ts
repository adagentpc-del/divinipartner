/**
 * Comparison routes. Mount base: /api/compare. Requires a signed-in user.
 *   POST /venues   { ids: string[] }   compare up to 10 venues
 *   POST /vendors  { ids: string[] }   compare up to 10 vendors
 *   POST /quotes   { ids: string[] }   compare up to 10 quotes (event-access
 *                                       gated, and capped by the org's real
 *                                       quotes.compare plan limit -- Divini
 *                                       Quote Compare, see db/compare.ts)
 * Each returns { result: CompareResult } with a row-level table + pros/cons.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as cmp from "../db/compare.js";
import { QuoteCompareLimitError } from "../db/compare.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof QuoteCompareLimitError) {
        res.status(402).json(err.payload);
        return;
      }
      next(err);
    });

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Selectable venue list for the compare picker. */
router.get(
  "/venues/list",
  h(async (req, res) => {
    await actor(req);
    res.json({ venues: await cmp.listVenuesForCompare((req.query.q as string) || undefined) });
  }),
);

router.post(
  "/venues",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ result: await cmp.compareVenues(a, req.body?.ids) });
  }),
);

router.post(
  "/vendors",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ result: await cmp.compareVendors(a, req.body?.ids) });
  }),
);

router.post(
  "/quotes",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ result: await cmp.compareQuotes(a, req.body?.ids) });
  }),
);

export default router;
