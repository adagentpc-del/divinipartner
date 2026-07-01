/**
 * Payment routes (blueprint section 21). Mounted at /api/payments.
 *
 *   GET    /api/payments               list (filter ?invoice_id, ?event_id, ?external)
 *   GET    /api/payments/meta          payout statuses, flows, configurable fees
 *   GET    /api/payments/summary       fee + payout roll-up for the dashboard
 *   POST   /api/payments               record an on-platform payment
 *   POST   /api/payments/external      the leakage flow: requires reason + proof,
 *                                      logs an audit + leakage_event, flags account
 *   POST   /api/payments/detect        scan text for leakage language (no write)
 *   PATCH  /api/payments/:id/payout    advance payout status
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1, pool } from "../pool.js";
import { TIERS } from "../db.js";
import {
  recordPayment,
  recordExternalPayment,
  listPayments,
  updatePayoutStatus,
  paymentSummary,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  PAYMENT_FLOWS,
  PAYMENT_KINDS,
  CONFIGURABLE_FEES,
  type PayoutStatus,
  type PaymentFlow,
  type PaymentKind,
} from "../db/payments.js";
import { applyPaymentToInvoice, getInvoicePartiesById } from "../db/invoices.js";
import { recordProcessorPayment, computeFees, decomposeGrossOnTop } from "../db/payments.js";
import {
  getPayoutAccount,
  listPayoutAccounts,
  upsertPayoutAccount,
  activeStripeDestination,
  paypalPayoutEmail,
  syncStripeAccountByExternalId,
} from "../db/payout-accounts.js";
import {
  detectLeakageLanguage,
  evaluateExternalPayment,
  PAYMENT_PROTECTION_NOTICE,
} from "../lib/leakage.js";
import {
  enabledProcessors,
  createCheckout,
  captureCheckout,
  verifyStripeEvent,
  verifyPaypalWebhook,
  paypalWebhookIdSet,
  unpackCustomId,
  createConnectAccount,
  createAccountLink,
  retrieveConnectAccount,
  createPaypalPayout,
  type Processor,
} from "../lib/processors.js";
import { sendEmail } from "../lib/email.js";
import { PUBLIC_APP_URL, BASE_PATH, IS_PROD, PRICING_V2 } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get("/meta", (_req, res) => {
  res.json({
    payout_statuses: PAYOUT_STATUSES,
    payout_labels: PAYOUT_STATUS_LABELS,
    flows: PAYMENT_FLOWS,
    kinds: PAYMENT_KINDS,
    configurable_fees: CONFIGURABLE_FEES,
    tiers: TIERS,
    protection_notice: PAYMENT_PROTECTION_NOTICE,
  });
});

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ payments: [] });
    const rows = await listPayments(actor.org.id, {
      invoice_id: typeof req.query.invoice_id === "string" ? req.query.invoice_id : undefined,
      event_id: typeof req.query.event_id === "string" ? req.query.event_id : undefined,
      external: req.query.external === "true" ? true : req.query.external === "false" ? false : undefined,
    });
    res.json({ payments: rows });
  }),
);

router.get(
  "/summary",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ summary: null });
    const summary = await paymentSummary(actor.org.id);
    res.json({ summary, tier: actor.org.tier });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const b = req.body ?? {};
    if (!b.flow || !PAYMENT_FLOWS.includes(b.flow)) {
      return res.status(400).json({ error: "valid flow required" });
    }
    if (b.flow === "external_recorded") {
      return res.status(400).json({ error: "use POST /external for off-platform payments" });
    }
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "positive amount required" });
    }
    const row = await recordPayment(actor.org.id, actor.org.tier, actor.user.id, {
      invoice_id: b.invoice_id ?? null,
      event_id: b.event_id ?? null,
      amount,
      method: b.method ?? null,
      flow: b.flow as PaymentFlow,
      kind: (b.kind as PaymentKind) ?? "full",
      payee_org_id: b.payee_org_id ?? null,
      payee_label: b.payee_label ?? null,
      reference: b.reference ?? null,
      payout_status: b.payout_status as PayoutStatus | undefined,
    });
    if (b.invoice_id) await applyPaymentToInvoice(b.invoice_id, amount);
    res.status(201).json({ payment: row });
  }),
);

/**
 * The leakage flow. "Mark as external" requires a reason + proof. We evaluate the
 * policy, compute the fee owed, record the external payment, write an audit_logs
 * row + a leakage_events row, and notify an admin. If reason/proof are missing the
 * request is blocked (422) and still logged as a "blocked" decision.
 */
