/**
 * Invoices data-access (blueprint section 20).
 *
 * The standardized Divini invoice is the canonical money artifact: it carries
 * the Divini brand plus the active user's organization brand (co-branding),
 * the vendor/client/event/venue, an invoice number, line items, taxes + fees,
 * the platform fee (computed from the org tier), processing fee, deposit status,
 * balance due, status, due date, terms, notes, and a payment-link placeholder.
 *
 * Platform-fee rate comes from db.TIERS[tier].feeRate. NO processor integration.
 */
import { q, q1, pool } from "../pool.js";
import { TIERS, type Tier } from "../db.js";
import { PRICING_V2, PLATFORM_FEE_RATE_V2 } from "../config.js";
import { emitWebhookEvent } from "../lib/webhooks.js";

export const INVOICE_STATUSES = [
  "draft",
  "uploaded",
  "standardized",
  "sent",
  "viewed",
  "deposit_paid",
  "partially_paid",
  "paid",
  "overdue",
  "disputed",
  "refunded",
  "closed",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  standardized: "Standardized",
  sent: "Sent",
  viewed: "Viewed",
  deposit_paid: "Deposit paid",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  disputed: "Disputed",
  refunded: "Refunded",
  closed: "Closed",
};

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  event_id: string | null;
  vendor_id: string | null;
  venue_id: string | null;
  client_id: string | null;
  organization_id: string | null;
  quote_id: string | null;
  line_items: InvoiceLineItem[] | null;
  subtotal: string | null;
  taxes: string | null;
  platform_fee: string | null;
  platform_fee_rate: string | null;
  processing_fee: string | null;
  total: string | null;
  deposit_due: string | null;
  deposit_paid: string | null;
  deposit_status: string | null;
  balance_due: string | null;
  due_date: string | null;
  status: string | null;
  terms: string | null;
  notes: string | null;
  payment_link: string | null;
  brand: Record<string, unknown> | null;
  currency: string | null;
  created_by: string | null;
  created_at: string;
}

/** The co-branding block stamped onto every standardized invoice. */
export function buildBrand(orgName: string | null, orgTier: string | null): Record<string, unknown> {
  return {
    platform: { name: "Divini Partners", by: "by Divini Group", logo: "D" },
    partner: { name: orgName ?? "Partner", tier: orgTier ?? null },
  };
}

function feeRateForTier(tier: string | null | undefined): number {
  if (tier && (TIERS as Record<string, { feeRate: number }>)[tier]) {
    return (TIERS as Record<string, { feeRate: number }>)[tier].feeRate;
  }
  return TIERS.free_partner.feeRate;
}

function sum(items: InvoiceLineItem[] | undefined): number {
  if (!items?.length) return 0;
  return Math.round(items.reduce((acc, li) => acc + (Number(li.amount) || 0), 0) * 100) / 100;
}

/** Generate a human invoice number, e.g. DP-2026-000123. */
function nextInvoiceNumber(seq: number): string {
  const year = new Date().getFullYear();
  return `DP-${year}-${String(seq).padStart(6, "0")}`;
}

export interface CreateInvoiceInput {
  event_id?: string | null;
  vendor_id?: string | null;
  venue_id?: string | null;
  client_id?: string | null;
  quote_id?: string | null;
  line_items?: InvoiceLineItem[];
  taxes?: number;
  processing_fee?: number;
  deposit_due?: number;
  due_date?: string | null;
  terms?: string | null;
  notes?: string | null;
  payment_link?: string | null;
  currency?: string;
  status?: InvoiceStatus;
}

/**
 * Build the standardized invoice payload + persist it. Platform fee is computed
 * from the org tier feeRate; totals + balance are derived.
 */
