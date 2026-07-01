/**
 * Module 1 - Partner Portal routes. Mount base: /api/partner-portal.
 *
 * A signed-in partner sees only their OWN partner record: referral link/code,
 * referred accounts, eligible/earned commissions, pending/paid totals, and
 * payment-method status. Resolution is by user_id (else org), so a user can
 * never read another partner's data. Sensitive client financial detail (the
 * referred org's gross invoices) is NEVER exposed: the portal shows only the
 * partner's own commission amounts and the source label.
 *
 *   GET /api/partner-portal           the partner's full self-view
 *   GET /api/partner-portal/link      just the referral code + link (lightweight)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  getPartnerForUser,
  listReferredOrgs,
  listCommissions,
  commissionTotals,
  partnerPayoutStatus,
} from "../db/partners.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.use(requireUser);

router.get(
  "/link",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const partner = await getPartnerForUser(actor.user.id, actor.org?.id ?? null);
    if (!partner) {
      res.json({ is_partner: false, referral_code: null, referral_link: null });
      return;
    }
    res.json({
      is_partner: true,
      referral_code: partner.referral_code,
      referral_link: partner.referral_link,
    });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const partner = await getPartnerForUser(actor.user.id, actor.org?.id ?? null);

    if (!partner) {
      // Not a partner yet: a graceful, non-error empty state for the page.
      res.json({ is_partner: false });
      return;
    }

    const [referrals, commissions, totals, payout] = await Promise.all([
      listReferredOrgs(partner.id),
      listCommissions(partner.id),
      commissionTotals(partner.id),
      partnerPayoutStatus(partner),
    ]);

    // Expose only non-sensitive partner-facing fields. We deliberately omit the
    // referred org's gross invoice / platform-fee internals from the public
    // surface; the portal shows the partner's own commission and the source.
    const safeCommissions = commissions.map((c) => ({
      id: c.id,
      source: c.source,
      net_profit_cents: Number(c.net_profit_cents),
      share_pct: Number(c.share_pct),
      commission_cents: Number(c.commission_cents),
      status: c.status,
      excluded: c.excluded,
      created_at: c.created_at,
    }));

    res.json({
      is_partner: true,
      partner: {
        id: partner.id,
        name: partner.name,
        company: partner.company,
        partner_type: partner.partner_type,
        referral_code: partner.referral_code,
        referral_link: partner.referral_link,
        commission_type: partner.commission_type,
        revenue_share_pct: Number(partner.revenue_share_pct ?? 0),
        subscription_mode: partner.subscription_mode,
        duration_kind: partner.duration_kind,
        status: partner.status,
        effective_date: partner.effective_date,
        expiration_date: partner.expiration_date,
      },
      referred_accounts: referrals.map((r) => ({
        org_name: r.org_name,
        org_type: r.org_type,
        attribution: r.attribution,
        referred_at: r.referred_at,
      })),
      commissions: safeCommissions,
      totals,
      payout_status: payout,
    });
  }),
);

export default router;
