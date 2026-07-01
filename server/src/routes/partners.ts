/**
 * Module 1 - Partner admin routes. Mount base: /api/partners.
 *
 * ALL routes here are super-admin gated (requireAdmin = ADMIN_ALLOWED_EMAILS).
 * Super-admins manage partner profiles, their fully-editable revenue-share
 * settings, referral attribution, and the profit-based commission ledger.
 *
 *   GET    /api/partners/meta                 enums for the admin form
 *   GET    /api/partners                      list partners (?status, ?partner_type)
 *   POST   /api/partners                      create a partner (+ referral code/link)
 *   GET    /api/partners/:id                  one partner + referrals + commissions + totals
 *   PATCH  /api/partners/:id                  edit revenue-share settings (audit + notify)
 *   POST   /api/partners/:id/referrals        record attribution (first_touch permanent)
 *   POST   /api/partners/:id/commissions      record a profit-based commission (system op)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import {
  listPartners,
  getPartner,
  createPartner,
  updatePartner,
  recordReferral,
  listReferredOrgs,
  listCommissions,
  commissionTotals,
  recordCommission,
  PARTNER_TYPES,
  COMMISSION_TYPES,
  SUBSCRIPTION_MODES,
  type PartnerSettings,
  type Attribution,
} from "../db/partners.js";
import type { CommissionSource } from "../lib/partnerCommission.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

// Every partner-admin route requires a platform super-admin.
router.use(requireAdmin);

const ATTRIBUTIONS: Attribution[] = ["first_touch", "last_touch", "conversion"];
const COMMISSION_SOURCES: CommissionSource[] = [
  "subscription",
  "transaction",
  "setup",
  "enterprise",
  "manual_adjustment",
];

router.get("/meta", (_req, res) => {
  res.json({
    partner_types: PARTNER_TYPES,
    commission_types: COMMISSION_TYPES,
    subscription_modes: SUBSCRIPTION_MODES,
    attributions: ATTRIBUTIONS,
    commission_sources: COMMISSION_SOURCES,
    duration_kinds: ["lifetime", "limited"],
    statuses: ["active", "paused", "ended"],
  });
});

router.get(
  "/",
  h(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const partner_type = typeof req.query.partner_type === "string" ? req.query.partner_type : undefined;
    const partners = await listPartners({ status, partner_type });
    res.json({ partners });
  }),
);

/** Sanitize an arbitrary body into the editable settings shape. */
function readSettings(body: Record<string, unknown>): PartnerSettings {
  const s: PartnerSettings = {};
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
  const numOrNull = (v: unknown) =>
    v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const boolOrNull = (v: unknown) => (typeof v === "boolean" ? v : v == null ? null : v === "true");

  if ("name" in body) s.name = str(body.name);
  if ("company" in body) s.company = str(body.company);
  if ("organization_id" in body) s.organization_id = str(body.organization_id);
  if ("user_id" in body) s.user_id = str(body.user_id);
  if ("partner_type" in body && PARTNER_TYPES.includes(body.partner_type as never))
    s.partner_type = body.partner_type as PartnerSettings["partner_type"];
  if ("revenue_share_pct" in body) s.revenue_share_pct = numOrNull(body.revenue_share_pct);
  if ("commission_type" in body && COMMISSION_TYPES.includes(body.commission_type as never))
    s.commission_type = body.commission_type as PartnerSettings["commission_type"];
  if ("flat_fee_cents" in body) s.flat_fee_cents = numOrNull(body.flat_fee_cents);
  if ("applies_subscriptions" in body) s.applies_subscriptions = boolOrNull(body.applies_subscriptions);
  if ("applies_transaction_fees" in body) s.applies_transaction_fees = boolOrNull(body.applies_transaction_fees);
  if ("applies_setup_fees" in body) s.applies_setup_fees = boolOrNull(body.applies_setup_fees);
  if ("applies_enterprise" in body) s.applies_enterprise = boolOrNull(body.applies_enterprise);
  if ("subscription_mode" in body && SUBSCRIPTION_MODES.includes(body.subscription_mode as never))
    s.subscription_mode = body.subscription_mode as PartnerSettings["subscription_mode"];
  if ("subscription_months" in body) s.subscription_months = numOrNull(body.subscription_months);
  if ("subscription_share_pct" in body) s.subscription_share_pct = numOrNull(body.subscription_share_pct);
  if ("effective_date" in body) s.effective_date = str(body.effective_date);
  if ("expiration_date" in body) s.expiration_date = str(body.expiration_date);
  if ("duration_kind" in body && (body.duration_kind === "lifetime" || body.duration_kind === "limited"))
    s.duration_kind = body.duration_kind;
  if ("status" in body) s.status = str(body.status);
  if ("notes" in body) s.notes = str(body.notes);
  return s;
}