export async function createInvoice(
  orgId: string,
  orgName: string | null,
  orgTier: string | null,
  createdBy: string | null,
  input: CreateInvoiceInput,
): Promise<InvoiceRow> {
  const lineItems = input.line_items ?? [];
  const subtotal = sum(lineItems);
  const taxes = Math.round((Number(input.taxes) || 0) * 100) / 100;
  // Pricing V2: flat 5% platform fee ADDED ON TOP of the vendor subtotal. The
  // vendor receives the full subtotal; the client total = subtotal + taxes +
  // platform fee. No processing fee is carved out of the vendor under V2 (they
  // receive their full quote), so processing_fee is forced to 0. Legacy keeps
  // the tier-rate fee and any caller-supplied processing fee, unchanged.
  const feeRate = PRICING_V2 ? PLATFORM_FEE_RATE_V2 : feeRateForTier(orgTier);
  const platformFee = Math.round(subtotal * feeRate * 100) / 100;
  const processingFee = PRICING_V2 ? 0 : Math.round((Number(input.processing_fee) || 0) * 100) / 100;
  const total = Math.round((subtotal + taxes + platformFee + processingFee) * 100) / 100;
  const depositDue = Math.round((Number(input.deposit_due) || 0) * 100) / 100;
  const balanceDue = total;
  const status: InvoiceStatus = input.status ?? "standardized";
  const brand = buildBrand(orgName, orgTier);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const cnt = (await client.query<{ c: string }>(`select count(*)::int as c from invoices`)).rows[0];
    const invoiceNumber = nextInvoiceNumber((Number(cnt?.c) || 0) + 1);
    const row = (
      await client.query<InvoiceRow>(
        `insert into invoices
           (invoice_number, event_id, vendor_id, venue_id, client_id, organization_id, quote_id,
            line_items, subtotal, taxes, platform_fee, platform_fee_rate, processing_fee, total,
            deposit_due, deposit_paid, deposit_status, balance_due, due_date, status, terms, notes,
            payment_link, brand, currency, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,0,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25)
         returning *`,
        [
          invoiceNumber,
          input.event_id ?? null,
          input.vendor_id ?? null,
          input.venue_id ?? null,
          input.client_id ?? null,
          orgId,
          input.quote_id ?? null,
          JSON.stringify(lineItems),
          subtotal,
          taxes,
          platformFee,
          feeRate,
          processingFee,
          total,
          depositDue,
          depositDue > 0 ? "requested" : "none",
          balanceDue,
          input.due_date ?? null,
          status,
          input.terms ?? null,
          input.notes ?? null,
          input.payment_link ?? null,
          JSON.stringify(brand),
          input.currency ?? "USD",
          createdBy,
        ],
      )
    ).rows[0];
    await client.query("commit");
    return row;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** List invoices for an organization (as vendor org or owning org). */
export async function listInvoices(orgId: string, filters?: { event_id?: string; status?: string }): Promise<InvoiceRow[]> {
  const where: string[] = [`organization_id = $1`];
  const params: unknown[] = [orgId];
  if (filters?.event_id) {
    params.push(filters.event_id);
    where.push(`event_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  return q<InvoiceRow>(
    `select * from invoices where ${where.join(" and ")} order by created_at desc`,
    params,
  );
}

/**
 * Every invoice raised against a single event, regardless of which org issued
 * it. The route calling this MUST authorize the actor against the event
 * first (events.ts::getEvent throws if the actor cannot see it) -- unscoped
 * on purpose, same convention as invoiceOrgTier/getInvoicePartiesById above.
 *
 * Before this existed, GET /invoices only ever filtered by the CALLER's own
 * organization_id (the issuing org), so an event owner asking for
 * ?event_id=... got back invoices THEY issued, never the vendor-issued
 * invoices raised against their own event -- which is exactly what
 * InvoicesTab.tsx (the event workspace's Invoices tab) asks for and renders,
 * so the tab was silently empty for every event owner.
 */
export async function listEventInvoices(eventId: string, status?: string): Promise<InvoiceRow[]> {
  const where: string[] = [`event_id = $1`];
  const params: unknown[] = [eventId];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  return q<InvoiceRow>(
    `select * from invoices where ${where.join(" and ")} order by created_at desc`,
    params,
  );
}

export async function getInvoice(orgId: string, id: string): Promise<InvoiceRow | null> {
  return q1<InvoiceRow>(`select * from invoices where id = $1 and organization_id = $2`, [id, orgId]);
}

/**
 * Fetch an invoice by id alone, with no org scoping.
 *
 * SECURITY: unscoped on purpose, same convention as applyPaymentToInvoice
 * below. The caller MUST authorize the acting org as a party to the invoice
 * (see getInvoicePartiesById) BEFORE calling this -- it exists so a party who
 * is NOT the issuer (the client who owes it, or the vendor/venue it names)
 * can still view it. getInvoice() above stays issuer-only for callers that
 * intentionally want that narrower scope.
 */
export async function getInvoiceById(id: string): Promise<InvoiceRow | null> {
  return q1<InvoiceRow>(`select * from invoices where id = $1`, [id]);
}

const ALLOWED: ReadonlySet<InvoiceStatus> = new Set(INVOICE_STATUSES);

export async function updateInvoiceStatus(
  orgId: string,
  id: string,
  status: InvoiceStatus,
): Promise<InvoiceRow | null> {
  if (!ALLOWED.has(status)) throw new Error(`invalid invoice status: ${status}`);
  const before = await q1<{ status: string | null }>(
    `select status from invoices where id = $1 and organization_id = $2`,
    [id, orgId],
  );
  const stamp =
    status === "sent"
      ? ", sent_at = now()"
      : status === "viewed"
        ? ", viewed_at = now()"
        : status === "paid"
          ? ", paid_at = now()"
          : "";
  const row = await q1<InvoiceRow>(
    `update invoices set status = $3, updated_at = now()${stamp}
       where id = $1 and organization_id = $2 returning *`,
    [id, orgId, status],
  );
  if (row && status === "paid" && before?.status !== "paid") {
    void emitWebhookEvent(orgId, "invoice.paid", {
      invoice_id: row.id,
      event_id: row.event_id,
      total: row.total,
    });
  }
  return row;
}

/**
 * Resolve the set of organization ids that are PARTIES to an invoice, for an
 * IDOR authorization gate before any pay/capture against it.
 *
 * Schema note: on `invoices`, only `organization_id` is itself an org id (the
 * issuer). `vendor_id` -> vendors, `venue_id` -> venues, and `client_id` ->
 * users; each of those rows carries its own `organization_id`. We resolve those
 * to org ids so the acting org may pay an invoice when it is the issuer OR the
 * org behind the vendor/venue/client party. `client_org_id` is also surfaced
 * separately so a caller can apply the conservative fallback (issuer OR client).
 */
export async function getInvoicePartiesById(invoiceId: string): Promise<{
  organization_id: string | null;
  vendor_org_id: string | null;
  venue_org_id: string | null;
  client_org_id: string | null;
  party_org_ids: string[];
} | null> {
  const row = await q1<{
    organization_id: string | null;
    vendor_org_id: string | null;
    venue_org_id: string | null;
    client_org_id: string | null;
    event_client_org_id: string | null;
    event_planner_org_id: string | null;
  }>(
    `select i.organization_id,
            ve.organization_id as vendor_org_id,
            vn.organization_id as venue_org_id,
            cu.organization_id as client_org_id,
            ecu.organization_id as event_client_org_id,
            epu.organization_id as event_planner_org_id
       from invoices i
       left join vendors ve on ve.id = i.vendor_id
       left join venues vn on vn.id = i.venue_id
       left join users cu on cu.id = i.client_id
       left join events ev on ev.id = i.event_id
       left join users ecu on ecu.id = ev.client_id
       left join users epu on epu.id = ev.planner_id
      where i.id = $1`,
    [invoiceId],
  );
  if (!row) return null;
  // A vendor issuing an invoice against an event does not always know (or
  // pass) the client's user id -- fall back to the event's own client/planner
  // org so the event owner always has a real, authorized path to pay an
  // invoice raised against their own event, not just whoever the invoice's
  // client_id happened to name explicitly.
  const party_org_ids = [
    row.organization_id,
    row.vendor_org_id,
    row.venue_org_id,
    row.client_org_id,
    row.event_client_org_id,
    row.event_planner_org_id,
  ].filter((x): x is string => !!x);
  return {
    organization_id: row.organization_id,
    vendor_org_id: row.vendor_org_id,
    venue_org_id: row.venue_org_id,
    client_org_id: row.client_org_id,
    party_org_ids,
  };
}

/**
 * Apply a recorded payment to the invoice: reduce balance, advance status.
 *
 * SECURITY: this is intentionally unscoped (it loads the invoice by id alone).
 * The caller MUST authorize that the acting org is a party to the invoice
 * (see getInvoicePartiesById) BEFORE invoking this. Do not call it on an
 * invoice the actor has not been authorized against.
 */
export async function applyPaymentToInvoice(invoiceId: string, amount: number): Promise<InvoiceRow | null> {
  const inv = await q1<InvoiceRow>(`select * from invoices where id = $1`, [invoiceId]);
  if (!inv) return null;
  const total = Number(inv.total) || 0;
  const alreadyPaid = Number(inv.deposit_paid) || 0;
  const newPaid = Math.round((alreadyPaid + (Number(amount) || 0)) * 100) / 100;
  const balance = Math.max(0, Math.round((total - newPaid) * 100) / 100);
  let status: InvoiceStatus = inv.status as InvoiceStatus;
  if (balance <= 0) status = "paid";
  else if (newPaid > 0) status = "partially_paid";
  const row = await q1<InvoiceRow>(
    // $3 is cast explicitly on both uses: reusing an untyped placeholder in
    // an assignment context (balance_due = $3) and a comparison context
    // (case when $3 <= 0) makes Postgres's extended-protocol type inference
    // fail outright with "inconsistent types deduced for parameter $3"
    // (reproduced directly against pg -- not context-dependent, always
    // fails), so every 502 on this endpoint was this query, every time.
    `update invoices set deposit_paid = $2, balance_due = $3::numeric, status = $4, updated_at = now(),
        paid_at = case when $3::numeric <= 0 then now() else paid_at end
       where id = $1 returning *`,
    [invoiceId, newPaid, balance, status],
  );
  if (row && status === "paid" && inv.status !== "paid") {
    void emitWebhookEvent(row.organization_id, "invoice.paid", {
      invoice_id: row.id,
      event_id: row.event_id,
      total: row.total,
    });
  }
  return row;
}

export const __test = { sum, feeRateForTier, nextInvoiceNumber };