router.post(
  "/external",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const b = req.body ?? {};
    const amount = Number(b.amount);
    const feeRate =
      actor.org.tier && (TIERS as Record<string, { feeRate: number }>)[actor.org.tier]
        ? (TIERS as Record<string, { feeRate: number }>)[actor.org.tier].feeRate
        : TIERS.free_partner.feeRate;

    const decision = evaluateExternalPayment({
      amount,
      feeRate,
      reason: b.reason,
      proof: b.proof,
      actorId: actor.user.id,
      organizationId: actor.org.id,
      eventId: b.event_id ?? null,
      invoiceId: b.invoice_id ?? null,
    });

    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    if (!decision.ok) {
      // Still log the blocked attempt for the audit trail.
      await q1(
        `insert into leakage_events
           (event_id, invoice_id, organization_id, actor_id, source, decision, reason, proof,
            fee_owed, admin_notified, account_flagged)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false)`,
        [
          decision.audit.event_id,
          decision.audit.invoice_id,
          decision.audit.organization_id,
          decision.audit.actor_id,
          decision.audit.source,
          "blocked",
          decision.audit.reason,
          decision.audit.proof,
          0,
        ],
      ).catch(() => null);
      return res.status(422).json({ error: "external payment blocked", errors: decision.errors });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const payment = (
        await client.query(
          `insert into payments
             (invoice_id, event_id, organization_id, amount, method, flow, kind, status,
              platform_fee, processing_fee, net_payout, payout_status, fee_breakdown,
              external_payment_flag, external_reason, external_proof, external_acknowledged_by,
              fee_owed, reference, recorded_by)
           values ($1,$2,$3,$4,$5,'external_recorded','full','external',0,0,0,'not_ready',
              $6::jsonb,true,$7,$8,$9,$10,$11,$12)
           returning *`,
          [
            b.invoice_id ?? null,
            b.event_id ?? null,
            actor.org.id,
            Number(amount) || 0,
            b.method ?? "external",
            JSON.stringify({ external: true, fee_owed: decision.feeOwed }),
            decision.audit.reason,
            decision.audit.proof,
            actor.user.id,
            decision.feeOwed,
            b.reference ?? null,
            actor.user.id,
          ],
        )
      ).rows[0];

      await client.query(
        `insert into leakage_events
           (event_id, invoice_id, payment_id, organization_id, actor_id, source, detected_terms,
            flagged_text, decision, reason, proof, fee_owed, admin_notified, account_flagged)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true)`,
        [
          b.event_id ?? null,
          b.invoice_id ?? null,
          payment.id,
          actor.org.id,
          actor.user.id,
          "external_flow",
          Array.isArray(b.detected_terms) ? b.detected_terms : null,
          b.flagged_text ?? null,
          "marked_external",
          decision.audit.reason,
          decision.audit.proof,
          decision.feeOwed,
        ],
      );

      await client.query(
        `insert into audit_logs (actor_id, action, object_type, object_id, new_value, ip_address)
         values ($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          actor.user.id,
          "payment.marked_external",
          "payment",
          payment.id,
          JSON.stringify({ fee_owed: decision.feeOwed, reason: decision.audit.reason, notify: decision.notify }),
          ip,
        ],
      );

      // Notify an admin (free_partner default). Notification surfaces in the
      // admin console; the message carries the fee owed.
      await client.query(
        `insert into feedback_items (user_id, type, priority, description, related_object_type, related_object_id, status)
         values ($1,'payment_leakage','high',$2,'payment',$3,'open')`,
        [actor.user.id, decision.notify?.message ?? "External payment recorded", payment.id],
      );

      await client.query("commit");
      res.status(201).json({ payment, fee_owed: decision.feeOwed, account_flagged: true });
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }),
);

/** Scan text for leakage language. Read-only; the UI uses this to decide whether
 *  to surface the Payment Protection Notice. */
router.post(
  "/detect",
  requireUser,
  h(async (req, res) => {
    const text = (req.body ?? {}).text;
    const detection = detectLeakageLanguage(typeof text === "string" ? text : "");
    res.json({ detection, protection_notice: PAYMENT_PROTECTION_NOTICE });
  }),
);

router.patch(
  "/:id/payout",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    const status = (req.body ?? {}).status as PayoutStatus;
    if (!status) return res.status(400).json({ error: "status required" });
    try {
      const row = await updatePayoutStatus(actor.org.id, req.params.id, status);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json({ payment: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }),
);

// ---------------------------------------------------------------------------
// Real processors: Stripe + PayPal (feature-flagged; record-only when unset)
// ---------------------------------------------------------------------------

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

async function orgTier(orgId: string): Promise<string | null> {
  const row = await q1<{ tier: string | null }>(`select tier from organizations where id = $1`, [orgId]);
  return row?.tier ?? null;
}

/**
 * IDOR gate: the acting org may pay/capture against an invoice only if its org
 * id is a party to that invoice (the issuer organization_id, or the org behind
 * the vendor/venue/client party). Returns true when authorized.
 *
 * If the invoice cannot be found we deny. If party resolution is ambiguous the
 * conservative fallback still holds: actor.org.id === issuer organization_id OR
 * actor.org.id === client org id is sufficient, and both are included in
 * party_org_ids.
 */
async function authorizeInvoiceParty(actorOrgId: string, invoiceId: string): Promise<boolean> {
  const parties = await getInvoicePartiesById(invoiceId);
  if (!parties) return false;
  return parties.party_org_ids.includes(actorOrgId);
}

/** A payment against an invoice is attributed to the issuing (vendor/venue) org,
 *  so the platform fee follows their tier and the payment rolls up to the party
 *  being paid, not the payer. Unscoped on purpose: routes MUST authorize the
 *  actor against the invoice first (see authorizeInvoiceParty) before using it. */
async function invoiceOrgTier(invoiceId: string): Promise<{ orgId: string; tier: string | null } | null> {
  const row = await q1<{ organization_id: string | null; tier: string | null }>(
    `select i.organization_id, o.tier
       from invoices i left join organizations o on o.id = i.organization_id
      where i.id = $1`,
    [invoiceId],
  );
  if (!row?.organization_id) return null;
  return { orgId: row.organization_id, tier: row.tier ?? null };
}

/**
 * Fee figures for a captured/charged amount, honoring Pricing V2.
 *
 * Under PRICING_V2 the `amount` here is the GROSS CLIENT TOTAL the client paid
 * (subtotal + 5% on top), so we DECOMPOSE it: the vendor's net is the embedded
 * subtotal and the platform fee is the 5% on top. The vendor receives their
 * full quote; no processing fee is carved out. When the flag is off we fall
 * back to the legacy tier carve-out (computeFees), unchanged.
 *
 * This keeps the Stripe application_fee (what the platform retains) and the
 * PayPal payout (what the vendor receives) consistent with how the payment row
 * is recorded by db/payments.ts.
 */
function recordingFees(amount: number, tier: string | null | undefined): {
  platformFee: number;
  processingFee: number;
  netPayout: number;
} {
  if (PRICING_V2) {
    const d = decomposeGrossOnTop(amount);
    return { platformFee: d.platformFee, processingFee: d.processingFee, netPayout: d.netPayout };
  }
  const f = computeFees(amount, tier);
  return { platformFee: f.platformFee, processingFee: f.processingFee, netPayout: f.netPayout };
}

/** Which processors are live + the Stripe publishable key for the client. */
router.get("/processors", (_req, res) => {
  res.json(enabledProcessors());
});

// --- Connect / payout setup (so vendors get paid automatically) -------------

/** The current org's payout setup status for both processors. */
router.get(
  "/connect/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ accounts: [], processors: enabledProcessors() });
    const accounts = await listPayoutAccounts(actor.org.id);
    res.json({ accounts, processors: enabledProcessors() });
  }),
);

/** Start (or resume) Stripe Express onboarding for the org. Returns a hosted
 *  onboarding URL the vendor completes to enable automatic payouts. */
router.post(
  "/connect/stripe/onboard",
  requireUser,
  h(async (req, res) => {
    const en = enabledProcessors();
    if (!en.stripe) return res.status(503).json({ error: "stripe is not configured" });
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });

    let acct = await getPayoutAccount(actor.org.id, "stripe");
    let acctId = acct?.external_id ?? null;
    if (!acctId) {
      const created = await createConnectAccount(actor.user.email ?? null);
      acctId = created.id;
      acct = await upsertPayoutAccount(actor.org.id, "stripe", {
        external_id: acctId,
        email: actor.user.email ?? null,
        status: "onboarding",
        charges_enabled: created.charges_enabled,
        payouts_enabled: created.payouts_enabled,
        details_submitted: created.details_submitted,
      });
    }
    const base = appBaseUrl(req);
    const url = await createAccountLink(
      acctId,
      `${base}/payouts/setup?refresh=stripe`,
      `${base}/payouts/setup?connected=stripe`,
    );
    res.json({ url });
  }),
);

/** Re-sync the org's Stripe account status from Stripe (called on return). */
router.get(
  "/connect/stripe/refresh",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const acct = await getPayoutAccount(actor.org.id, "stripe");
    if (!acct?.external_id) return res.json({ account: null });
    const status = await retrieveConnectAccount(acct.external_id);
    const updated = await upsertPayoutAccount(actor.org.id, "stripe", {
      external_id: status.id,
      status: status.payouts_enabled ? "active" : status.details_submitted ? "pending" : "onboarding",
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      details_submitted: status.details_submitted,
    });
    res.json({ account: updated });
  }),
);

/** Set the org's PayPal payout email (vendor receives payouts here). */
router.post(
  "/connect/paypal",
  requireUser,
  h(async (req, res) => {
    const en = enabledProcessors();
    if (!en.paypal) return res.status(503).json({ error: "paypal is not configured" });
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const email = String((req.body ?? {}).email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "a valid PayPal email is required" });
    }
    const account = await upsertPayoutAccount(actor.org.id, "paypal", {
      email,
      status: "active",
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
    });
    res.json({ account });
  }),
);

/**
 * Create a hosted checkout session for an amount (typically an invoice balance).
 * Returns a redirect_url the client is sent to. The vendor payout is tracked via
 * payout_status; this MVP charges into the Divini platform account.
 */
router.post(
  "/checkout",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const b = req.body ?? {};
    const processor = b.processor as Processor;
    if (processor !== "stripe" && processor !== "paypal") {
      return res.status(400).json({ error: "processor must be 'stripe' or 'paypal'" });
    }
    const en = enabledProcessors();
    if ((processor === "stripe" && !en.stripe) || (processor === "paypal" && !en.paypal)) {
      return res.status(503).json({ error: `${processor} is not configured` });
    }
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "positive amount required" });
    }
    const flow: PaymentFlow = PAYMENT_FLOWS.includes(b.flow) && b.flow !== "external_recorded" ? b.flow : "client_to_vendor";
    const invoiceId = b.invoice_id ?? "";
    const eventId = b.event_id ?? "";
    const kind = (b.kind as PaymentKind) ?? "full";

    const base = appBaseUrl(req);
    const qs = (extra: string) =>
      `${base}/pay/return?processor=${processor}&flow=${flow}&kind=${kind}` +
      (invoiceId ? `&invoice_id=${encodeURIComponent(invoiceId)}` : "") +
      (eventId ? `&event_id=${encodeURIComponent(eventId)}` : "") +
      extra;
    // Stripe substitutes the session id; PayPal appends ?token=ORDERID itself.
    const successUrl = processor === "stripe" ? qs("&session_ref={CHECKOUT_SESSION_ID}") : qs("");
    const cancelUrl = `${base}/pay/return?status=cancel`;

    // Attribute the fee + payment to the issuing org when paying an invoice.
    let feeOrgId = actor.org.id;
    let feeTier = actor.org.tier ?? "";
    if (invoiceId) {
      // IDOR gate: only a party to the invoice may pay against it.
      const authorized = await authorizeInvoiceParty(actor.org.id, invoiceId);
      if (!authorized) {
        return res.status(403).json({ error: "not authorized to pay this invoice" });
      }
      const v = await invoiceOrgTier(invoiceId);
      if (v) { feeOrgId = v.orgId; feeTier = v.tier ?? ""; }
    }

    // Stripe Connect auto-split: if the vendor org has an onboarded, payouts-
    // enabled Stripe account, route their net to them and keep the platform fee.
    // Fee model (C2/C3): the vendor bears BOTH the platform fee and the
    // processing fee, so the amount transferred to the vendor equals the
    // recorded net_payout = amount - platformFee - processingFee. The Stripe
    // application_fee therefore retains (platformFee + processingFee).
    let destinationAccount: string | undefined;
    let applicationFeeCents: number | undefined;
    if (processor === "stripe") {
      const dest = await activeStripeDestination(feeOrgId);
      if (dest) {
        destinationAccount = dest;
        const fees = recordingFees(amount, feeTier);
        applicationFeeCents = Math.round((fees.platformFee + fees.processingFee) * 100);
      }
    }

    const label = (b.label as string) || (invoiceId ? `Invoice ${invoiceId}` : "Divini Partners payment");
    const checkout = await createCheckout({
      processor,
      amount,
      label,
      successUrl,
      cancelUrl,
      destinationAccount,
      applicationFeeCents,
      metadata: {
        org_id: feeOrgId,
        invoice_id: invoiceId,
        event_id: eventId,
        tier: feeTier,
        flow,
        kind,
        recorded_by: actor.user.id,
      },
    });
    res.status(201).json(checkout);
  }),
);

/**
 * Capture / confirm a checkout after the client returns. Idempotent: re-calling
 * with the same session returns the already-recorded payment. On first success
 * we record the payment (with the standard fee breakdown) and apply it to the
 * invoice. Webhooks are a backstop for the same outcome.
 */
router.post(
  "/capture",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const b = req.body ?? {};
    const processor = b.processor as Processor;
    if (processor !== "stripe" && processor !== "paypal") {
      return res.status(400).json({ error: "processor must be 'stripe' or 'paypal'" });
    }
    const sessionRef = String(b.session_ref || "");
    if (!sessionRef) return res.status(400).json({ error: "session_ref required" });

    const result = await captureCheckout(processor, sessionRef);
    if (!result.paid) {
      return res.status(402).json({ error: "payment not completed", status: result.raw_status });
    }
    const flow: PaymentFlow =
      PAYMENT_FLOWS.includes(b.flow) && b.flow !== "external_recorded" ? b.flow : "client_to_vendor";
    // Attribute to the issuing org when paying an invoice (fee follows their tier).
    let feeOrgId = actor.org.id;
    let feeTier: string | null = actor.org.tier;
    if (b.invoice_id) {
      // IDOR gate: only a party to the invoice may capture against it.
      const authorized = await authorizeInvoiceParty(actor.org.id, b.invoice_id);
      if (!authorized) {
        return res.status(403).json({ error: "not authorized to pay this invoice" });
      }
      const v = await invoiceOrgTier(b.invoice_id);
      if (v) { feeOrgId = v.orgId; feeTier = v.tier; }
    }
    // Did the money already split to the vendor? Stripe Connect splits at the
    // charge; PayPal needs a Payout after capture.
    const stripeDest = processor === "stripe" ? await activeStripeDestination(feeOrgId) : null;
    const ppEmail = processor === "paypal" ? await paypalPayoutEmail(feeOrgId) : null;
    const autoSplit = !!stripeDest; // stripe already transferred the net

    const { payment, created } = await recordProcessorPayment(feeOrgId, feeTier, actor.user.id, {
      invoice_id: b.invoice_id ?? null,
      event_id: b.event_id ?? null,
      amount: result.amount,
      method: processor,
      flow,
      kind: (b.kind as PaymentKind) ?? "full",
      reference: result.reference,
      payout_status: autoSplit ? "payout_sent" : "payment_received",
    });
    if (created && b.invoice_id) await applyPaymentToInvoice(b.invoice_id, result.amount);

    // PayPal: disburse the vendor's net automatically when they have a payout email.
    let payout: { ok: boolean; status: string } | null = null;
    if (created && ppEmail) {
      // C2/C3: disburse exactly the recorded net_payout
      // (amount - platformFee - processingFee), not amount - platformFee.
      const net = recordingFees(result.amount, feeTier).netPayout;
      if (net > 0) {
        try {
          const r = await createPaypalPayout(ppEmail, net, result.currency, `Divini payout for ${b.invoice_id ? `invoice ${b.invoice_id}` : "a booking"}`, payment.id);
          payout = { ok: r.ok, status: r.status };
          await updatePayoutStatus(feeOrgId, payment.id, r.ok ? "payout_sent" : "payout_failed");
        } catch {
          await updatePayoutStatus(feeOrgId, payment.id, "payout_failed").catch(() => null);
          payout = { ok: false, status: "error" };
        }
      }
    }

    // Receipt to the payer (no-op when email is not configured).
    if (created && actor.user.email) {
      const amtStr = new Intl.NumberFormat("en-US", { style: "currency", currency: result.currency || "USD" }).format(result.amount);
      sendEmail({
        to: actor.user.email,
        subject: `Your Divini Partners payment of ${amtStr} is confirmed`,
        text: [
          "Thank you. Your payment has been received and recorded on your Divini Partners account.",
          `Amount: ${amtStr}`,
          b.invoice_id ? `Invoice: ${b.invoice_id}` : "",
          "A full record is available on your payments page.",
        ].filter(Boolean).join("\n\n"),
      }).catch(() => null);
    }

    res.status(created ? 201 : 200).json({ payment, created, paid: true, auto_split: autoSplit, payout });
  }),
);

/** Stripe webhook. Verifies the signature against the raw body, records the
 *  payment on checkout.session.completed. Always 2xx on a handled event. */
router.post(
  "/webhook/stripe",
  h(async (req, res) => {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    const event = verifyStripeEvent(raw ?? "", req.headers["stripe-signature"] as string | undefined);
    if (!event) return res.status(400).json({ error: "invalid signature" });
    // H2: only a genuine processing/DB failure returns 500 so Stripe retries.
    // A bad signature above is the only 400.
    try {
      // A connected vendor account finished (or changed) onboarding: flip their
      // payout status automatically, no need to revisit the setup page.
      if (event.type === "account.updated") {
        const acct = (event.data as { object?: Record<string, unknown> } | undefined)?.object ?? {};
        await syncStripeAccountByExternalId(String(acct.id ?? ""), {
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          details_submitted: !!acct.details_submitted,
        });
      }
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const s = (event.data as { object?: Record<string, unknown> } | undefined)?.object ?? {};
        if (s.payment_status === "paid") {
          const m = (s.metadata as Record<string, string> | null) ?? {};
          const orgId = m.org_id;
          if (orgId) {
            const reference = String((s.payment_intent as string) || s.id);
            const amt = Number(s.amount_total ?? 0) / 100;
            const autoSplit = !!(await activeStripeDestination(orgId)); // Connect transferred the net
            const { created } = await recordProcessorPayment(orgId, m.tier || (await orgTier(orgId)), m.recorded_by || null, {
              invoice_id: m.invoice_id || null,
              event_id: m.event_id || null,
              amount: amt,
              method: "stripe",
              flow: (m.flow as PaymentFlow) || "client_to_vendor",
              kind: (m.kind as PaymentKind) || "full",
              reference,
              payout_status: autoSplit ? "payout_sent" : "payment_received",
            });
            if (created && m.invoice_id) await applyPaymentToInvoice(m.invoice_id, amt);
          }
        }
      }
      return res.json({ received: true });
    } catch {
      return res.status(500).json({ error: "processing failed" });
    }
  }),
);

/** PayPal webhook. Verifies via PayPal's verify-webhook-signature API (skipped
 *  when PAYPAL_WEBHOOK_ID is unset, e.g. sandbox), records on capture completed. */
router.post(
  "/webhook/paypal",
  h(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (paypalWebhookIdSet()) {
      const ok = await verifyPaypalWebhook(req.headers as Record<string, string | undefined>, body);
      if (!ok) return res.status(400).json({ error: "invalid signature" });
    } else if (IS_PROD) {
      // C4: fail closed. With no PAYPAL_WEBHOOK_ID set we cannot verify the
      // event, so in production we reject and never process or pay out off an
      // unverified webhook. The skip-and-process path is dev/sandbox only.
      return res.status(400).json({ error: "webhook verification not configured" });
    }
    // H2: only a genuine processing/DB failure returns 500 so PayPal retries.
    try {
      if (body.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const r = (body.resource as Record<string, unknown> | undefined) ?? {};
        const amtObj = (r.amount as { value?: string; currency_code?: string } | undefined) ?? {};
        const amount = Number(amtObj.value ?? 0);
        const meta = unpackCustomId(r.custom_id as string | undefined);
        const orgId = meta.org_id;
        if (orgId && amount > 0) {
          const tier = await orgTier(orgId);
          const { payment, created } = await recordProcessorPayment(orgId, tier, null, {
            invoice_id: meta.invoice_id || null,
            event_id: meta.event_id || null,
            amount,
            method: "paypal",
            flow: "client_to_vendor",
            kind: "full",
            reference: String(r.id || ""),
          });
          if (created && meta.invoice_id) await applyPaymentToInvoice(meta.invoice_id, amount);
          // Auto-disburse the vendor's net (only on first record, so no double payout).
          if (created) {
            const ppEmail = await paypalPayoutEmail(orgId);
            if (ppEmail) {
              // C2/C3: disburse exactly the recorded net_payout
              // (amount - platformFee - processingFee).
              const net = recordingFees(amount, tier).netPayout;
              if (net > 0) {
                const payoutRes = await createPaypalPayout(ppEmail, net, String(amtObj.currency_code || "USD"), "Divini payout", payment.id);
                await updatePayoutStatus(orgId, payment.id, payoutRes.ok ? "payout_sent" : "payout_failed");
              }
            }
          }
        }
      }
      return res.json({ received: true });
    } catch {
      return res.status(500).json({ error: "processing failed" });
    }
  }),
);

export default router;
