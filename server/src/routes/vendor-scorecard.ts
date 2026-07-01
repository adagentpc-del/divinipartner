/**
 * Phase 3 Intelligence - Composite Vendor Scorecard routes.
 * Mount base: /vendor-scorecard (the lead wires the mount in routes.ts).
 *
 *   GET /mine          the signed-in vendor's own composite scorecard
 *   GET /:vendorId     a vendor's composite scorecard (org-scoped, IDOR-safe)
 *
 * Composes:
 *   - server/src/db/vendor-readiness.ts (getVendorReadiness) for the existing
 *     0..100 readiness score (which itself composes lib/vendorReadiness.ts), AND
 *     getMyVendorId for the IDOR-safe self lookup at /mine.
 *   - server/src/lib/vendorScorecard.ts (buildVendorScorecard) to layer the spec
 *     fields on top into one composite scorecard.
 * The operational metrics (response/quote time, win rate, on-time, change
 * orders, satisfaction, issues, rework, revenue) are pulled from the live tables
 * (quotes, invoices, change_orders, tasks, reviews) BY NAME, each probed with
 * to_regclass so an absent table degrades to null (unknown) rather than failing.
 *
 * IDOR posture: mirrors server/src/db/vendor-readiness.ts. getVendorReadiness
 * already asserts the actor's org owns the vendor (or admin); /mine resolves the
 * actor's OWN vendor id, so a vendor never needs to know an id. notify
 * (vendorScorecardUpdated) is optional and best-effort.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1 } from "../pool.js";
import { getVendorReadiness, getMyVendorId } from "../db/vendor-readiness.js";
import { buildVendorScorecard, type VendorScorecardMetrics } from "../lib/vendorScorecard.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

/** True when a relation exists (so optional metric sources degrade gracefully). */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

/** Hours between two ISO timestamps, or null when either is missing/invalid. */
function hoursBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.max(0, (tb - ta) / 3600000);
}

/**
 * Gather the operational scorecard metrics for a vendor from the live tables.
 * Every table read is guarded by to_regclass, and missing data stays null so the
 * pure engine renders it as "unknown" rather than a fabricated zero. The
 * exceptions are the explicit COUNT metrics (change orders / issues / rework),
 * which are naturally 0 when none exist.
 */
