/**
 * Public ticket purchase flow - purchase routes. Mount base: /api/ticket-purchases.
 *
 *   GET    /                buyer's own purchases + incoming purchases against
 *                            packages the actor's org (nonprofit) owns
 *   POST   /                buy `quantity` tickets from a package (-> pending)
 *   GET    /:id              one purchase (IDOR-scoped)
 *   POST   /:id/checkout     initiate a payment for the purchase amount
 *   POST   /:id/paid         record a completed payment, -> paid
 *   PATCH  /:id/status       buyer (pending only) or nonprofit (any time) cancels
 *
 * Auth model: every route requires a signed-in user with an org. A buyer sees
 * and drives their own purchases; the nonprofit that owns a package sees
 * purchases against it. IDOR enforcement lives in the data layer
 * (getPurchaseScoped / actorIsBuyer / actorIsNonprofitOwner).
 *
 * Payment initiation REUSES the existing processor/checkout flow (lib/processors
 * createCheckout), exactly as server/src/routes/sponsor-purchases.ts does: it
 * creates a hosted Stripe/PayPal checkout session and returns the redirect_url.
 * No money is auto-charged here; the purchase is marked paid only after the
 * buyer returns and confirms via this route's POST /:id/paid.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as repo from "../db/ticket-purchases.js";
import { enabledProcessors, createCheckout, type Processor } from "../lib/processors.js";
import { findPaymentByReference } from "../db/payments.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

const router = Router();
router.use(requireUser);

/**
 * List purchases for the actor. A buyer org gets its own purchases; the same
 * call also returns purchases made against packages the actor's org owns
 * (nonprofit side). The two sets are merged and de-duplicated by id.
 */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ purchases: [] });
    const [asBuyer, asNonprofit] = await Promise.all([
      repo.listForBuyer(a.org.id),
      repo.listForNonprofit(a.org.id),
    ]);
    const byId = new Map<string, repo.TicketPurchase>();
    for (const p of [...asBuyer, ...asNonprofit]) byId.set(p.id, p);
    res.json({ purchases: [...byId.values()] });
  }),
);

/** Buy tickets from a package. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "register an organization first" });
    const body = req.body ?? {};
    const packageId = body.ticket_package_id;
    if (!packageId || typeof packageId !== "string") {
      return res.status(400).json({ error: "ticket_package_id required" });
    }
    const quantity = Number(body.quantity ?? 1);
    const purchase = await repo.createPurchase(a.org.id, a.user.id, packageId, quantity);
    res.status(201).json({ purchase });
  }),
);

/** One purchase, IDOR-scoped. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    res.json({ purchase });
  }),
);

/**
 * Initiate a hosted checkout for the purchase amount. When no processor is
 * configured, returns record_only so the client falls back to the manual
 * paid confirmation.
 */
router.post(
  "/:id/checkout",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "register an organization first" });
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsBuyer(a, purchase)) {
      return res.status(403).json({ error: "only the buyer can pay for this purchase" });
    }
    const body = req.body ?? {};
    const processor = body.processor as Processor;
    if (processor !== "stripe" && processor !== "paypal") {
      return res.status(400).json({ error: "processor must be 'stripe' or 'paypal'" });
    }
    const en = enabledProcessors();
    if ((processor === "stripe" && !en.stripe) || (processor === "paypal" && !en.paypal)) {
      return res.status(200).json({ record_only: true });
    }
    const amount = Number(body.amount ?? purchase.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "positive amount required" });
    }
    const base = appBaseUrl(req);
    const successUrl =
      `${base}/pay/return?processor=${processor}&flow=client_to_vendor&kind=full` +
      (processor === "stripe" ? "&session_ref={CHECKOUT_SESSION_ID}" : "");
    const cancelUrl = `${base}/pay/return?status=cancel`;
    const checkout = await createCheckout({
      processor,
      amount,
      label: `Tickets: ${purchase.id}`,
      successUrl,
      cancelUrl,
      metadata: {
        org_id: a.org.id,
        event_id: purchase.fundraising_event_id ?? "",
        flow: "client_to_vendor",
        kind: "full",
        recorded_by: a.user.id,
        ticket_purchase_id: purchase.id,
      },
    });
    res.status(201).json(checkout);
  }),
);

/**
 * Mark a purchase paid. When a real processor is live, only accepted off a
 * VERIFIED captured payment (mirrors sponsor-purchases.ts's checkout
 * bypass guard). When no processor is configured, this manual confirmation
 * is the intended record-only fallback.
 */
router.post(
  "/:id/paid",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsBuyer(a, purchase)) {
      return res.status(403).json({ error: "only the buyer can confirm payment" });
    }
    const body = req.body ?? {};
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
    // The amount is ALWAYS the server-side purchase price (stamped at
    // purchase creation), never the client-supplied body.amount.
    const amount = purchase.amount != null ? Number(purchase.amount) : null;
    const en = enabledProcessors();
    if (en.stripe || en.paypal) {
      if (!paymentId) {
        return res.status(402).json({ error: "payment required: complete checkout before confirming" });
      }
      const pay = await findPaymentByReference(paymentId);
      const expected = amount ?? 0;
      if (!pay || Number(pay.amount) + 1e-6 < expected) {
        return res.status(402).json({ error: "no matching captured payment found for this purchase" });
      }
    }
    const updated = await repo.markPaid(purchase.id, paymentId, amount);
    res.json({ purchase: updated });
  }),
);

/** Cancel a purchase: the buyer (while still pending) or the nonprofit (any time). */
router.patch(
  "/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    const status = (req.body ?? {}).status;
    if (status !== "cancelled") {
      return res.status(400).json({ error: "status must be 'cancelled'" });
    }
    const isBuyer = repo.actorIsBuyer(a, purchase);
    const isNonprofit = await repo.actorIsNonprofitOwner(a, purchase.id);
    if (!isNonprofit && !(isBuyer && purchase.status === "pending")) {
      return res.status(403).json({
        error: isBuyer
          ? "a paid purchase can only be cancelled by the nonprofit"
          : "only the buyer or the nonprofit can cancel this purchase",
      });
    }
    const updated = await repo.setStatus(purchase.id, "cancelled");
    res.json({ purchase: updated });
  }),
);

export default router;
