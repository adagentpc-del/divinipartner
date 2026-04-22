/**
 * Currency + tax inheritance and totals helpers.
 *
 * Inheritance: an order resolves its currency and tax mode from event override
 * (if present) → partner default. Admin can later override at the order level
 * via PATCH; the per-order columns are the source of truth for everything
 * downstream (invoice, email/PDF, reconciliation), so historical records stay
 * stable when partner defaults change.
 *
 * Totals: tax-exclusive adds tax on top of subtotal; tax-inclusive treats the
 * line totals as tax-inclusive and back-derives the embedded tax amount.
 */

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "AED", "CAD", "AUD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const TAX_MODES = ["none", "sales_tax", "vat", "gst", "custom"] as const;
export type TaxMode = (typeof TAX_MODES)[number];

const DEFAULT_TAX_LABELS: Record<TaxMode, string> = {
  none: "",
  sales_tax: "Sales tax",
  vat: "VAT",
  gst: "GST",
  custom: "Tax",
};

export function defaultTaxLabel(mode: TaxMode | string | null | undefined, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  const m = (mode as TaxMode) || "none";
  return DEFAULT_TAX_LABELS[m] ?? "Tax";
}

export interface ResolvedBilling {
  currency: string;
  currencySource: "partner" | "event" | "order";
  taxMode: string;
  taxModeSource: "partner" | "event" | "order";
  taxLabel: string | null;
  taxRate: string | null; // numeric stringified to preserve precision
  taxInclusive: boolean;
}

interface PartialPartner {
  defaultCurrency?: string | null;
  defaultTaxMode?: string | null;
  defaultTaxLabel?: string | null;
  defaultTaxRate?: string | null;
  taxInclusive?: boolean | null;
}

interface PartialEvent {
  currency?: string | null;
  taxMode?: string | null;
  taxLabel?: string | null;
  taxRate?: string | null;
  taxInclusive?: boolean | null;
}

interface PartialOverride {
  currency?: string | null;
  taxMode?: string | null;
  taxLabel?: string | null;
  taxRate?: string | null;
  taxInclusive?: boolean | null;
}

export function resolveOrderBilling(partner: PartialPartner, event?: PartialEvent | null, override?: PartialOverride | null): ResolvedBilling {
  // Currency: order override → event → partner default → USD
  let currency = partner.defaultCurrency || "USD";
  let currencySource: ResolvedBilling["currencySource"] = "partner";
  if (event?.currency) { currency = event.currency; currencySource = "event"; }
  if (override?.currency) { currency = override.currency; currencySource = "order"; }

  // Tax: order override → event → partner default. Each tax field can be
  // overridden independently; presence of *any* override field at a given
  // level promotes taxModeSource so the audit badge is accurate.
  let taxMode = partner.defaultTaxMode || "none";
  let taxLabel: string | null = partner.defaultTaxLabel ?? null;
  let taxRate: string | null = partner.defaultTaxRate ?? null;
  let taxInclusive = !!partner.taxInclusive;
  let taxModeSource: ResolvedBilling["taxModeSource"] = "partner";
  const eventHasTax = !!(event && (event.taxMode || event.taxLabel != null || event.taxRate != null || event.taxInclusive != null));
  if (eventHasTax) {
    if (event!.taxMode) taxMode = event!.taxMode;
    if (event!.taxLabel != null) taxLabel = event!.taxLabel;
    if (event!.taxRate != null) taxRate = event!.taxRate;
    if (event!.taxInclusive != null) taxInclusive = !!event!.taxInclusive;
    taxModeSource = "event";
  }
  const overrideHasTax = !!(override && (override.taxMode || override.taxLabel != null || override.taxRate != null || override.taxInclusive != null));
  if (overrideHasTax) {
    if (override!.taxMode) taxMode = override!.taxMode;
    if (override!.taxLabel != null) taxLabel = override!.taxLabel;
    if (override!.taxRate != null) taxRate = override!.taxRate;
    if (override!.taxInclusive != null) taxInclusive = !!override!.taxInclusive;
    taxModeSource = "order";
  }
  if (!taxLabel || !taxLabel.trim()) taxLabel = defaultTaxLabel(taxMode) || null;

  return { currency, currencySource, taxMode, taxModeSource, taxLabel, taxRate, taxInclusive };
}

export interface OrderTotals {
  subtotal: string;     // pre-tax (or net) amount, decimal string with 2dp
  taxAmount: string;    // computed tax amount, 2dp
  total: string;        // grand total displayed to customer, 2dp
}

interface LineLike { quantity?: number | null; unitPrice?: string | number | null; }

/**
 * Compute totals for an order given line items + tax config.
 *
 * - exclusive: subtotal = Σ(qty × unitPrice); tax = subtotal × rate; total = subtotal + tax.
 * - inclusive: the Σ above is treated as the gross total; subtotal is net,
 *   tax is the embedded portion: tax = total − total/(1+rate).
 */
export function computeOrderTotals(items: LineLike[], taxRatePct: string | number | null | undefined, taxInclusive: boolean): OrderTotals {
  const round = (n: number) => Math.round(n * 100) / 100;
  let gross = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? 0);
    const price = it.unitPrice == null ? 0 : Number(it.unitPrice);
    if (Number.isFinite(qty) && Number.isFinite(price)) gross += qty * price;
  }
  const ratePct = taxRatePct == null ? 0 : Number(taxRatePct);
  const rate = Number.isFinite(ratePct) ? ratePct / 100 : 0;
  if (taxInclusive) {
    const total = round(gross);
    const subtotal = rate > 0 ? round(total / (1 + rate)) : total;
    const taxAmount = round(total - subtotal);
    return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
  }
  const subtotal = round(gross);
  const taxAmount = round(subtotal * rate);
  const total = round(subtotal + taxAmount);
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}

/**
 * Currency-aware money formatter. Falls back to a plain numeric format if
 * the currency code is unknown to Intl.
 */
export function formatMoney(value: string | number | null | undefined, currency: string | null | undefined, opts?: { showCode?: boolean }): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  const cur = (currency || "USD").toUpperCase();
  try {
    const out = new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
    return opts?.showCode ? `${out} ${cur}` : out;
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}
