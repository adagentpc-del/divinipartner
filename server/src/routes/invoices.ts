/**
 * Invoice routes (blueprint section 20). Mounted at /api/invoices.
 *
 *   GET    /api/invoices               list (filter ?event_id, ?status)
 *   POST   /api/invoices               create a standardized invoice
 *   GET    /api/invoices/meta          statuses + labels (for the UI)
 *   GET    /api/invoices/:id           single standardized invoice
 *   PATCH  /api/invoices/:id/status    advance invoice status
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  createInvoice,
  listInvoices,
  listEventInvoices,
  getInvoiceById,
  getInvoicePartiesById,
  updateInvoiceStatus,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "../db/invoices.js";
import { getEvent } from "../db/events.js";
import { renderInvoicePdf } from "../lib/pdf.js";
import { notify } from "../lib/notify.js";
import { q1 } from "../pool.js";

/**
 * Best contact for an invoice: the client user's email when a client_id is set,
 * otherwise the acting user's email. Resolution is best-effort and never throws.
 */
async function invoiceRecipient(clientId: string | null, actorEmail: string | null): Promise<string | null> {
  if (clientId) {
    const row = await q1<{ email: string | null }>(`select email from users where id = $1`, [clientId]).catch(
      () => null,
    );
    if (row?.email) return row.email;
  }
  return actorEmail;
}

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get("/meta", (_req, res) => {
  res.json({ statuses: INVOICE_STATUSES, labels: INVOICE_STATUS_LABELS });
});

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const eventId = typeof req.query.event_id === "string" ? req.query.event_id : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (eventId) {
      // Scoped to one event: any actor who can see the event (owner, planner,
      // an attached vendor, etc, via getEvent's own authorization) sees every
      // invoice raised against it, not just the ones their own org issued --
      // otherwise an event owner asking for their own event's invoices (this
      // is exactly what InvoicesTab.tsx does) would always get back an empty
      // list, since they never issue invoices on their own event.
      await getEvent(actor, eventId);
      const rows = await listEventInvoices(eventId, status);
      return res.json({ invoices: rows });
    }
    if (!actor.org) return res.json({ invoices: [] });
    const rows = await listInvoices(actor.org.id, { status });
    res.json({ invoices: rows });
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
    const row = await createInvoice(actor.org.id, actor.org.name, actor.org.tier, actor.user.id, {
      event_id: b.event_id ?? null,
      vendor_id: b.vendor_id ?? null,
      venue_id: b.venue_id ?? null,
      client_id: b.client_id ?? null,
      quote_id: b.quote_id ?? null,
      line_items: Array.isArray(b.line_items) ? b.line_items : [],
      taxes: Number(b.taxes) || 0,
      processing_fee: Number(b.processing_fee) || 0,
      deposit_due: Number(b.deposit_due) || 0,
      due_date: b.due_date ?? null,
      terms: b.terms ?? null,
      notes: b.notes ?? null,
      payment_link: b.payment_link ?? null,
      currency: b.currency ?? "USD",
      status: b.status as InvoiceStatus | undefined,
    });
    // Invoice issued notification. Best-effort: never block the request.
    const recipient = await invoiceRecipient(row.client_id, actor.user.email).catch(() => actor.user.email);
    if (recipient) {
      await notify
        .invoiceSent(recipient, row.invoice_number ?? row.id.slice(0, 8))
        .catch(() => undefined);
    }
    res.status(201).json({ invoice: row });
  }),
);

/**
 * True when the acting org is a party to the invoice: the issuer, or the org
 * behind the vendor/venue/client/event it names (same parties payments.ts
 * authorizes to pay it, via getInvoicePartiesById). Before this, GET /:id and
 * GET /:id/pdf were issuer-only (getInvoice scopes by organization_id), so
 * the client who actually owes the invoice -- the whole reason a "Pay"
 * button exists on this page -- got a 404 opening their own invoice.
 */
async function authorizedInvoiceParty(actorOrgId: string, invoiceId: string): Promise<boolean> {
  const parties = await getInvoicePartiesById(invoiceId);
  return !!parties && parties.party_org_ids.includes(actorOrgId);
}

router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    if (!(await authorizedInvoiceParty(actor.org.id, req.params.id))) {
      return res.status(404).json({ error: "not found" });
    }
    const row = await getInvoiceById(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ invoice: row });
  }),
);

/** Branded, downloadable standardized invoice PDF. */
router.get(
  "/:id/pdf",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    if (!(await authorizedInvoiceParty(actor.org.id, req.params.id))) {
      return res.status(404).json({ error: "not found" });
    }
    const row = await getInvoiceById(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    const pdf = await renderInvoicePdf(row);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${row.invoice_number ?? row.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  }),
);

router.patch(
  "/:id/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    const status = (req.body ?? {}).status as InvoiceStatus;
    if (!status) return res.status(400).json({ error: "status required" });
    try {
      const row = await updateInvoiceStatus(actor.org.id, req.params.id, status);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json({ invoice: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }),
);

export default router;
