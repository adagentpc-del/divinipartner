/**
 * Nonprofit Auction Management - routes (Phase 2). Mount base: /api/auction.
 *
 *   GET    /api/auction/items                 list the org's auction items (+ high bid)
 *                                             optional ?fundraising_event_id=
 *   GET    /api/auction/items/:id             get one item (org-scoped)
 *   POST   /api/auction/items                 intake a donated item
 *   PATCH  /api/auction/items/:id             edit an item
 *   DELETE /api/auction/items/:id             remove an item
 *   GET    /api/auction/items/:id/bids        list bids (+ current high)
 *   POST   /api/auction/items/:id/bids        record a bid
 *   POST   /api/auction/items/:id/award       set the winner (status -> awarded)
 *   POST   /api/auction/items/:id/checkout    initiate hosted checkout for the won item
 *   PATCH  /api/auction/items/:id/payment     set payment_status (unpaid/pending/paid)
 *
 * Every route is org-scoped and IDOR-safe via the auction repo
 * (server/src/db/auction.ts), which validates each row against the actor's org
 * before any read or write. Mirrors server/src/routes/fundraising-events.ts:
 * requireUser, getActor, the h() async wrapper, 400 on bad input, 403/404 from
 * the repo's ForbiddenError/NotFoundError.
 *
 * Checkout reuses the payments processors (server/src/lib/processors.ts). It
 * NEVER auto-charges: it creates a hosted checkout session and returns its
 * redirect_url for the winning bidder to complete, marking the item 'pending'.
 * When no processor is configured it records-only (marks 'pending' and returns
 * a record-only result) so the flow degrades gracefully.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as auction from "../db/auction.js";
import { notify } from "../lib/notify.js";
import {
  enabledProcessors,
  createCheckout,
  type Processor,
} from "../lib/processors.js";
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

// ---- Items ------------------------------------------------------------------

/** List the actor org's auction items (each with its current high bid). */
router.get(
  "/items",
  h(async (req, res) => {
    const a = await actor(req);
    const fundraisingEventId =
      typeof req.query.fundraising_event_id === "string" ? req.query.fundraising_event_id : undefined;
    res.json({ items: await auction.listAuctionItems(a, { fundraisingEventId }) });
  }),
);

/** Get one auction item (org-scoped). */
router.get(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ item: await auction.getAuctionItem(a, req.params.id) });
  }),
);

/** Intake a donated auction item for the actor's org. Notifies on create. */
router.post(
  "/items",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    if (!body.item_name || typeof body.item_name !== "string") {
      return res.status(400).json({ error: "item_name required" });
    }
    const item = await auction.createAuctionItem(a, body);
    // Notify the org owner that a new item was catalogued. Best-effort.
    if (a.user.email) {
      notify
        .auctionItemAdded(a.user.email, item.item_name ?? "an item", {
          message: item.donor_name ? `Donated by ${item.donor_name}.` : undefined,
        })
        .catch(() => null);
    }
    res.status(201).json({ item });
  }),
);

/** Patch an auction item (org-scoped). */
router.patch(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ item: await auction.updateAuctionItem(a, req.params.id, req.body ?? {}) });
  }),
);

/** Remove an auction item (org-scoped). */
router.delete(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await auction.removeAuctionItem(a, req.params.id);
    res.status(204).end();
  }),
);

// ---- Bids -------------------------------------------------------------------

/** List bids for an item (org-scoped) plus the current high bid. */
router.get(
  "/items/:id/bids",
  h(async (req, res) => {
    const a = await actor(req);
    const bids = await auction.listBids(a, req.params.id);
    const current_high_bid = bids.reduce((hi, b) => {
      const n = Number(b.amount);
      return Number.isFinite(n) && n > hi ? n : hi;
    }, 0);
    res.json({ bids, current_high_bid });
  }),
);

/** Record a bid against an item (org-scoped). */
router.post(
  "/items/:id/bids",
  h(async (req, res) => {
    const a = await actor(req);
    const result = await auction.recordBid(a, req.params.id, req.body ?? {});
    res.status(201).json(result);
  }),
);

