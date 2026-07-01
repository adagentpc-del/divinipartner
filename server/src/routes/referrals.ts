/**
 * Module 2 - Referral routes. Mount base: /api/referrals.
 *
 * Per-user referral links/codes, referral tracking, and conversion (which grants
 * the referrer a $10 platform credit and flags the referred user's 50%-off-
 * first-two-months signup incentive). Every route is scoped to the signed-in
 * actor's users.id, so a forged id cannot read or convert another user's
 * referrals (IDOR-safe). Conversion is idempotent: a referral converts once.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as referrals from "../db/referrals.js";
import { grantCredit, recordPendingIncentive, formatUsd } from "../lib/credits.js";
import { notify } from "../lib/notify.js";
import { logAction } from "../lib/audit.js";
import { PUBLIC_APP_URL } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireUser);

/** The referrer credit on a converted referral: $10.00 (1000 cents). */
const REFERRER_CREDIT_CENTS = 1000;
/**
 * The referred user's signup incentive: 50% off the first two months. Modeled
 * as two 'pending' incentive credits the billing flow reads and applies (one per
 * month). The amount is a 50% marker per month (0 cents of cash value here; the
 * billing flow computes the actual discount from the plan price). Stored so the
 * billing flow can honor "50% off, 2 months" deterministically.
 */
const SIGNUP_INCENTIVE_MONTHS = 2;
const SIGNUP_INCENTIVE_PCT = 50;

/** Build the shareable referral link from the code (env URL or relative /r/:code). */
function referralLink(code: string): string {
  const base = PUBLIC_APP_URL || "";
  return base ? `${base}/r/${code}` : `/r/${code}`;
}

/**
 * GET /me - the current user's referral code + link (created on first call),
 * plus how many referrals they have sent and converted.
 */
router.get(
  "/me",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const codeRow = await referrals.ensureReferralCode(actor.user.id);
    const counts = await referrals.referralCounts(actor.user.id);
    res.json({
      code: codeRow.code,
      link: referralLink(codeRow.code),
      referralsSent: counts.sent,
      referralsConverted: counts.converted,
      referralsPending: counts.pending,
      referrals: await referrals.listReferrals(actor.user.id),
    });
  }),
);

/**
 * POST /track - record a referral the current user is sending. Body:
 * { referredEmail?, referredUserId? }. The referrer's own code is attached
 * automatically. Status starts 'pending'. Idempotent per (referrer, email).
 */
router.post(
  "/track",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const { referredEmail, referredUserId } = (req.body ?? {}) as {
      referredEmail?: string;
      referredUserId?: string;
    };
    if (!referredEmail && !referredUserId) {
      return res.status(400).json({ error: "referredEmail or referredUserId required" });
    }
    const codeRow = await referrals.ensureReferralCode(actor.user.id);
    const row = await referrals.trackReferral(actor.user.id, {
      code: codeRow.code,
      referredEmail: referredEmail ?? null,
      referredUserId: referredUserId ?? null,
    });
    res.status(201).json({ referral: row, link: referralLink(codeRow.code) });
  }),
);

/**
 * POST /convert - on a referred user's signup / first subscription, mark the
 * matching referral converted (idempotent), grant the REFERRER a $10 credit, and
 * flag the referred user's 50%-off-first-two-months signup incentive as pending
 * incentive credits the billing flow honors.
 *
 * The acting user is the referred party (the one signing up). Resolution uses an
 * explicit referralId, else the referral code, else the actor's email. This is
 * IDOR-safe: a caller can only convert a referral that points at THEM (by code
 * attribution or their own email), never grant themselves the referrer credit.
 */
router.post(
  "/convert",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const { referralId, code } = (req.body ?? {}) as { referralId?: string; code?: string };

    const target = await referrals.findConvertible({
      referralId: referralId ?? null,
      code: code ?? null,
      referredEmail: actor.user.email,
      referredUserId: actor.user.id,
    });
    if (!target) {
      return res.status(404).json({ error: "no pending referral to convert" });
    }
    // A user cannot convert their own referral to credit themselves.
    if (target.referrer_user_id === actor.user.id) {
      return res.status(400).json({ error: "cannot convert your own referral" });
    }

    const converted = await referrals.markConverted(target.id, actor.user.id);
    if (!converted) {
      // Already converted - idempotent no-op success.
      return res.json({ referral: target, alreadyConverted: true });
    }

    // Grant the referrer a $10 platform credit (subscription-only, non-cash).
    const credit = await grantCredit(
      converted.referrer_user_id,
      REFERRER_CREDIT_CENTS,
      "Referral conversion reward",
      { sourceReferralId: converted.id },
    );

    // Flag the referred user's signup incentive: 50% off, first two months, as
    // pending incentive credits the billing flow reads. The marker carries the
    // percentage + month index; cash value is left 0 (billing computes it from
    // the plan price), so it never affects the spendable balance.
    for (let month = 1; month <= SIGNUP_INCENTIVE_MONTHS; month++) {
      await recordPendingIncentive(
        actor.user.id,
        0,
        `Signup incentive: ${SIGNUP_INCENTIVE_PCT}% off month ${month} of ${SIGNUP_INCENTIVE_MONTHS}`,
        { sourceReferralId: converted.id, organizationId: actor.org?.id ?? null },
      );
    }

    // Notifications: referrer learns it converted + that they earned a credit.
    const referrerEmail = await referrerEmailFor(converted.referrer_user_id);
    if (referrerEmail) {
      await notify.referralConverted(referrerEmail, actor.user.email ?? "a new member", {
        referralId: converted.id,
        url: PUBLIC_APP_URL ? `${PUBLIC_APP_URL}/referral-dashboard` : "/referral-dashboard",
      });
      await notify.referralCreditEarned(referrerEmail, formatUsd(REFERRER_CREDIT_CENTS), {
        referralId: converted.id,
        creditId: credit.id,
      });
    }

    // Audit the credit grant + conversion (best-effort; never throws).
    await logAction(
      { id: converted.referrer_user_id, email: referrerEmail },
      "credit.granted",
      "platform_credit",
      credit.id,
      null,
      { amount_cents: REFERRER_CREDIT_CENTS, source_referral_id: converted.id, kind: "earned" },
      { summary: `Referral ${converted.id} converted; granted ${formatUsd(REFERRER_CREDIT_CENTS)} to referrer` },
    );

    res.json({
      referral: converted,
      referrerCredit: { id: credit.id, amountCents: REFERRER_CREDIT_CENTS },
      signupIncentive: { percent: SIGNUP_INCENTIVE_PCT, months: SIGNUP_INCENTIVE_MONTHS },
    });
  }),
);

/** Look up the referrer's email so notifications/audit can address them. */
async function referrerEmailFor(userId: string): Promise<string | null> {
  const { q1 } = await import("../pool.js");
  const row = await q1<{ email: string | null }>(`select email from users where id = $1`, [userId]);
  return row?.email ?? null;
}

export default router;
