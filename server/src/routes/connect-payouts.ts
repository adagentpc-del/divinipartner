/**
 * Divini Partners - STRIPE CONNECT SPLIT-PAYOUT RAIL routes. Mount base:
 * /api/connect-payouts.
 *
 * This is the Stripe Connect transfer rail, COMPLEMENTARY to the per-period
 * commission ledger in routes/payouts.ts (agent-165). It owns its own
 * connect_accounts + payout_instructions tables and never touches the
 * partner_payouts ledger.
 *
 * Recipient surface (requireUser, scoped to the caller's own partner record):
 *   POST /connect/start    create/reuse a Connect account + onboarding link
 *   GET  /connect/status   refresh capability flags from Stripe + persist
 *   GET  /mine             my queued + paid payout instructions
 *
 * Admin surface (requireAdmin = ADMIN_ALLOWED_EMAILS):
 *   GET   /admin/queue            instructions to act on, with recipient names + totals
 *   POST  /admin/:id/release      THE 1-CLICK RELEASE (instructs Stripe to transfer)
 *   POST  /admin/enqueue          manual enqueue for a collected revenue row
 *   PATCH /admin/:id              { status: held|canceled, notes }
 *
 * SAFETY: bank numbers are NEVER stored here; onboarding is a Stripe-hosted link
 * and we keep only the acct_... id, capability flags, and a masked bank last4.
 * The live transfer in /release is gated: it runs ONLY when Stripe is configured
 * AND the recipient account has payouts_enabled. Otherwise the instruction is
 * marked 'blocked' with a clear message and NO error. Every Stripe call is
 * wrapped so a Stripe failure can never crash the server. Nothing auto-moves
 * money; release is a deliberate one-click human action. Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser, requireAdmin } from "../auth.js";
import { q, q1 } from "../pool.js";
import * as db from "../db.js";
import { PUBLIC_APP_URL } from "../config.js";
import { sendEmail } from "../lib/email.js";
import {
  isConfigured as stripeConfigured,
  createConnectAccount,
  createOnboardingLink,
  getAccount,
  createTransfer,
  StripeNotConfigured,
} from "../lib/stripe-connect.js";
import { enqueueSplitsForRevenue } from "../lib/split-engine.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

async function audit(
  instructionId: string | null,
  actorEmail: string | null,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await q(
      `insert into connect_payout_audit (instruction_id, actor_email, action, detail)
       values ($1,$2,$3,$4::jsonb)`,
      [instructionId, actorEmail, action, JSON.stringify(detail)],
    );
  } catch {
    // Audit is best effort; never break the request on a log failure.
  }
}

/** Map the live Stripe flags onto the row status. */
function statusFromFlags(f: { payouts_enabled: boolean; details_submitted: boolean }): string {
  if (f.payouts_enabled) return "enabled";
  if (f.details_submitted) return "restricted";
  return "onboarding";
}

/**
 * Resolve the caller's OWN partner record id (they may only onboard a bank /
 * read payouts for themselves). Returns null when the user is not a partner.
 */
