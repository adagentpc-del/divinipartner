/**
 * Phase 3 - Bid routes. Mount base: /api/bids.
 *
 * Post bids, list the bid board (tier-access decision attached per row), invite
 * vendors, transition bid status, and submit a quote against a bid (delegates
 * to the quotes layer so the bid board has a one-step "respond" action).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as bids from "../db/bids.js";
import * as quotes from "../db/quotes.js";
import { getEvent } from "../db/events.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Reference data for the UI (types + statuses). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ types: bids.BID_TYPES, statuses: bids.BID_STATUSES });
  }),
);

/** Vendor-facing bid board with tier-access decisions. Filters: category, rush. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const category = (req.query.category as string) || null;
    const rush = req.query.rush === "true";
    res.json({ bids: await bids.listBoardBids(a, { category, rush }) });
  }),
);

/** All bids on a single event (owner view). */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ bids: await bids.listEventBids(a, req.params.eventId) });
  }),
);

/** Single bid + tier-access decision for the acting org. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const bid = await bids.getBid(req.params.id);
    const access = bids.canVendorAccessBid(bid, a.org?.tier ?? null, new Date(), a.org?.id ?? null);
    // Don't leak a private/invite-only RFP's budget + scope to a vendor who is
    // not permitted to see it. When vendor access is denied, only the event side
    // (owner/planner/assigned participant) may view the full bid; everyone else
    // gets 403 instead of the serialized row.
    if (!access.allowed) {
      try {
        if (bid.event_id) await getEvent(a, bid.event_id);
        else throw new Error("no event");
      } catch {
        return res.status(403).json({ error: access.reason || "no access to this bid" });
      }
    }
    res.json({ bid, access });
  }),
);

/** Post (or draft) a bid on an event. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { event_id } = req.body ?? {};
    if (!event_id) return res.status(400).json({ error: "event_id required" });
    const bid = await bids.createBid(a, req.body);
    if (bid.status !== "draft") {
      // A live bid is confirmed to the event owner side (client, planner, the
      // organizing org, the venue). Best-effort, never blocks the response.
      const to = await recipients.eventOwnerEmails(bid.event_id).catch(() => [] as string[]);
      const name = (await recipients.eventName(bid.event_id).catch(() => null)) ?? "your event";
      if (to.length) await notify.bidPosted(to, name, { bidId: bid.id }).catch(() => undefined);
    }
    res.status(201).json({ bid });
  }),
);

/** Invite vendor orgs to a (private) bid. */
router.post(
  "/:id/invite",
  h(async (req, res) => {
    const a = await actor(req);
    const orgIds: string[] = Array.isArray(req.body?.organization_ids) ? req.body.organization_ids : [];
    if (orgIds.length === 0) return res.status(400).json({ error: "organization_ids[] required" });
    const bid = await bids.inviteVendors(a, req.params.id, orgIds);
    // The invited vendor orgs are the recipients, not the inviter.
    const to = await recipients.orgEmails(orgIds).catch(() => [] as string[]);
    const name = (await recipients.eventName(bid.event_id).catch(() => null)) ?? "an event";
    if (to.length) await notify.bidInvited(to, name, { bidId: bid.id }).catch(() => undefined);
    res.json({ bid });
  }),
);

/** Transition a bid's status. */
router.post(
  "/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!bids.isBidStatus(status)) return res.status(400).json({ error: "invalid status" });
    res.json({ bid: await bids.setBidStatus(a, req.params.id, status) });
  }),
);

/** Vendor submits a quote against this bid. */
router.post(
  "/:id/quote",
  h(async (req, res) => {
    const a = await actor(req);
    const bid = await bids.getBid(req.params.id);
    const access = bids.canVendorAccessBid(bid, a.org?.tier ?? null, new Date(), a.org?.id ?? null);
    if (!access.allowed) return res.status(403).json({ error: access.reason });
    const quote = await quotes.createQuote(a, {
      bid_id: bid.id,
      vendor_id: req.body?.vendor_id ?? null,
      line_items: Array.isArray(req.body?.line_items) ? req.body.line_items : [],
      expiration_date: req.body?.expiration_date ?? null,
      submit: req.body?.submit !== false,
    });
    // A submitted quote notifies the event owner side, excluding the vendor who
    // submitted it. Best-effort.
    const to = recipients.excluding(
      await recipients.eventOwnerEmails(bid.event_id).catch(() => [] as string[]),
      a.user.email,
    );
    const name = (await recipients.eventName(bid.event_id).catch(() => null)) ?? "your event";
    if (to.length) await notify.quoteSubmitted(to, name, { quoteId: quote.id }).catch(() => undefined);
    res.status(201).json({ quote });
  }),
);

export default router;
