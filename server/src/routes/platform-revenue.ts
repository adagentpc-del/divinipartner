/**
 * Platform Revenue accrual ledger routes. Mount base: /api/platform-revenue.
 * SUPER-ADMIN ONLY (requireAdmin).
 *
 * The accrual ledger (db/schema-rev-accrual.sql, table platform_revenue) is
 * written automatically by the monetization hook on every recorded on-platform
 * payment, so the platform fee can never be silently skipped. These routes let a
 * super-admin SEE the accrued obligations and explicitly change a row's status:
 * a fee can only be removed from the books via an explicit waive or void, never
 * silently.
 *
 *   GET   /api/platform-revenue              list ledger rows (?status, ?limit)
 *   GET   /api/platform-revenue/summary      rollup by status (+ referral split)
 *   PATCH /api/platform-revenue/:id/status   set status (accrued|invoiced|
 *                                            collected|waived|void) + optional note
 *
 * Reads/writes only the platform_revenue table. Degrades to empty + available
 * false when the ledger table is not present (partially-migrated database).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin, getAuth } from "../auth.js";
import { q, q1 } from "../pool.js";
// Stripe Connect split-payout rail: when a revenue row is marked collected, the
// agreed referral-partner split is queued onto the payout_instructions queue for
// a 1-click admin release. Best-effort + idempotent; never breaks this flow.
import { enqueueSplitsForRevenue } from "../lib/split-engine.js";
// Wave 5 - read-only platform dashboard rollup (GMV, fees, venue share paid, net
// platform revenue, top venues / vendors). Lives in the shared metrics helper
// alongside the venue and vendor aggregates; exposed here behind requireAdmin.
import { adminDashboardMetrics } from "../db/metrics.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const REVENUE_STATUSES = ["accrued", "invoiced", "collected", "waived", "void"] as const;
type RevenueStatus = (typeof REVENUE_STATUSES)[number];

async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [`public.${name}`]);
  return !!row?.reg;
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
};

const router = Router();
router.use(requireAdmin);

/** List ledger rows, newest first. Optional ?status filter and ?limit (max 500). */
router.get(
  "/",
  h(async (req, res) => {
    if (!(await tableExists("platform_revenue"))) {
      return res.json({ rows: [], available: false });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const params: unknown[] = [];
    let where = "";
    if (status && (REVENUE_STATUSES as readonly string[]).includes(status)) {
      params.push(status);
      where = `where pr.status = $${params.length}`;
    }
    params.push(limit);
    const rows = await q(
      `select pr.*, o.name as organization_name, p.name as referral_partner_name
         from platform_revenue pr
         left join organizations o on o.id = pr.organization_id
         left join partners p on p.id = pr.referral_partner_id
        ${where}
        order by pr.created_at desc
        limit $${params.length}`,
      params,
    );
    res.json({ rows, available: true });
  }),
);

/** Rollup by status (cents) plus the accrued referral split. */
router.get(
  "/summary",
  h(async (_req, res) => {
    if (!(await tableExists("platform_revenue"))) {
      return res.json({ summary: null, available: false });
    }
    const r = await q1<Record<string, string>>(
      `select
         coalesce(sum(fee_cents) filter (where status = 'accrued'),0)   as accrued_cents,
         coalesce(sum(fee_cents) filter (where status = 'invoiced'),0)  as invoiced_cents,
         coalesce(sum(fee_cents) filter (where status = 'collected'),0) as collected_cents,
         coalesce(sum(fee_cents) filter (where status = 'waived'),0)    as waived_cents,
         coalesce(sum(fee_cents) filter (where status = 'void'),0)      as void_cents,
         coalesce(sum(referral_split_cents) filter (where status <> 'void'),0) as referral_split_cents,
         count(*) as row_count
       from platform_revenue`,
    );
    res.json({
      summary: {
        accrued_cents: n(r?.accrued_cents),
        invoiced_cents: n(r?.invoiced_cents),
        collected_cents: n(r?.collected_cents),
        waived_cents: n(r?.waived_cents),
        void_cents: n(r?.void_cents),
        referral_split_cents: n(r?.referral_split_cents),
        row_count: n(r?.row_count),
      },
      available: true,
    });
  }),
);

/**
 * Wave 5 - platform admin dashboard rollup. Read-only analytics over the fee +
 * venue-share ledgers for the SuperAdmin dashboard tiles: gross marketplace
 * volume, platform fees collected, venue revenue share paid, net platform
 * revenue (fees - venue share paid - processing), top venues by share earned,
 * top vendors by revenue. Degrades to zeros + available false when the ledger
 * is absent. Behind requireAdmin (router-level guard above).
 */
router.get(
  "/admin-dashboard",
  h(async (_req, res) => {
    const { metrics, available } = await adminDashboardMetrics();
    res.json({ metrics, available });
  }),
);

/**
 * Set a ledger row's status. This is the ONLY way to take an accrued fee off the
 * books: an explicit waive or void by a super-admin. The change is recorded in
 * audit_logs so the decision is auditable.
 */
router.patch(
  "/:id/status",
  h(async (req, res) => {
    if (!(await tableExists("platform_revenue"))) {
      return res.status(404).json({ error: "ledger not available" });
    }
    const status = (req.body ?? {}).status as RevenueStatus;
    if (!status || !(REVENUE_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: `status must be one of ${REVENUE_STATUSES.join(", ")}` });
    }
    const note = typeof (req.body ?? {}).note === "string" ? (req.body as { note: string }).note : null;
    const prev = await q1<{ status: string }>(`select status from platform_revenue where id = $1`, [req.params.id]);
    if (!prev) return res.status(404).json({ error: "not found" });

    const row = await q1(
      `update platform_revenue
          set status = $2,
              note = coalesce($3, note),
              updated_at = now()
        where id = $1
        returning *`,
      [req.params.id, status, note],
    );

    const auth = getAuth(req);
    await q1(
      `insert into audit_logs (actor_id, action, object_type, object_id, previous_value, new_value)
       values ($1,'platform_revenue.status','platform_revenue',$2,$3::jsonb,$4::jsonb)`,
      [
        auth.userId,
        req.params.id,
        JSON.stringify({ status: prev.status }),
        JSON.stringify({ status, note }),
      ],
    ).catch(() => null);

    // When a fee transitions INTO 'collected', queue the agreed referral-partner
    // split onto the Stripe Connect payout rail for a 1-click admin release. This
    // is idempotent (a revenue id that already has instructions is skipped) and
    // best-effort (it never throws), so it can never break the status change. It
    // does NOT move money: it only enqueues a 'pending'/'ready' instruction.
    if (status === "collected" && prev.status !== "collected") {
      await enqueueSplitsForRevenue(req.params.id, auth.email).catch(() => undefined);
    }

    res.json({ row });
  }),
);

export default router;
