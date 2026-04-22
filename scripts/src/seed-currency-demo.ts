/**
 * Currency / VAT demo seed.
 * - Updates Move Miami (existing partner #1 expected) → USD + sales_tax 7% exclusive.
 * - Upserts "London Pop-ups" partner → EUR + VAT 20% inclusive, billingCountry GB.
 * - Adds one demo order on each partner so the breakdown UI/PDF/email path is
 *   exercised end-to-end without requiring the admin to click through the wizard.
 *
 * Idempotent: re-running updates the partners and skips creating duplicate
 * demo orders (matched by orderNumber prefix).
 */
import { eq, and, like } from "drizzle-orm";
import { db, partnersTable, ordersTable, orderItemsTable } from "@workspace/db";

async function upsertPartner(slug: string, patch: Record<string, any>) {
  const existing = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
  if (existing.length) {
    await db.update(partnersTable).set(patch).where(eq(partnersTable.slug, slug));
    return existing[0];
  }
  const [created] = await db.insert(partnersTable).values({ slug, ...patch } as any).returning();
  return created;
}

function computeTotals(items: { quantity: number; unitPrice: number }[], taxRate: number, inclusive: boolean) {
  const gross = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const r = taxRate / 100;
  if (!r) return { subtotal: gross.toFixed(2), taxAmount: "0.00", total: gross.toFixed(2) };
  if (inclusive) {
    const subtotal = gross / (1 + r);
    return { subtotal: subtotal.toFixed(2), taxAmount: (gross - subtotal).toFixed(2), total: gross.toFixed(2) };
  }
  const taxAmount = gross * r;
  return { subtotal: gross.toFixed(2), taxAmount: taxAmount.toFixed(2), total: (gross + taxAmount).toFixed(2) };
}

async function ensureDemoOrder(opts: {
  partnerId: number;
  orderNumberPrefix: string;
  currency: string;
  taxMode: string;
  taxLabel: string;
  taxRate: string;
  taxInclusive: boolean;
  contactName: string;
  contactEmail: string;
  items: { description: string; quantity: number; unitPrice: number }[];
}) {
  const found = await db.select().from(ordersTable).where(and(eq(ordersTable.partnerId, opts.partnerId), like(ordersTable.orderNumber, `${opts.orderNumberPrefix}%`)));
  if (found.length) {
    console.log(`  · order ${found[0].orderNumber} already present, skipping`);
    return;
  }
  const totals = computeTotals(opts.items.map(i => ({ quantity: i.quantity, unitPrice: i.unitPrice })), Number(opts.taxRate), opts.taxInclusive);
  const orderNumber = `${opts.orderNumberPrefix}${Date.now().toString().slice(-5)}`;
  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    partnerId: opts.partnerId,
    status: "new",
    paymentStatus: "not_charged",
    contactName: opts.contactName,
    contactEmail: opts.contactEmail,
    currency: opts.currency,
    currencySource: "partner",
    taxMode: opts.taxMode,
    taxLabel: opts.taxLabel,
    taxRate: opts.taxRate,
    taxInclusive: opts.taxInclusive,
    taxModeSource: "partner",
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    totalEstimate: totals.total,
  } as any).returning();
  for (const it of opts.items) {
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      itemType: "custom",
      name: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice.toFixed(2),
    } as any);
  }
  console.log(`  · created order ${orderNumber} (${opts.currency} ${totals.total}, tax ${totals.taxAmount})`);
}

async function main() {
  console.log("Updating Move Miami (USD / sales_tax 7% exclusive)…");
  const moveMiami = await upsertPartner("move-miami", {
    companyName: "Move Miami",
    contactName: "Move Miami Events",
    contactEmail: "events@movemiami.com",
    defaultCurrency: "USD",
    defaultTaxMode: "sales_tax",
    defaultTaxLabel: "FL Sales Tax",
    defaultTaxRate: "7.000",
    taxInclusive: false,
    billingCountry: "US",
  });

  console.log("Upserting London Pop-ups (EUR / VAT 20% inclusive)…");
  const london = await upsertPartner("london-pop-ups", {
    companyName: "London Pop-ups",
    contactName: "Sasha Whitfield",
    contactEmail: "sasha@londonpopups.co.uk",
    introHeadline: "Welcome to the London Pop-ups Partner Portal",
    defaultCurrency: "EUR",
    defaultTaxMode: "vat",
    defaultTaxLabel: "VAT",
    defaultTaxRate: "20.000",
    taxInclusive: true,
    billingCountry: "GB",
    invoiceDisplayNotes: "VAT registered in the United Kingdom. All EUR prices are inclusive of 20% VAT.",
  });

  if (moveMiami) {
    console.log("Demo order for Move Miami:");
    await ensureDemoOrder({
      partnerId: moveMiami.id,
      orderNumberPrefix: "MM-CUR-",
      currency: "USD",
      taxMode: "sales_tax",
      taxLabel: "FL Sales Tax",
      taxRate: "7.000",
      taxInclusive: false,
      contactName: "Demo Contact",
      contactEmail: "demo@movemiami.com",
      items: [
        { description: "Step and repeat backdrop", quantity: 1, unitPrice: 950 },
        { description: "Pull up banner", quantity: 2, unitPrice: 175 },
      ],
    });
  }

  if (london) {
    console.log("Demo order for London Pop-ups:");
    await ensureDemoOrder({
      partnerId: london.id,
      orderNumberPrefix: "LP-CUR-",
      currency: "EUR",
      taxMode: "vat",
      taxLabel: "VAT",
      taxRate: "20.000",
      taxInclusive: true,
      contactName: "Demo Contact",
      contactEmail: "demo@londonpopups.co.uk",
      items: [
        { description: "Branded pop-up shop fit-out", quantity: 1, unitPrice: 4800 },
        { description: "Window vinyl graphics", quantity: 4, unitPrice: 220 },
      ],
    });
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
