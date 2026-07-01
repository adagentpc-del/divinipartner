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

export async function getInvoice(orgId: string, id: string): Promise<InvoiceRow | null> {
  return q1<InvoiceRow>(`select * from invoices where id = $1 and organization_id = $2`, [id, orgId]);
}

const ALLOWED: ReadonlySet<InvoiceStatus> = new Set(INVOICE_STATUSES);

export async function updateInvoiceStatus(
  orgId: string,
  id: string,
  status: InvoiceStatus,
): Promise<InvoiceRow | null> {
  if (!ALLOWED.has(status)) throw new Error(`invalid invoice status: ${status}`);
  const stamp =
    status === "sent"
      ? ", sent_at = now()"
      : status === "viewed"
        ? ", viewed_at = now()"
        : status === "paid"
          ? ", paid_at = now()"
          : "";
  return q1<InvoiceRow>(
    `update invoices set status = $3, updated_at = now()${stamp}
       where id = $1 and organization_id = $2 returning *`,
    [id, orgId, status],
  );
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
  }>(
    `select i.organization_id,
            ve.organization_id as vendor_org_id,
            vn.organization_id as venue_org_id,
            cu.organization_id as client_org_id
       from invoices i
       left join vendors ve on ve.id = i.vendor_id
       left join venues vn on vn.id = i.venue_id
       left join users cu on cu.id = i.client_id
      where i.id = $1`,
    [invoiceId],
  );
  if (!row) return null;
  const party_org_ids = [
    row.organization_id,
    row.vendor_org_id,
    row.venue_org_id,
    row.client_org_id,
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
  return q1<InvoiceRow>(
    `update invoices set deposit_paid = $2, balance_due = $3, status = $4, updated_at = now(),
        paid_at = case when $3 <= 0 then now() else paid_at end
       where id = $1 returning *`,
    [invoiceId, newPaid, balance, status],
  );
}

export const __test = { sum, feeRateForTier, nextInvoiceNumber };
