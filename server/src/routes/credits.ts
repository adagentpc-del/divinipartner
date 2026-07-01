/**
 * Module 2 - Platform Credits routes. Mount base: /api/credits.
 *
 * Read your credit balance + ledger, and redeem credit toward a subscription /
 * membership ONLY. Credits are non-cash, non-transferable, non-withdrawable:
 * there is no cash-out endpoint here by design. Every route is scoped to the
 * signed-in actor's users.id (IDOR-safe).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  creditSummary,
  listLedger,
  redeemCredit,
  formatUsd,
  CreditError,
} from "../lib/credits.js";
import { logAction } from "../lib/audit.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireUser);

/**
 * GET /me - the current user's balance + ledger. Returns summarized totals
 * (earned / redeemed / expired / pending) and the full ledger rows.
 */
router.get(
  "/me",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const summary = await creditSummary(actor.user.id);
    const ledger = await listLedger(actor.user.id);
    res.json({
      balanceCents: summary.balanceCents,
      earnedCents: summary.earnedCents,
      redeemedCents: summary.redeemedCents,
      expiredCents: summary.expiredCents,
      pendingCents: summary.pendingCents,
      ledger,
    });
  }),
);

/**
 * POST /redeem - redeem credit toward a subscription / membership. Body:
 * { amountCents, purpose: 'subscription' | 'membership', ref? }. Validates the
 * subscription context, never goes below zero, and writes an audit entry. There
 * is no cash-out path.
 */
router.post(
  "/redeem",
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const { amountCents, purpose, ref } = (req.body ?? {}) as {
      amountCents?: number;
      purpose?: "subscription" | "membership";
      ref?: string;
    };
    const amount = Number(amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amountCents must be a positive integer" });
    }
    if (purpose !== "subscription" && purpose !== "membership") {
      return res
        .status(400)
        .json({ error: "credits can only be redeemed toward a subscription or membership" });
    }
    try {
      const { redeemed, balanceCents } = await redeemCredit(
        actor.user.id,
        amount,
        "Redeemed toward Divini Partners",
        { purpose, ref: ref ?? null, organizationId: actor.org?.id ?? null },
      );
      await logAction(
        actor,
        "credit.redeemed",
        "platform_credit",
        redeemed.id,
        null,
        { amount_cents: amount, purpose, ref: ref ?? null, kind: "redeemed" },
        { summary: `Redeemed ${formatUsd(amount)} toward ${purpose}${ref ? ` (${ref})` : ""}` },
      );
      res.json({ redeemed, balanceCents });
    } catch (e) {
      if (e instanceof CreditError) {
        return res.status(e.status).json({ error: e.message });
      }
      throw e;
    }
  }),
);

export default router;