async function gatherMetrics(vendorId: string): Promise<VendorScorecardMetrics> {
  const m: VendorScorecardMetrics = {};

  // --- quotes: win rate + quote turnaround (request -> sent) ---
  if (await tableExists("quotes")) {
    const won = await q1<{ total: string; accepted: string }>(
      `select count(*) as total,
              count(*) filter (where status = 'accepted') as accepted
         from quotes where vendor_id = $1`,
      [vendorId],
    );
    const total = num(won?.total);
    if (total > 0) m.win_rate = num(won?.accepted) / total;

    // Quote turnaround: from the parent bid's created_at to the quote created_at,
    // when a bids table links them. Best-effort; null when unavailable.
    if (await tableExists("bids")) {
      const tr = await q1<{ avg_hours: string | null }>(
        `select avg(extract(epoch from (qt.created_at - b.created_at)) / 3600.0) as avg_hours
           from quotes qt
           join bids b on b.id = qt.bid_id
          where qt.vendor_id = $1 and qt.created_at is not null and b.created_at is not null`,
        [vendorId],
      );
      const avg = tr?.avg_hours != null ? Number(tr.avg_hours) : null;
      if (avg != null && Number.isFinite(avg) && avg >= 0) m.avg_quote_turnaround_hours = avg;
    }
  }

  // --- invoices: revenue generated + jobs completed (paid invoices) ---
  if (await tableExists("invoices")) {
    const inv = await q1<{ revenue: string; jobs: string }>(
      `select coalesce(sum(total),0) as revenue,
              count(distinct event_id) filter (where event_id is not null) as jobs
         from invoices where vendor_id = $1`,
      [vendorId],
    );
    m.revenue_generated = num(inv?.revenue);
    const jobs = num(inv?.jobs);
    if (jobs > 0) m.jobs_completed = jobs;
  }

  // --- change_orders: count against this vendor's quotes/invoices/events ---
  if (await tableExists("change_orders")) {
    const co = await q1<{ c: string }>(
      `select count(*) as c
         from change_orders co
        where co.quote_id in (select id from quotes where vendor_id = $1)
           or co.invoice_id in (select id from invoices where vendor_id = $1)`,
      [vendorId],
    );
    m.change_orders = num(co?.c);
  }

  // --- reviews: client satisfaction (avg rating where the vendor is reviewee) ---
  // reviews.reviewee_id is a user; map the vendor to its org's users.
  if (await tableExists("reviews")) {
    const rv = await q1<{ avg_rating: string | null; n: string }>(
      `select avg(r.rating) as avg_rating, count(*) as n
         from reviews r
        where r.reviewee_id in (
                select u.id from users u
                  join vendors v on v.organization_id = u.organization_id
                 where v.id = $1)`,
      [vendorId],
    );
    if (num(rv?.n) > 0 && rv?.avg_rating != null) {
      m.client_satisfaction = Number(rv.avg_rating);
    }
  }

  // --- tasks: issue + rework counts + on-time delivery, on this vendor's events ---
  if ((await tableExists("tasks")) && (await tableExists("invoices"))) {
    // Scope tasks to events this vendor has invoiced (a reasonable vendor->event link).
    const issues = await q1<{ issues: string; rework: string }>(
      `select
          count(*) filter (where lower(coalesce(category,'')) like '%issue%'
                              or lower(coalesce(category,'')) like '%defect%'
                              or lower(coalesce(name,'')) like '%issue%') as issues,
          count(*) filter (where lower(coalesce(category,'')) like '%rework%'
                              or lower(coalesce(name,'')) like '%rework%'
                              or lower(coalesce(name,'')) like '%redo%') as rework
         from tasks
        where event_id in (select distinct event_id from invoices where vendor_id = $1 and event_id is not null)`,
      [vendorId],
    );
    m.issue_count = num(issues?.issues);
    m.rework_count = num(issues?.rework);

    // On-time delivery: share of completed/done tasks finished on or before due.
    const onTime = await q1<{ total: string; on_time: string }>(
      `select count(*) filter (where status in ('done','completed') and due_date is not null) as total,
              count(*) filter (where status in ('done','completed') and due_date is not null
                                 and created_at <= due_date) as on_time
         from tasks
        where event_id in (select distinct event_id from invoices where vendor_id = $1 and event_id is not null)`,
      [vendorId],
    );
    const t = num(onTime?.total);
    if (t > 0) m.on_time_rate = num(onTime?.on_time) / t;
  }

  // --- response time: from a bid invitation/creation to the vendor's first quote ---
  // Reuses the quotes+bids linkage already probed above as a proxy when present.
  if ((await tableExists("quotes")) && (await tableExists("bids"))) {
    const resp = await q1<{ avg_hours: string | null }>(
      `select avg(extract(epoch from (qt.created_at - b.created_at)) / 3600.0) as avg_hours
         from (
           select bid_id, min(created_at) as created_at
             from quotes where vendor_id = $1 and bid_id is not null
            group by bid_id
         ) qt
         join bids b on b.id = qt.bid_id
        where b.created_at is not null`,
      [vendorId],
    );
    const avg = resp?.avg_hours != null ? Number(resp.avg_hours) : null;
    if (avg != null && Number.isFinite(avg) && avg >= 0) m.avg_response_hours = avg;
  }

  return m;
}

const router = Router();
router.use(requireUser);

/** The signed-in vendor's own composite scorecard (no id needed, IDOR-safe). */
router.get(
  "/mine",
  h(async (req, res) => {
    const a = await actor(req);
    const vendorId = await getMyVendorId(a);
    if (!vendorId) return res.json({ vendorId: null, scorecard: null });
    const { score } = await getVendorReadiness(a, vendorId);
    const metrics = await gatherMetrics(vendorId);
    const scorecard = buildVendorScorecard(vendorId, score, metrics);
    res.json({ vendorId, scorecard });
  }),
);

/** A vendor's composite scorecard. getVendorReadiness enforces org ownership. */
router.get(
  "/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    const vendorId = String(req.params.vendorId);
    if (!UUID_RE.test(vendorId)) {
      return res.status(400).json({ error: "valid vendorId (uuid) required" });
    }
    // getVendorReadiness asserts the actor's org owns the vendor (or admin) and
    // throws Forbidden/NotFound otherwise, so this is IDOR-safe.
    const { score } = await getVendorReadiness(a, vendorId);
    const metrics = await gatherMetrics(vendorId);
    const scorecard = buildVendorScorecard(vendorId, score, metrics);
    res.json({ vendorId, scorecard });
  }),
);

export default router;
