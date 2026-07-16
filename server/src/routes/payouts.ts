/**
 * Partner Payouts routes. Mount base: /api/payouts
 *
 * SUPER-ADMIN (requireAdmin = ADMIN_ALLOWED_EMAILS) owns the whole payout
 * surface. Every payout-setting change writes an audit entry. This module
 * records and tracks payouts; it NEVER moves money (a real ACH provider is
 * required for disbursement).
 *
 *   GET    /meta                          status vocabulary + partner list
 *   GET    /                              list all payouts (optionally ?partnerId=)
 *   POST   /compute                       compute/refresh a partner+period payout
 *   GET    /:id                           one payout
 *   POST   /:id/status                    set status (approved/scheduled/paid/held/...)
 *   POST   /:id/pause                     pause/unpause
 *   POST   /:id/require-approval          set requires_approval
 *   POST   /:id/override-commission       override commission pct / owed
 *   POST   /:id/manual-adjustment         add a manual adjustment (cents)
 *   POST   /:id/mark-paid                 mark paid (notify.partnerPayoutSent)
 *   POST   /:id/mark-scheduled            mark scheduled
 *   GET    /export                        CSV-able JSON export
 *   Exclusion controls (per partner):
 *   GET    /exclusions/:partnerId
 *   POST   /exclude-client                { partner_id, org_id }
 *   POST   /exclude-transaction           { partner_id, payment_id }
 *
 * PARTNER-FACING (signed-in, scoped to their own partner_id): a masked read of
 * their payment-method status + their own payout statuses (no client financials).
 *   GET    /me/:partnerId
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin, requireUser } from "../auth.js";
import * as payouts from "../db/payouts.js";
import * as engine from "../lib/payoutEngine.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import * as db from "../db.js";
import { getPartnerForUser } from "../db/partners.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

const router = Router();

// ===========================================================================
// PARTNER-FACING read (signed-in). Masked, no client financials.
// Must be declared BEFORE the admin guard so partners can reach it.
// ===========================================================================
router.get(
  "/me/:partnerId",
  requireUser,
  h(async (req, res) => {
    const partnerId = req.params.partnerId;
    // IDOR gate: a signed-in user may read ONLY their own partner's payout data.
    // Without this, any authenticated user could enumerate /me/:partnerId and
    // read another partner's commission amounts and bank last4/name. Admins
    // (ADMIN_ALLOWED_EMAILS) may read any partner for support.
    const auth = getAuth(req);
    if (!auth.isAdmin) {
      const actor = await db.getActor(auth.userId!, auth.email);
      const own = await getPartnerForUser(actor.user.id, actor.org?.id ?? null);
      if (!own || own.id !== partnerId) {
        return res.status(403).json({ error: "forbidden" });
      }
    }
    const method = await payouts.paymentMethodStatus(partnerId);
    const rows = await payouts.listPayouts(partnerId);
    res.json({
      paymentMethod: method,
      payouts: rows.map((p) => ({
        id: p.id,
        period: p.period,
        commission_owed_cents: Number(p.commission_owed_cents),
        commission_paid_cents: Number(p.commission_paid_cents),
        status: p.status,
        paused: p.paused,
      })),
    });
  }),
);

// ===========================================================================
// Everything below is SUPER-ADMIN only.
// ===========================================================================
router.use(requireAdmin);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      statuses: payouts.PAYOUT_STATUSES,
      partners: await payouts.listPartners(),
    });
  }),
);

router.get(
  "/export",
  h(async (req, res) => {
    const partnerId = (req.query.partnerId as string) || undefined;
    res.json(await engine.exportPayouts(partnerId));
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const partnerId = (req.query.partnerId as string) || undefined;
    res.json({ payouts: await payouts.listPayouts(partnerId) });
  }),
);

// Compute / refresh a partner+period payout from partner_commissions.
router.post(
  "/compute",
  h(async (req, res) => {
    const auth = getAuth(req);
    const b = req.body ?? {};
    if (!b.partner_id || !b.period) {
      return res.status(400).json({ error: "partner_id and period required" });
    }
    const result = await engine.computePayout(String(b.partner_id), String(b.period), {
      commissionPctOverride: b.commission_pct ?? null,
      manualAdjustmentCents: Number(b.manual_adjustment_cents ?? 0),
      basis: b.basis ?? undefined,
    });
    await logAction(
      { id: auth.userId, email: auth.email },
      "payout.computed",
      "partner_payout",
      result.saved.id,
      null,
      {
        partner_id: result.partner_id,
        period: result.period,
        net_profit_cents: result.net_profit_cents,
        commission_owed_cents: result.commission_owed_cents,
        commissionsPresent: result.commissionsPresent,
      },
      { summary: "Super-admin computed a partner payout", ip: clientIp(req) },
    );
    res.json({ payout: result.saved, computed: result });
  }),
);

router.get(
  "/exclusions/:partnerId",
  h(async (req, res) => {
    res.json(await payouts.listExclusions(req.params.partnerId));
  }),
);

router.post(
  "/exclude-client",
  h(async (req, res) => {
    const auth = getAuth(req);
    const b = req.body ?? {};
    if (!b.partner_id || !b.org_id) {
      return res.status(400).json({ error: "partner_id and org_id required" });
    }
    await payouts.excludeClient(String(b.partner_id), String(b.org_id));
    await logAction(
      { id: auth.userId, email: auth.email },
      "payout.client_excluded",
      "partner_payout",
      null,
      null,
      { partner_id: b.partner_id, org_id: b.org_id },
      { summary: "Super-admin excluded a client from a partner payout", ip: clientIp(req) },
    );
    res.json({ ok: true });
  }),
);

router.post(
  "/exclude-transaction",
  h(async (req, res) => {
    const auth = getAuth(req);
    const b = req.body ?? {};
    if (!b.partner_id || !b.payment_id) {
      return res.status(400).json({ error: "partner_id and payment_id required" });
    }
    await payouts.excludeTransaction(String(b.partner_id), String(b.payment_id));
    await logAction(
      { id: auth.userId, email: auth.email },
      "payout.transaction_excluded",
      "partner_payout",
      null,
      null,
      { partner_id: b.partner_id, payment_id: b.payment_id },
      { summary: "Super-admin excluded a transaction from a partner payout", ip: clientIp(req) },
    );
    res.json({ ok: true });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const row = await payouts.getPayout(req.params.id);
    if (!row) return res.status(404).json({ error: "payout not found" });
    res.json({ payout: row });
  }),
);

// --- mutation helper: load prev, patch, audit -------------------------------
async function applyPatch(
  req: Request,
  res: Response,
  action: string,
  fields: Parameters<typeof payouts.patchPayout>[1],
  summary: string,
) {
  const auth = getAuth(req);
  const prev = await payouts.getPayout(req.params.id);
  if (!prev) return res.status(404).json({ error: "payout not found" });
  const next = await payouts.patchPayout(req.params.id, fields);
  await logAction(
    { id: auth.userId, email: auth.email },
    action,
    "partner_payout",
    req.params.id,
    prev,
    next,
    { summary, ip: clientIp(req) },
  );
  res.json({ payout: next });
}

router.post(
  "/:id/status",
  h(async (req, res) => {
    const status = (req.body ?? {}).status;
    if (!payouts.PAYOUT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    await applyPatch(req, res, "payout.status_changed", { status }, `Payout status set to ${status}`);
  }),
);

router.post(
  "/:id/pause",
  h(async (req, res) => {
    const paused = !!(req.body ?? {}).paused;
    await applyPatch(
      req,
      res,
      "payout.pause_changed",
      { paused },
      paused ? "Payout paused" : "Payout unpaused",
    );
  }),
);

router.post(
  "/:id/require-approval",
  h(async (req, res) => {
    const requires_approval = !!(req.body ?? {}).requires_approval;
    await applyPatch(
      req,
      res,
      "payout.require_approval_changed",
      { requires_approval },
      `requires_approval set to ${requires_approval}`,
    );
  }),
);

router.post(
  "/:id/override-commission",
  h(async (req, res) => {
    const b = req.body ?? {};
    const fields: Parameters<typeof payouts.patchPayout>[1] = {};
    if (b.commission_pct != null) fields.commission_pct = Number(b.commission_pct);
    if (b.commission_owed_cents != null)
      fields.commission_owed_cents = Math.trunc(Number(b.commission_owed_cents));
    if (b.note != null) fields.note = String(b.note);
    if (!Object.keys(fields).length) {
      return res.status(400).json({ error: "nothing to override" });
    }
    await applyPatch(req, res, "payout.commission_overridden", fields, "Commission overridden");
  }),
);

router.post(
  "/:id/manual-adjustment",
  h(async (req, res) => {
    const cents = Math.trunc(Number((req.body ?? {}).manual_adjustment_cents ?? 0));
    const prev = await payouts.getPayout(req.params.id);
    if (!prev) return res.status(404).json({ error: "payout not found" });
    // Re-derive commission_owed = base + adjustment, where base = owed minus the
    // previous adjustment, so adjustments are not double-counted.
    const prevAdj = Number(prev.manual_adjustment_cents);
    const base = Number(prev.commission_owed_cents) - prevAdj;
    await applyPatch(
      req,
      res,
      "payout.manual_adjustment",
      { manual_adjustment_cents: cents, commission_owed_cents: base + cents },
      `Manual adjustment set to ${cents} cents`,
    );
  }),
);

router.post(
  "/:id/mark-scheduled",
  h(async (req, res) => {
    await applyPatch(
      req,
      res,
      "payout.scheduled",
      { status: "scheduled" },
      "Payout marked scheduled",
    );
  }),
);

// Mark paid: records the disbursement event + notifies the partner. Does NOT
// move money (a real ACH provider is required for that).
router.post(
  "/:id/mark-paid",
  h(async (req, res) => {
    const auth = getAuth(req);
    const prev = await payouts.getPayout(req.params.id);
    if (!prev) return res.status(404).json({ error: "payout not found" });
    const paidCents = Number(prev.commission_owed_cents);
    const next = await payouts.patchPayout(req.params.id, {
      status: "paid",
      commission_paid_cents: paidCents,
    });
    await logAction(
      { id: auth.userId, email: auth.email },
      "payout.marked_paid",
      "partner_payout",
      req.params.id,
      prev,
      next,
      { summary: `Payout marked paid (${paidCents} cents recorded)`, ip: clientIp(req) },
    );
    // Notify the partner (best-effort). Resolve a contact email from onboarding.
    if (prev.partner_id) {
      const method = await payouts.paymentMethodStatus(prev.partner_id);
      const partner = await payouts.getPartner(prev.partner_id);
      const onb = await payouts.listOnboarding();
      const rec = onb.find((o) => o.partner_id === prev.partner_id);
      const to = rec?.email || null;
      const label = `$${(paidCents / 100).toLocaleString()}`;
      if (to) {
        await notify
          .partnerPayoutSent(to, label, {
            partner: partner?.name ?? partner?.company ?? null,
            period: prev.period,
            account_last4: method.account_last4,
          })
          .catch(() => undefined);
      }
    }
    res.json({ payout: next });
  }),
);

export default router;
