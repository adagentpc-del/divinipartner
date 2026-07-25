/**
 * Universal Event Landing - PUBLIC surface (no auth). Mount base: /api/public/event.
 *
 *   GET  /:eventId              the public landing payload (details, agenda, tiers)
 *   POST /:eventId/register     free register, or start a ticket order + Stripe checkout
 *   GET  /:eventId/exhibit      what a vendor can buy to exhibit
 *   POST /:eventId/apply        apply to exhibit, or start an exhibitor order + checkout
 *   POST /checkout/confirm      settle a returned checkout by session ref (idempotent)
 *
 * Money flow (marketplace split): a paid ticket/booth charges the buyer the face
 * price via Stripe Checkout as a DESTINATION charge to the event organizer's
 * connected account, with the platform fee retained as the application fee. If
 * the organizer has not connected Stripe yet, the charge falls back to the
 * platform account (platform-collected; organizer paid out separately). If
 * Stripe is not configured at all, the order is still reserved and returned as
 * pending so the organizer can collect offline.
 *
 * Fulfillment is idempotent and double-guarded: this return endpoint captures
 * and confirms synchronously, and the Stripe webhook
 * (server/src/routes/payments.ts) is the backstop for the same transition and
 * for releasing inventory on an expired session. Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as el from "../db/eventLanding.js";
import * as ex from "../db/eventExhibitor.js";
import * as pc from "../db/publicCheckout.js";
import { publicWriteRateLimit } from "../lib/rateLimit.js";
import { enabledProcessors, createCheckout, captureCheckout } from "../lib/processors.js";
import { activeStripeDestination } from "../db/payout-accounts.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Base URL for buyer return links, honoring PUBLIC_APP_URL then the request host. */
function baseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

/**
 * Create a Stripe checkout for a pending public order and return the redirect.
 * Returns null when Stripe is not configured (caller returns the order as
 * pending). Splits to the organizer's connected account when present, else the
 * charge lands in the platform account (platform-collected fallback).
 */
async function startCheckout(
  req: Request,
  args: {
    eventId: string;
    orderId: string;
    purpose: "event_ticket" | "exhibitor";
    amountCents: number;
    platformFeeCents: number;
    label: string;
  },
): Promise<{ redirect_url: string; session_ref: string } | null> {
  const en = enabledProcessors();
  if (!en.stripe || args.amountCents <= 0) return null;

  const owner = await pc.getEventOwner(args.eventId);
  const base = baseUrl(req);
  const ret =
    `${base}/event/${encodeURIComponent(args.eventId)}?paid=1&purpose=${args.purpose}` +
    `&order_id=${encodeURIComponent(args.orderId)}&session_ref={CHECKOUT_SESSION_ID}`;
  const cancel = `${base}/event/${encodeURIComponent(args.eventId)}?paid=cancel`;

  // Destination charge to the organizer when they have an onboarded, payouts-
  // enabled Stripe account; retain the platform fee as the application fee.
  let destinationAccount: string | undefined;
  let applicationFeeCents: number | undefined;
  if (owner) {
    const dest = await activeStripeDestination(owner.orgId);
    if (dest) {
      destinationAccount = dest;
      applicationFeeCents = Math.max(0, Math.round(args.platformFeeCents));
    }
  }

  const checkout = await createCheckout({
    processor: "stripe",
    amount: args.amountCents / 100,
    label: args.label,
    successUrl: ret,
    cancelUrl: cancel,
    destinationAccount,
    applicationFeeCents,
    metadata: {
      purpose: args.purpose,
      order_id: args.orderId,
      event_id: args.eventId,
      org_id: owner?.orgId ?? "",
      tier: owner?.tier ?? "",
      flow: "client_to_vendor",
      kind: "full",
      recorded_by: "",
    },
  });
  return { redirect_url: checkout.redirect_url, session_ref: checkout.session_ref };
}

const router = Router();

router.get(
  "/:eventId",
  h(async (req, res) => {
    const landing = await el.getPublicLanding(req.params.eventId);
    if (!landing) return res.status(404).json({ error: "Event not found." });
    res.json({ landing });
  }),
);

router.post(
  "/:eventId/register",
  publicWriteRateLimit,
  h(async (req, res) => {
    const result = await el.registerAttendee(req.params.eventId, req.body ?? {});
    if (!result) return res.status(400).json({ error: "This event is not accepting attendees." });

    // Free RSVP: nothing to charge. Paid ticket: hand off to Stripe checkout.
    if (result.order_status !== "pending_payment") {
      return res.status(201).json({ ...result, checkout: null });
    }
    const checkout = await startCheckout(req, {
      eventId: req.params.eventId,
      orderId: result.registration_id,
      purpose: "event_ticket",
      amountCents: result.amount_cents,
      platformFeeCents: result.platform_fee_cents,
      label: "Event ticket",
    }).catch(() => null);
    res.status(201).json({ ...result, checkout, payment_required: true });
  }),
);

/** Public: what a vendor can buy to exhibit. */
router.get(
  "/:eventId/exhibit",
  h(async (req, res) => {
    res.json(await ex.publicExhibitorOffer(req.params.eventId));
  }),
);

/** Public: apply to exhibit. Paid orders hand off to Stripe checkout. */
router.post(
  "/:eventId/apply",
  publicWriteRateLimit,
  h(async (req, res) => {
    const result = await ex.applyExhibitor(req.params.eventId, req.body ?? {});
    if (!result) return res.status(400).json({ error: "This event is not taking vendors yet." });

    if (result.status !== "pending_payment") {
      return res.status(201).json({ ...result, checkout: null });
    }
    const checkout = await startCheckout(req, {
      eventId: req.params.eventId,
      orderId: result.order_id,
      purpose: "exhibitor",
      amountCents: result.amount_cents,
      platformFeeCents: result.platform_fee_cents,
      label: "Exhibitor package",
    }).catch(() => null);
    res.status(201).json({ ...result, checkout, payment_required: true });
  }),
);

/**
 * Settle a returned checkout. The buyer lands back with a session_ref; we capture
 * it and confirm the matching order. Idempotent (the guarded order transition and
 * the webhook backstop converge on the same outcome). No auth: the session ref is
 * an unguessable Stripe id and confirmation only flips a pending order to paid.
 */
router.post(
  "/checkout/confirm",
  publicWriteRateLimit,
  h(async (req, res) => {
    const sessionRef = String((req.body ?? {}).session_ref || "");
    if (!sessionRef) return res.status(400).json({ error: "session_ref required" });
    const en = enabledProcessors();
    if (!en.stripe) return res.status(503).json({ error: "Stripe is not configured." });

    const result = await captureCheckout("stripe", sessionRef);
    if (!result.paid) {
      return res.status(402).json({ error: "Payment not completed.", status: result.raw_status });
    }
    const m = result.metadata ?? {};
    const purpose = m.purpose;
    const orderId = m.order_id;
    if (!orderId || (purpose !== "event_ticket" && purpose !== "exhibitor")) {
      return res.status(400).json({ error: "This checkout is not a public event order." });
    }
    const confirmed =
      purpose === "event_ticket"
        ? await pc.confirmTicketOrder(orderId, result.reference)
        : await pc.confirmExhibitorOrder(orderId, result.reference);
    res.json({ ok: true, purpose, order_id: orderId, confirmed, order_status: "confirmed" });
  }),
);

export default router;
