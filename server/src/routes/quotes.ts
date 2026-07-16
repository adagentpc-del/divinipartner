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
import { autoCloseQuote } from "../db/lifecycle.js";
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
    await quotes.authorizeQuoteAccess(a, req.params.id);
    // Terminal event: accepting a quote wins the deal. Auto-close idempotently
    // (sets 'accepted' + stamps closed_at only on first close) and incrementally
    // refresh the relationship graph for the parties. Re-firing is a no-op.
    await autoCloseQuote(req.params.id);
    const quote = await quotes.getQuote(req.params.id);
    // A decision notifies the vendor org that submitted the quote, not the
    // client who decided. Best-effort.
    const to = recipients.excluding(
      await recipients.quoteVendorEmails(quote.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length) await notify.quoteDecision(to, "accepted", { quoteId: quote.id }).catch(() => undefined);
    res.json({ quote });
  }),
);

/** Decline a quote. */
router.post(
  "/:id/decline",
  h(async (req, res) => {
    const a = await actor(req);
    await quotes.authorizeQuoteAccess(a, req.params.id);
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
    await quotes.authorizeQuoteAccess(a, req.params.id);
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

export default router;
