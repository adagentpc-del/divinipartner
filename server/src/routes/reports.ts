/**
 * Phase 8 - Reporting / Exports routes. Mount base: /api/reports.
 * requireUser; admin_revenue is admin-only. Each report returns
 * { title, columns, rows } the SPA renders + downloads as CSV.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as reports from "../db/reports.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ types: reports.REPORT_TYPES });
  }),
);

router.get(
  "/event-summary",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ report: await reports.eventSummary(a, isAdmin) });
  }),
);

router.get(
  "/bid-comparison",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const eventId = req.query.event_id as string;
    if (!eventId) return res.status(400).json({ error: "event_id required" });
    res.json({ report: await reports.bidComparison(a, isAdmin, eventId) });
  }),
);

router.get(
  "/payment-report",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ report: await reports.paymentReport(a, isAdmin) });
  }),
);

router.get(
  "/vendor-performance",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ report: await reports.vendorPerformance(a, isAdmin) });
  }),
);

router.get(
  "/admin-revenue",
  h(async (req, res) => {
    const auth = getAuth(req);
    if (!auth.isAdmin) return res.status(403).json({ error: "forbidden" });
    res.json({ report: await reports.adminRevenue() });
  }),
);

export default router;