async function partnerIdForCaller(userId: string, email: string | null): Promise<string | null> {
  try {
    const actor = await db.getActor(userId, email);
    const orgId = actor.org?.id ?? null;
    const row = await q1<{ id: string }>(
      `select id from partners
        where (user_id = $1)
           or ($2::uuid is not null and organization_id = $2)
        order by case when user_id = $1 then 0 else 1 end
        limit 1`,
      [actor.user.id, orgId],
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /connect/start  (requireUser, scoped to the caller's own partner record)
//   Create or reuse a connect_accounts row + Stripe account for the caller's
//   partner, then return a Stripe-hosted onboarding link. If Stripe is not
//   configured, returns { configured: false } with a clear message, not an error.
// ---------------------------------------------------------------------------
router.post(
  "/connect/start",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const partnerId = await partnerIdForCaller(auth.userId!, auth.email);
    if (!partnerId) {
      return res.status(403).json({ error: "no partner record for this user" });
    }

    // Find or create the connect_accounts row for this partner.
    let acct = await q1<{ id: string; stripe_account_id: string | null }>(
      `select id, stripe_account_id from connect_accounts
        where owner_kind = 'partner' and owner_partner_id = $1 limit 1`,
      [partnerId],
    );
    if (!acct) {
      acct = await q1(
        `insert into connect_accounts
           (owner_kind, owner_partner_id, status, created_by)
         values ('partner',$1,'not_started',$2)
         returning id, stripe_account_id`,
        [partnerId, auth.email ?? null],
      );
    }

    if (!stripeConfigured()) {
      return res.json({
        configured: false,
        message:
          "Stripe is not connected yet. Set STRIPE_SECRET_KEY to enable bank onboarding and payouts.",
      });
    }

    try {
      // Create the Stripe account on first use, then mint an onboarding link.
      let stripeAccountId = acct!.stripe_account_id;
      if (!stripeAccountId) {
        const created = await createConnectAccount({ email: auth.email, country: "US" });
        stripeAccountId = created.accountId;
        await q(
          `update connect_accounts set stripe_account_id = $2, status = 'onboarding', updated_at = now()
            where id = $1`,
          [acct!.id, stripeAccountId],
        );
      }
      const base = PUBLIC_APP_URL || "";
      const returnUrl = `${base}/connect-payouts/settings?connect=return`;
      const refreshUrl = `${base}/connect-payouts/settings?connect=refresh`;
      const link = await createOnboardingLink(stripeAccountId, returnUrl, refreshUrl);
      await audit(null, auth.email, "connect_start", { connect_account_id: acct!.id, partner_id: partnerId });
      return res.json({ configured: true, url: link.url });
    } catch (e) {
      if (e instanceof StripeNotConfigured) {
        return res.json({ configured: false, message: e.message });
      }
      // Any Stripe failure: report cleanly, never crash.
      return res
        .status(502)
        .json({ error: "Could not start Stripe onboarding", detail: (e as Error).message });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /connect/status  (requireUser)
//   Refresh capability flags from Stripe (when configured) for the caller's
//   partner connect account, persist them, and return the row. Degrades to the
//   stored row when Stripe is off.
// ---------------------------------------------------------------------------
router.get(
  "/connect/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const partnerId = await partnerIdForCaller(auth.userId!, auth.email);
    if (!partnerId) {
      return res.json({ configured: stripeConfigured(), account: null, is_partner: false });
    }

    const account = await q1<any>(
      `select * from connect_accounts
        where owner_kind = 'partner' and owner_partner_id = $1
        order by updated_at desc limit 1`,
      [partnerId],
    );
    if (!account) return res.json({ configured: stripeConfigured(), account: null, is_partner: true });

    if (stripeConfigured() && account.stripe_account_id) {
      try {
        const flags = await getAccount(account.stripe_account_id);
        const updated = await q1<any>(
          `update connect_accounts set
             charges_enabled = $2, payouts_enabled = $3, details_submitted = $4,
             bank_last4 = coalesce($5, bank_last4),
             country = coalesce($6, country),
             default_currency = coalesce($7, default_currency),
             status = $8, updated_at = now()
           where id = $1 returning *`,
          [
            account.id,
            flags.charges_enabled,
            flags.payouts_enabled,
            flags.details_submitted,
            flags.bank_last4 ?? null,
            flags.country ?? null,
            flags.default_currency ?? null,
            statusFromFlags(flags),
          ],
        );
        // When the recipient just became payable, promote their pending
        // instructions to 'ready' so the admin can release them.
        if (flags.payouts_enabled) {
          await q(
            `update payout_instructions set status = 'ready', connect_account_id = $1, updated_at = now()
              where connect_account_id = $1 and status = 'pending'`,
            [account.id],
          );
        }
        return res.json({ configured: true, account: updated, is_partner: true });
      } catch {
        // Stripe read failed: hand back the stored row unchanged.
        return res.json({ configured: true, account, is_partner: true });
      }
    }
    return res.json({ configured: stripeConfigured(), account, is_partner: true });
  }),
);

// ---------------------------------------------------------------------------
// GET /mine  (requireUser)
//   The caller's own payout instructions (paid + pending + everything).
// ---------------------------------------------------------------------------
router.get(
  "/mine",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const partnerId = await partnerIdForCaller(auth.userId!, auth.email);
    if (!partnerId) return res.json({ instructions: [], is_partner: false });
    const rows = await q<any>(
      `select id, recipient_kind, basis_cents, split_percentage, amount_cents, currency,
              status, stripe_transfer_id, failure_reason, released_at, created_at
         from payout_instructions
        where recipient_partner_id = $1
        order by created_at desc limit 500`,
      [partnerId],
    );
    res.json({ instructions: rows, is_partner: true });
  }),
);

// ===========================================================================
// ADMIN (super-admin = ADMIN_ALLOWED_EMAILS)
// ===========================================================================
router.use("/admin", requireAdmin);

// ---------------------------------------------------------------------------
// GET /admin/queue
//   Instructions to act on (ready, pending, blocked, failed) with recipient
//   names + dashboard totals across all statuses.
// ---------------------------------------------------------------------------
router.get(
  "/admin/queue",
  h(async (_req, res) => {
    const rows = await q<any>(
      `select pi.*,
              p.name as recipient_partner_name,
              p.company as recipient_partner_company,
              o.name as recipient_org_name,
              ca.payouts_enabled as account_payouts_enabled,
              ca.bank_last4 as account_bank_last4,
              ca.stripe_account_id as account_stripe_id
         from payout_instructions pi
         left join partners p on p.id = pi.recipient_partner_id
         left join organizations o on o.id = pi.recipient_organization_id
         left join connect_accounts ca on ca.id = pi.connect_account_id
        where pi.status in ('ready','pending','blocked','failed')
        order by pi.created_at desc
        limit 1000`,
    );
    const t = await q1<{ pending: string; ready: string; paid: string }>(
      `select coalesce(sum(amount_cents) filter (where status in ('pending','blocked','held')),0) as pending,
              coalesce(sum(amount_cents) filter (where status = 'ready'),0)                       as ready,
              coalesce(sum(amount_cents) filter (where status = 'paid'),0)                        as paid
         from payout_instructions`,
    );
    res.json({
      rows,
      configured: stripeConfigured(),
      totals: {
        pendingCents: num(t?.pending),
        readyCents: num(t?.ready),
        paidCents: num(t?.paid),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/enqueue  { revenueId }
//   Manual enqueue of splits for a collected revenue row.
// ---------------------------------------------------------------------------
router.post(
  "/admin/enqueue",
  h(async (req, res) => {
    const auth = getAuth(req);
    const revenueId = String((req.body ?? {}).revenueId ?? "").trim();
    if (!revenueId) return res.status(400).json({ error: "revenueId required" });
    const result = await enqueueSplitsForRevenue(revenueId, auth.email);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /admin/:id  { status: held|canceled, notes }
//   Admin control over a queued instruction (hold / cancel + notes).
// ---------------------------------------------------------------------------
router.patch(
  "/admin/:id",
  h(async (req, res) => {
    const auth = getAuth(req);
    const { status, notes } = (req.body ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (status !== undefined) {
      if (!["held", "canceled"].includes(String(status))) {
        return res.status(400).json({ error: "status must be held or canceled" });
      }
      add("status", String(status));
    }
    if (notes !== undefined) add("notes", notes === "" ? null : String(notes));
    if (!sets.length) return res.status(400).json({ error: "no fields to update" });
    sets.push("updated_at = now()");
    params.push(req.params.id);
    const row = await q1<any>(
      `update payout_instructions set ${sets.join(", ")} where id = $${params.length} returning *`,
      params,
    );
    if (!row) return res.status(404).json({ error: "instruction not found" });
    await audit(row.id, auth.email, "admin_patch", { status: row.status, notes: row.notes });
    res.json({ instruction: row });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/:id/release   THE 1-CLICK RELEASE.
//   Loads the instruction + recipient connect account. If Stripe is not
//   configured OR the recipient is not payouts_enabled, marks 'blocked' and
//   returns { released: false, reason } WITHOUT erroring. Otherwise instructs
//   Stripe to transfer the funds, marks 'paid' (or 'failed' on a Stripe error),
//   and best-effort emails the recipient. Wrapped so no Stripe error crashes the
//   server. This is the ONLY place money moves.
// ---------------------------------------------------------------------------
router.post(
  "/admin/:id/release",
  h(async (req, res) => {
    const auth = getAuth(req);
    const instr = await q1<any>(
      `select pi.*, ca.stripe_account_id, ca.payouts_enabled
         from payout_instructions pi
         left join connect_accounts ca on ca.id = pi.connect_account_id
        where pi.id = $1`,
      [req.params.id],
    );
    if (!instr) return res.status(404).json({ error: "instruction not found" });

    // Only releasable from a pending/ready/blocked/failed state. Already-paid /
    // releasing / held / canceled rows are left untouched.
    if (!["pending", "ready", "blocked", "failed"].includes(instr.status)) {
      return res.status(409).json({ error: `cannot release from status '${instr.status}'` });
    }

    const amountCents = Math.max(0, Math.round(num(instr.amount_cents)));
    const destination = instr.stripe_account_id as string | null;
    const payoutsEnabled = !!instr.payouts_enabled;

    // GATE: no live transfer unless Stripe is configured AND the recipient is
    // payable. Mark 'blocked' with a clear reason; this is NOT an error.
    if (!stripeConfigured() || !destination || !payoutsEnabled) {
      const reason = !stripeConfigured()
        ? "Stripe is not configured. Set STRIPE_SECRET_KEY to release payouts."
        : !destination
          ? "Recipient has not connected a Stripe payout account yet."
          : "Recipient payouts are not enabled yet. They must finish Stripe onboarding.";
      await q(
        `update payout_instructions set status = 'blocked', failure_reason = $2, updated_at = now()
          where id = $1`,
        [instr.id, reason],
      );
      await audit(instr.id, auth.email, "release_blocked", { reason });
      return res.json({ released: false, status: "blocked", reason });
    }

    // Move to 'releasing' so a double-click cannot double-pay.
    await q(
      `update payout_instructions set status = 'releasing', updated_at = now() where id = $1`,
      [instr.id],
    );

    try {
      const transfer = await createTransfer({
        amountCents,
        currency: instr.currency || "usd",
        destinationAccountId: destination,
        metadata: {
          instruction_id: String(instr.id),
          source_revenue_id: String(instr.source_revenue_id ?? ""),
          recipient_kind: String(instr.recipient_kind ?? ""),
        },
      });
      const row = await q1<any>(
        `update payout_instructions set
           status = 'paid', stripe_transfer_id = $2, failure_reason = null,
           released_by = $3, released_at = now(), updated_at = now()
         where id = $1 returning *`,
        [instr.id, transfer.transferId, auth.email ?? null],
      );
      await audit(instr.id, auth.email, "released", {
        stripe_transfer_id: transfer.transferId,
        amount_cents: amountCents,
      });

      // Best-effort recipient notification (never blocks the response).
      try {
        let email: string | null = null;
        if (instr.recipient_partner_id) {
          const onb = await q1<{ email: string | null }>(
            `select email from partner_onboarding
              where partner_id = $1 and email is not null
              order by updated_at desc limit 1`,
            [instr.recipient_partner_id],
          ).catch(() => null);
          email = onb?.email ?? null;
        }
        if (email) {
          await sendEmail({
            to: email,
            subject: "Your Divini Partners payout is on its way",
            text:
              `Good news. A payout of $${(amountCents / 100).toFixed(2)} has been released to your ` +
              `connected bank account via Stripe. Funds typically arrive in 1 to 2 business days.\n\n` +
              `This was sent by Stripe, the licensed money transmitter. Divini Partners never stores your bank account numbers.`,
          });
        }
      } catch {
        // Email is best effort.
      }

      return res.json({ released: true, status: "paid", instruction: row });
    } catch (e) {
      const reason = (e as Error).message || "Stripe transfer failed";
      const row = await q1<any>(
        `update payout_instructions set status = 'failed', failure_reason = $2, updated_at = now()
          where id = $1 returning *`,
        [instr.id, reason],
      );
      await audit(instr.id, auth.email, "release_failed", { reason });
      return res.status(502).json({ released: false, status: "failed", reason, instruction: row });
    }
  }),
);

export default router;
