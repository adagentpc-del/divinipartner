/**
 * Phase 3 - Quote routes. Mount base: /api/quotes.
 *
 * Create/generate, revise, submit, accept, decline a quote, and fetch the
 * standardized quote payload (Divini frame + vendor brand + line items + fee).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as quotes from "../db/quotes.js";
import { awardQuote, getContractForQuote, listContractMilestones } from "../db/awards.js";
import { refreshRelationshipGraphForQuote } from "../db/lifecycle.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";
import { renderQuotePdf } from "../lib/pdf.js";

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

/** Reference data for the UI (status list). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ statuses: quotes.QUOTE_STATUSES });
  }),
);

/** Quotes on an event. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ quotes: await quotes.listEventQuotes(a, req.params.eventId) });
  }),
);

/** Quotes on a bid. */
router.get(
  "/bid/:bidId",
  h(async (req, res) => {
    const a = await actor(req);
    const eventId = (req.query.event_id as string) || "";
    if (!eventId) return res.status(400).json({ error: "event_id required" });
    res.json({ quotes: await quotes.listBidQuotes(a, eventId, req.params.bidId) });
  }),
);

/** Generate / create a quote. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const items = req.body?.line_items;
    if (!Array.isArray(items)) return res.status(400).json({ error: "line_items[] required" });
    res.status(201).json({ quote: await quotes.createQuote(a, req.body) });
  }),
);

/** Single quote (raw). */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const quote = await quotes.authorizeQuoteAccess(a, req.params.id);
    res.json({ quote });
  }),
);

/** Standardized quote payload for display. */
router.get(
  "/:id/standardized",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
    res.json({ quote: await quotes.getStandardizedQuote(req.params.id) });
  }),
);

/** Branded, downloadable standardized quote PDF. */
router.get(
  "/:id/pdf",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
    const qd = await quotes.getStandardizedQuote(req.params.id);
    const pdf = await renderQuotePdf(qd);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="quote-${qd.quote_id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  }),
);

/** Revise a quote (recomputes totals). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
    res.json({ quote: await quotes.reviseQuote(a, req.params.id, req.body ?? {}) });
  }),
);

/** Prior versions of a quote (the terms that existed before each revision). */
router.get(
  "/:id/versions",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ versions: await quotes.listQuoteVersions(a, req.params.id) });
  }),
);

/** Submit a generated/revised quote. */
router.post(
  "/:id/submit",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
    const quote = await quotes.submitQuote(req.params.id);
    // Submitting a quote notifies the event owner side, excluding the submitter.
    const eventId = (await recipients.quoteEventId(quote.id).catch(() => null)) ?? "";
    if (eventId) {
      const to = recipients.excluding(
        await recipients.eventOwnerEmails(eventId).catch(() => [] as string[]),
        a.user.email,
      );
      const name = (await recipients.eventName(eventId).catch(() => null)) ?? "your event";
      if (to.length) await notify.quoteSubmitted(to, name, { quoteId: quote.id }).catch(() => undefined);
    }
    res.json({ quote });
  }),
);

/** Accept a quote. */
router.post(
  "/:id/accept",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteOwner(a, req.params.id);
    // Terminal event: accepting a quote is the AWARD. awardQuote() is
    // idempotent (a second call on an already-awarded quote is a no-op) and
    // atomically closes competing quotes on the same bid, marks the bid
    // awarded, promotes the winning vendor's event_vendors row so it
    // connects into the live-ops event membership model, demotes losing
    // bidders so they stop retaining live event access, and creates the
    // real contract + payment-milestone schedule.
    const award = await awardQuote(a, req.params.id, { override: !!req.body?.override });
    if (award.firstAward) await refreshRelationshipGraphForQuote(req.params.id).catch(() => undefined);
    const quote = await quotes.getQuote(req.params.id);
    // A decision notifies the vendor org that submitted the quote, not the
    // client who decided. Best-effort. Declined competitors get their own
    // notification too (award.declinedQuoteIds), not a silent status flip.
    const to = recipients.excluding(
      await recipients.quoteVendorEmails(quote.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length) await notify.quoteDecision(to, "accepted", { quoteId: quote.id }).catch(() => undefined);
    for (const declinedId of award.declinedQuoteIds) {
      const declinedTo = await recipients.quoteVendorEmails(declinedId).catch(() => [] as string[]);
      if (declinedTo.length)
        await notify.quoteDecision(declinedTo, "declined", { quoteId: declinedId }).catch(() => undefined);
    }
    res.json({ quote, contract: award.contract });
  }),
);

/** The contract created by awarding this quote, if any. */
router.get(
  "/:id/contract",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
    const contract = await getContractForQuote(req.params.id);
    const milestones = contract ? await listContractMilestones(contract.id) : [];
    res.json({ contract, milestones });
  }),
);

/** Decline a quote. */
router.post(
  "/:id/decline",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteOwner(a, req.params.id);
    const quote = await quotes.setQuoteStatus(req.params.id, "declined");
    const to = recipients.excluding(
      await recipients.quoteVendorEmails(quote.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length) await notify.quoteDecision(to, "declined", { quoteId: quote.id }).catch(() => undefined);
    res.json({ quote });
  }),
);

/** Request a revision on a quote. */
router.post(
  "/:id/request-revision",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteOwner(a, req.params.id);
    const quote = await quotes.setQuoteStatus(req.params.id, "revision_requested");
    const to = recipients.excluding(
      await recipients.quoteVendorEmails(quote.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length)
      await notify.quoteDecision(to, "revision requested", { quoteId: quote.id }).catch(() => undefined);
    res.json({ quote });
  }),
);

/** Q&A / negotiate thread on a quote. Owner or the quote's own vendor may read. */
router.get(
  "/:id/messages",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ messages: await quotes.listQuoteMessages(a, req.params.id) });
  }),
);

/**
 * Post a question / negotiation message on a quote. The author side is derived
 * server-side from event ownership. When the client asks for changes
 * (request_revision), the quote is pushed back to 'revision_requested' so the
 * vendor updates it. Notifies the other party best-effort.
 */
router.post(
  "/:id/messages",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body?.body as string) ?? "";
    if (!body.trim()) return res.status(400).json({ error: "body required" });
    const message = await quotes.postQuoteMessage(a, req.params.id, {
      body,
      request_revision: !!req.body?.request_revision,
    });
    // Notify the opposite side. Client authored -> tell the vendor org; vendor
    // authored -> tell the event owner. Best-effort, never blocks the reply.
    const eventId = (await recipients.quoteEventId(req.params.id).catch(() => null)) ?? "";
    const name = eventId
      ? ((await recipients.eventName(eventId).catch(() => null)) ?? "your event")
      : "your event";
    const to =
      message.author_side === "client"
        ? recipients.excluding(
            await recipients.quoteVendorEmails(req.params.id).catch(() => [] as string[]),
            a.user.email,
          )
        : recipients.excluding(
            eventId ? await recipients.eventOwnerEmails(eventId).catch(() => [] as string[]) : [],
            a.user.email,
          );
    if (to.length)
      await notify
        .messagePosted(to, name, { quoteId: req.params.id, requestRevision: message.request_revision })
        .catch(() => undefined);
    res.status(201).json({ message });
  }),
);

export default router;