// ---- Award ------------------------------------------------------------------

/**
 * Award an item to a winning bidder (status -> awarded). Notifies the winner
 * (auctionWon) and, because the item is left unpaid, nudges payment due
 * (auctionPaymentDue). Never charges. The winner email may be supplied as
 * winner_email; otherwise notifications fall back to the actor (organizer).
 */
router.post(
  "/items/:id/award",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const item = await auction.awardItem(a, req.params.id, body);
    const label = item.item_name ?? "an auction item";
    const winnerEmail =
      typeof body.winner_email === "string" && body.winner_email.includes("@")
        ? body.winner_email
        : null;
    const to = winnerEmail ?? a.user.email;
    if (to) {
      const amount = item.winning_bid ?? "";
      notify.auctionWon(to, label, { message: `Winning bid: ${amount}.` }).catch(() => null);
      // Awarded items start unpaid: nudge that payment is due (no auto-charge).
      if (item.payment_status !== "paid") {
        notify.auctionPaymentDue(to, label, { message: `Amount due: ${amount}.` }).catch(() => null);
      }
    }
    res.json({ item });
  }),
);

// ---- Checkout (NEVER auto-charge) -------------------------------------------

/**
 * Initiate a hosted checkout for a won item. Reuses the payments processors:
 * creates a Stripe/PayPal checkout session and returns its redirect_url for the
 * winning bidder to complete. Marks the item payment_status 'pending'. When no
 * processor is enabled (or none requested) we record-only: mark 'pending' and
 * return { record_only: true } so the organizer can collect offline and later
 * PATCH the item to 'paid'. We never charge a card from this endpoint.
 */
router.post(
  "/items/:id/checkout",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const { item, amount, label } = await auction.getAwardForCheckout(a, req.params.id);

    const en = enabledProcessors();
    const requested = body.processor as Processor | undefined;
    const processor: Processor | null =
      requested === "stripe" && en.stripe
        ? "stripe"
        : requested === "paypal" && en.paypal
          ? "paypal"
          : en.stripe
            ? "stripe"
            : en.paypal
              ? "paypal"
              : null;

    // Record-only fallback: no live processor. Mark pending; organizer collects
    // offline and later marks the item paid. Never charges.
    if (!processor) {
      const updated = await auction.setPaymentStatus(a, item.id, "pending");
      return res.status(201).json({
        record_only: true,
        item: updated,
        amount,
        message: "No payment processor is configured. Item marked pending for offline collection.",
      });
    }

    const base = appBaseUrl(req);
    const successUrl =
      `${base}/pay/return?processor=${processor}&flow=client_to_vendor&kind=full&auction_item_id=${encodeURIComponent(item.id)}` +
      (processor === "stripe" ? "&session_ref={CHECKOUT_SESSION_ID}" : "");
    const cancelUrl = `${base}/pay/return?status=cancel`;

    const checkout = await createCheckout({
      processor,
      amount,
      label,
      successUrl,
      cancelUrl,
      metadata: {
        org_id: item.organization_id ?? "",
        auction_item_id: item.id,
        tier: a.org?.tier ?? "",
        flow: "client_to_vendor",
        kind: "full",
        recorded_by: a.user.id,
      },
    });

    // Initiated, not captured: mark the item pending. Capture/recording (and the
    // move to 'paid') happens via the payments capture/webhook flow + a PATCH to
    // /payment from the return page. We never auto-charge here.
    await auction.setPaymentStatus(a, item.id, "pending");
    res.status(201).json({ ...checkout, amount, label });
  }),
);

/** Set payment_status of a won item (unpaid / pending / paid). Never charges. */
router.patch(
  "/items/:id/payment",
  h(async (req, res) => {
    const a = await actor(req);
    const status = (req.body ?? {}).payment_status;
    if (status !== "unpaid" && status !== "pending" && status !== "paid") {
      return res.status(400).json({ error: "payment_status must be unpaid, pending, or paid" });
    }
    res.json({ item: await auction.setPaymentStatus(a, req.params.id, status) });
  }),
);

export default router;
