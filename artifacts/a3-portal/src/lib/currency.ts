/**
 * Browser-side currency + tax helpers (mirror of api-server/src/lib/billing.ts).
 * Kept separate to avoid bundling Node-only code; the canonical math lives on
 * the server.
 */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "AED", "CAD", "AUD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const TAX_MODES = ["none", "sales_tax", "vat", "gst", "custom"] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  none: "None",
  sales_tax: "Sales tax",
  vat: "VAT",
  gst: "GST",
  custom: "Custom",
};

export function formatMoney(value: string | number | null | undefined, currency: string | null | undefined = "USD", opts?: { showCode?: boolean }): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  const cur = (currency || "USD").toUpperCase();
  try {
    const out = new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
    return opts?.showCode ? `${out} ${cur}` : out;
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}
