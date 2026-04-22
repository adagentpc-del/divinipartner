/**
 * Section 21 — Billing-signals demo seed.
 *
 * Inserts (or refreshes) 5 demo `quote_assets` rows that exercise every branch
 * of the billing-signals parser without requiring real PDF uploads:
 *
 *   1. EUR + 20% inclusive VAT  (clean, rules-only)
 *   2. USD + 7% sales tax       (clean, rules-only)
 *   3. AED + 5% VAT, metric     (international, rules-only, overseas cues)
 *   4. Currency ambiguous       ($ + £ both present → manual_review_needed)
 *   5. Already mapped + approved (post-review state)
 *
 * Idempotent: matched by `name` prefix `[demo-billing]`.
 *
 * Run: `pnpm --filter @workspace/scripts run seed:billing-signals`
 */
import { eq, like, and } from "drizzle-orm";
import { db, quoteAssetsTable } from "@workspace/db";

type DemoRow = {
  name: string;
  flags: string[];
  parsed: Partial<typeof quoteAssetsTable.$inferInsert>;
};

const DEMOS: DemoRow[] = [
  {
    name: "[demo-billing] London Pop-ups EUR/VAT quote",
    flags: [],
    parsed: {
      parsedSource: "rules",
      parsedReviewStatus: "pending",
      parsedCurrency: "EUR",
      parsedCurrencyConfidence: "high",
      parsedTaxLabel: "VAT",
      parsedTaxRate: "0.200",
      parsedTaxAmount: "166.67",
      parsedTaxInclusive: true,
      parsedSubtotalAmount: "833.33",
      parsedTotalAmount: "1000.00",
      parsedQuoteReference: "Q-EU-1042",
      parsedSupplierName: "Sign Studio London",
      parsedPaymentTerms: "Net 30",
      parsedDepositAmount: "200.00",
      parsedBillingCountry: "GB",
      parsedBillingFlagsJson: ["currency_high_confidence", "tax_inclusive_detected"],
      parsedMissingFieldsJson: [],
    },
  },
  {
    name: "[demo-billing] Move Miami USD/sales tax quote",
    flags: [],
    parsed: {
      parsedSource: "rules",
      parsedReviewStatus: "pending",
      parsedCurrency: "USD",
      parsedCurrencyConfidence: "high",
      parsedTaxLabel: "FL Sales Tax",
      parsedTaxRate: "0.070",
      parsedTaxAmount: "94.50",
      parsedTaxInclusive: false,
      parsedSubtotalAmount: "1350.00",
      parsedTotalAmount: "1444.50",
      parsedQuoteReference: "MM-2026-0419",
      parsedSupplierName: "Sun Coast Print",
      parsedPaymentTerms: "Due on receipt",
      parsedBillingCountry: "US",
      parsedBillingFlagsJson: ["currency_high_confidence"],
      parsedMissingFieldsJson: ["deposit"],
    },
  },
  {
    name: "[demo-billing] Dubai AED/VAT international quote",
    flags: [],
    parsed: {
      parsedSource: "rules",
      parsedReviewStatus: "pending",
      parsedCurrency: "AED",
      parsedCurrencyConfidence: "high",
      parsedTaxLabel: "VAT",
      parsedTaxRate: "0.050",
      parsedTaxAmount: "262.50",
      parsedTaxInclusive: false,
      parsedSubtotalAmount: "5250.00",
      parsedTotalAmount: "5512.50",
      parsedQuoteReference: "AE-Q-883",
      parsedSupplierName: "Gulf Signage LLC",
      parsedPaymentTerms: "50% deposit, balance on delivery",
      parsedDepositAmount: "2756.25",
      parsedBillingCountry: "AE",
      parsedIncoterm: "DAP",
      parsedBillingNotes: "Overseas: dimensions in metric (mm); incoterm DAP detected.",
      parsedBillingFlagsJson: ["currency_high_confidence", "international_billing", "metric_units", "incoterm_detected"],
      parsedMissingFieldsJson: [],
    },
  },
  {
    name: "[demo-billing] Ambiguous $/£ multi-currency quote",
    flags: [],
    parsed: {
      parsedSource: "ai",
      parsedReviewStatus: "pending",
      parsedCurrency: "USD",
      parsedCurrencyConfidence: "low",
      parsedTaxLabel: null,
      parsedTaxRate: null,
      parsedTaxAmount: null,
      parsedTaxInclusive: null,
      parsedSubtotalAmount: "750.00",
      parsedTotalAmount: "750.00",
      parsedQuoteReference: "AMB-552",
      parsedBillingCountry: null,
      parsedBillingNotes: "Both $ and £ symbols appear in the document. AI fallback picked USD with low confidence — please verify before applying.",
      parsedBillingFlagsJson: ["currency_ambiguous", "manual_review_needed", "tax_not_found"],
      parsedMissingFieldsJson: ["tax_label", "tax_rate", "billing_country"],
      parsedAiTokensInput: 820,
      parsedAiTokensOutput: 64,
    },
  },
  {
    name: "[demo-billing] Approved EUR quote (already reviewed)",
    flags: [],
    parsed: {
      parsedSource: "rules",
      parsedReviewStatus: "approved",
      parsedCurrency: "EUR",
      parsedCurrencyConfidence: "high",
      parsedTaxLabel: "VAT",
      parsedTaxRate: "0.200",
      parsedTaxAmount: "80.00",
      parsedTaxInclusive: false,
      parsedSubtotalAmount: "400.00",
      parsedTotalAmount: "480.00",
      parsedQuoteReference: "Q-EU-998",
      parsedSupplierName: "Berlin Display Co.",
      parsedPaymentTerms: "Net 14",
      parsedBillingCountry: "DE",
      parsedBillingFlagsJson: ["currency_high_confidence"],
      parsedMissingFieldsJson: [],
    },
  },
];

async function main() {
  console.log("Seeding billing-signals demos…");
  for (const d of DEMOS) {
    const existing = await db.select().from(quoteAssetsTable).where(eq(quoteAssetsTable.name, d.name));
    const baseValues = {
      name: d.name,
      fileUrl: "/demo/billing-signals-placeholder.pdf",
      fileType: "application/pdf",
      sourceType: "quote",
      processingStatus: d.parsed.parsedReviewStatus === "approved" ? "approved" : "needs_review",
      attachableType: "product",
      attachableId: 0,
      parsedAt: new Date(),
      ...d.parsed,
    } as any;
    if (existing.length) {
      await db.update(quoteAssetsTable).set(baseValues).where(eq(quoteAssetsTable.id, existing[0].id));
      console.log(`  · updated #${existing[0].id}  ${d.name}`);
    } else {
      const [row] = await db.insert(quoteAssetsTable).values(baseValues).returning();
      console.log(`  · inserted #${row.id}  ${d.name}`);
    }
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