router.post(
  "/",
  h(async (req, res) => {
    const auth = getAuth(req);
    const settings = readSettings((req.body ?? {}) as Record<string, unknown>);
    const partner = await createPartner(settings);
    await logAction(
      { id: null, email: auth.email },
      "partner.created",
      "partner",
      partner.id,
      null,
      { name: partner.name, partner_type: partner.partner_type, referral_code: partner.referral_code },
      { summary: `Created partner ${partner.name ?? partner.referral_code ?? partner.id}`, ip: req.ip },
    );
    res.status(201).json({ partner });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const partner = await getPartner(req.params.id);
    if (!partner) throw new db.NotFoundError("partner not found");
    const [referrals, commissions, totals] = await Promise.all([
      listReferredOrgs(partner.id),
      listCommissions(partner.id),
      commissionTotals(partner.id),
    ]);
    res.json({ partner, referrals, commissions, totals });
  }),
);

router.patch(
  "/:id",
  h(async (req, res) => {
    const auth = getAuth(req);
    const before = await getPartner(req.params.id);
    if (!before) throw new db.NotFoundError("partner not found");
    const patch = readSettings((req.body ?? {}) as Record<string, unknown>);
    const partner = await updatePartner(req.params.id, patch);
    if (!partner) throw new db.NotFoundError("partner not found");

    // Audit the full before/after of the revenue-share edit.
    await logAction(
      { id: null, email: auth.email },
      "partner.revenue_share_updated",
      "partner",
      partner.id,
      before,
      partner,
      { summary: `Updated revenue-share settings for ${partner.name ?? partner.referral_code ?? partner.id}`, ip: req.ip },
    );
    // Notify the partner that their revenue-share agreement changed.
    const to = partner.name ?? partner.referral_code ?? partner.id;
    await notify.revenueShareUpdated(auth.email ?? "admin", to, { partner_id: partner.id }).catch(() => null);

    res.json({ partner });
  }),
);

router.post(
  "/:id/referrals",
  h(async (req, res) => {
    const partner = await getPartner(req.params.id);
    if (!partner) throw new db.NotFoundError("partner not found");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const referredOrgId = typeof body.referred_org_id === "string" ? body.referred_org_id : null;
    if (!referredOrgId) {
      res.status(400).json({ error: "referred_org_id required" });
      return;
    }
    const attribution: Attribution = ATTRIBUTIONS.includes(body.attribution as never)
      ? (body.attribution as Attribution)
      : "first_touch";
    const row = await recordReferral(partner.id, referredOrgId, attribution);
    // row is null when a permanent first_touch already existed (never overwritten).
    res.json({ referral: row, permanent: row === null && attribution === "first_touch" });
  }),
);

router.post(
  "/:id/commissions",
  h(async (req, res) => {
    const auth = getAuth(req);
    const partner = await getPartner(req.params.id);
    if (!partner) throw new db.NotFoundError("partner not found");
    const body = (req.body ?? {}) as Record<string, unknown>;

    const source = COMMISSION_SOURCES.includes(body.source as never)
      ? (body.source as CommissionSource)
      : null;
    if (!source) {
      res.status(400).json({ error: "valid source required" });
      return;
    }
    const intOf = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

    const recorded = await recordCommission({
      partnerId: partner.id,
      referredOrgId: typeof body.referred_org_id === "string" ? body.referred_org_id : null,
      source,
      grossCents: intOf(body.gross_cents),
      platformFeeCents: intOf(body.platform_fee_cents),
      processingCostCents: intOf(body.processing_cost_cents),
      subscriptionCycle: body.subscription_cycle != null ? intOf(body.subscription_cycle) : undefined,
      note: typeof body.note === "string" ? body.note : null,
    });

    await logAction(
      { id: null, email: auth.email },
      "partner.commission_recorded",
      "partner_commission",
      recorded.row.id,
      null,
      {
        partner_id: partner.id,
        source,
        net_profit_cents: recorded.netProfitCents,
        commission_cents: recorded.commissionCents,
      },
      { summary: `Recorded ${source} commission for ${partner.name ?? partner.id}`, ip: req.ip },
    );

    if (recorded.commissionCents > 0) {
      const amount = `$${(recorded.commissionCents / 100).toFixed(2)}`;
      const to = partner.name ?? partner.referral_code ?? partner.id;
      await notify
        .partnerCommissionEarned(to, amount, { partner_id: partner.id, source })
        .catch(() => null);
    }

    res.status(201).json(recorded);
  }),
);

export default router;
