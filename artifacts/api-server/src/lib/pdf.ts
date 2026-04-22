import PDFDocument from "pdfkit";
import { logger } from "./logger";
import { resolveBrandColors, type OrderEmailContext } from "./email";

/**
 * Branded PDF order summary generator.
 *
 * - Pure function of the structured order context (no AI prose).
 * - Three audiences: customer (concise, reassuring), internal (full ops detail),
 *   finance (billing-focused header reusing the internal layout).
 * - Logo is optional — fetched lazily; failures fall back to a typographic
 *   header so the PDF always renders.
 * - Returns an in-memory Buffer so the email layer can attach without disk I/O.
 */

export type PdfAudience = "customer" | "internal" | "finance";

function safe(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s);
}

function fmtCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return safe(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return safe(value); }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

async function fetchLogoBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    // pdfkit only accepts JPEG/PNG; SVG/webp would need rasterization.
    if (!/\.(png|jpg|jpeg)(\?.*)?$/i.test(url)) {
      // Try anyway — many CDN URLs lack extensions but still serve PNG/JPEG.
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct && !/png|jpeg|jpg/i.test(ct)) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    logger.warn({ err, url }, "Failed to fetch partner logo for PDF");
    return null;
  }
}

function audienceLabel(audience: PdfAudience): string {
  if (audience === "customer") return "Order Summary";
  if (audience === "finance") return "Finance — Order Summary";
  return "Internal — Order Summary";
}

export interface GeneratedPdf {
  filename: string;
  buffer: Buffer;
  audience: PdfAudience;
}

export async function generateOrderSummaryPdf(ctx: OrderEmailContext, audience: PdfAudience): Promise<GeneratedPdf> {
  const { partner, theme, order, items, event, venue } = ctx;
  const colors = resolveBrandColors(theme);
  const primary = hexToRgb(colors.primary);
  const muted = hexToRgb(colors.muted || "#64748b");
  const text = hexToRgb(colors.text || "#0f172a");
  const accent = hexToRgb(colors.accent || "#f59e0b");
  const showPricing = audience !== "customer" && !!partner.pricingDisplayEnabled
    || audience === "internal" || audience === "finance";

  const logoBuf = await fetchLogoBuffer(partner.logoUrl);

  // Buffered = true lets us await `end` and resolve a Buffer cleanly.
  const doc = new PDFDocument({ size: "LETTER", margin: 48, bufferPages: true, info: {
    Title: `${partner.companyName} — ${order.orderNumber}`,
    Author: partner.companyName,
    Subject: audienceLabel(audience),
    Creator: "A3 Partner Portal",
  }});

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ----- Header band -------------------------------------------------------
  const headerH = 110;
  doc.save();
  doc.rect(0, 0, doc.page.width, headerH).fill(primary);
  if (logoBuf) {
    try {
      const logoMaxW = 160;
      const logoMaxH = 60;
      // pdfkit fit preserves aspect ratio.
      doc.image(logoBuf, 48, (headerH - logoMaxH) / 2, { fit: [logoMaxW, logoMaxH], valign: "center" });
    } catch (err) {
      logger.warn({ err }, "Logo image rejected by pdfkit, falling back to text");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(safe(partner.companyName), 48, 44);
    }
  } else {
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(safe(partner.companyName), 48, 42);
  }
  // Right-aligned audience badge + reference
  doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(audienceLabel(audience), 0, 38, { align: "right", width: doc.page.width - 48 });
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(safe(order.orderNumber), 0, 56, { align: "right", width: doc.page.width - 48 });
  doc.fillColor("#ffffff").font("Helvetica").fontSize(9).text(`Submitted ${fmtDate(order.createdAt)}`, 0, 76, { align: "right", width: doc.page.width - 48 });
  doc.restore();

  // ----- Body --------------------------------------------------------------
  doc.y = headerH + 24;
  doc.x = 48;

  const sectionTitle = (label: string) => {
    doc.moveDown(0.3);
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(9).text(label.toUpperCase(), { characterSpacing: 1 });
    doc.moveTo(48, doc.y + 2).lineTo(doc.page.width - 48, doc.y + 2).strokeColor(`#${primary.map(n => n.toString(16).padStart(2,"0")).join("")}26`).lineWidth(0.5).stroke();
    doc.moveDown(0.3);
  };

  const kv = (label: string, value: string) => {
    if (!value) return;
    const startY = doc.y;
    doc.fillColor(muted).font("Helvetica").fontSize(9).text(label, 48, startY, { width: 110 });
    doc.fillColor(text).font("Helvetica").fontSize(10).text(value, 158, startY, { width: doc.page.width - 158 - 48 });
    doc.moveDown(0.3);
  };

  // Greeting / lead block (audience-specific tone)
  if (audience === "customer") {
    doc.fillColor(text).font("Helvetica-Bold").fontSize(18).text(`Thanks${order.contactName ? `, ${safe(order.contactName.split(" ")[0])}` : ""}!`, 48);
    doc.moveDown(0.3);
    doc.fillColor(muted).font("Helvetica").fontSize(11).text("We received your order. This summary is for your records — our team will follow up with confirmation, artwork details, and timing.", { width: doc.page.width - 96 });
  } else if (audience === "finance") {
    doc.fillColor(text).font("Helvetica-Bold").fontSize(16).text("Order received — finance summary", 48);
    doc.moveDown(0.3);
    doc.fillColor(muted).font("Helvetica").fontSize(10).text("Billing-focused snapshot. Refer to the operational summary for fulfillment details.", { width: doc.page.width - 96 });
  } else {
    doc.fillColor(text).font("Helvetica-Bold").fontSize(16).text("New order — operational summary", 48);
    doc.moveDown(0.3);
    doc.fillColor(muted).font("Helvetica").fontSize(10).text("Action required. Use this summary to assign suppliers, confirm artwork, and schedule delivery.", { width: doc.page.width - 96 });
  }

  // Customer / contact block
  sectionTitle(audience === "customer" ? "Order details" : "Customer");
  if (audience === "customer") {
    kv("Reference", safe(order.orderNumber));
    kv("Submitted", fmtDate(order.createdAt));
  } else {
    kv("Contact", `${safe(order.contactName)}${order.companyName ? ` · ${safe(order.companyName)}` : ""}`);
    kv("Email", safe(order.contactEmail));
    if (order.contactPhone) kv("Phone", safe(order.contactPhone));
  }

  if (event || venue) {
    sectionTitle("Event & Venue");
    if (event) kv("Event", `${safe(event.name)}${event.eventDate ? ` · ${fmtDate(event.eventDate as any)}` : ""}`);
    if (venue) kv("Venue", `${safe(venue.name)}${venue.city ? `, ${safe(venue.city)}` : ""}${venue.country ? `, ${safe(venue.country)}` : ""}`);
  }

  // Shipping / fulfillment (internal + finance only — customer doesn't need it)
  if (audience !== "customer") {
    const ship = (order.shippingAddressJson as any) || null;
    const shipLine = ship ? [ship.line1, ship.line2, ship.city, ship.region, ship.postalCode, ship.country].filter(Boolean).join(", ") : "";
    if (shipLine || order.fulfillmentMode) {
      sectionTitle("Logistics");
      if (order.fulfillmentMode) kv("Fulfillment", safe(order.fulfillmentMode));
      if (shipLine) kv("Ship to", shipLine);
      if (order.measurementSystem) kv("Units", safe(order.measurementSystem));
    }
  }

  // Items table
  sectionTitle("Items");
  const colItem = 48;
  const colQty = doc.page.width - 48 - (showPricing ? 220 : 60);
  const colPrice = doc.page.width - 48 - 140;
  const colTotal = doc.page.width - 48 - 60;
  // Header row
  const headerY = doc.y;
  doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("ITEM", colItem, headerY, { characterSpacing: 0.6 });
  doc.text("QTY", colQty, headerY, { characterSpacing: 0.6, width: 40, align: "right" });
  if (showPricing) {
    doc.text("UNIT", colPrice, headerY, { characterSpacing: 0.6, width: 70, align: "right" });
    doc.text("TOTAL", colTotal, headerY, { characterSpacing: 0.6, width: 60, align: "right" });
  }
  doc.moveDown(0.3);
  doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor(`#${primary.map(n => n.toString(16).padStart(2,"0")).join("")}33`).lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  if (items.length === 0) {
    doc.fillColor(muted).font("Helvetica-Oblique").fontSize(10).text("No line items recorded.", 48);
  } else {
    for (const it of items) {
      const rowTop = doc.y;
      doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(safe(it.name), colItem, rowTop, { width: colQty - colItem - 12 });
      if (it.notes && audience !== "customer") {
        doc.fillColor(muted).font("Helvetica").fontSize(8.5).text(safe(it.notes), colItem, doc.y, { width: colQty - colItem - 12 });
      }
      // Internal-only line metadata: supplier assignment + internal/supplier
      // fulfillment notes. Hidden from customer & finance to keep those copies
      // free of operational chatter.
      if (audience === "internal") {
        const meta: string[] = [];
        if ((it as any).assignedSupplierId) meta.push(`Supplier #${(it as any).assignedSupplierId}`);
        if ((it as any).internalFulfillmentNotes) meta.push(`Ops: ${(it as any).internalFulfillmentNotes}`);
        if ((it as any).supplierNotes) meta.push(`Supplier note: ${(it as any).supplierNotes}`);
        if (meta.length > 0) {
          doc.fillColor(muted).font("Helvetica-Oblique").fontSize(8.5).text(meta.join(" · "), colItem, doc.y, { width: colQty - colItem - 12 });
        }
      }
      // Right-aligned numerics (anchor to row top so they line up with item name)
      doc.fillColor(text).font("Helvetica").fontSize(10).text(safe(it.quantity), colQty, rowTop, { width: 40, align: "right" });
      if (showPricing) {
        doc.text(fmtCurrency(it.unitPrice) || "—", colPrice, rowTop, { width: 70, align: "right" });
        const lineTotal = it.unitPrice ? fmtCurrency(Number(it.unitPrice) * (it.quantity || 1)) : "";
        doc.font("Helvetica-Bold").text(lineTotal || "", colTotal, rowTop, { width: 60, align: "right" });
      }
      doc.moveDown(0.5);
      // Soft divider
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor(`#${primary.map(n => n.toString(16).padStart(2,"0")).join("")}14`).lineWidth(0.4).stroke();
      doc.moveDown(0.3);
    }
  }

  if (showPricing && order.totalEstimate) {
    doc.moveDown(0.5);
    doc.fillColor(muted).font("Helvetica").fontSize(9).text("Estimated total", 48, doc.y, { width: doc.page.width - 96 - 120, continued: false });
    doc.fillColor(text).font("Helvetica-Bold").fontSize(13).text(safe(order.totalEstimate), doc.page.width - 48 - 120, doc.y - 12, { width: 120, align: "right" });
  }

  // Notes (customer notes are okay to show to all audiences)
  if (order.notes) {
    sectionTitle("Notes from customer");
    doc.fillColor(text).font("Helvetica").fontSize(10).text(safe(order.notes), 48, doc.y, { width: doc.page.width - 96 });
  }

  // Internal-only: order-level internal notes recorded by ops/admin staff.
  // Strictly excluded from customer & finance copies.
  if (audience === "internal" && (order as any).internalNotes) {
    sectionTitle("Internal notes");
    doc.fillColor(text).font("Helvetica").fontSize(10).text(safe((order as any).internalNotes), 48, doc.y, { width: doc.page.width - 96 });
  }

  // Artwork files (internal/finance only — keeps customer copy clean)
  const artwork = (order.artworkFilesJson as Array<{ name: string; url: string }> | null) || [];
  if (artwork.length > 0 && audience !== "customer") {
    sectionTitle(`Uploaded assets (${artwork.length})`);
    doc.fillColor(text).font("Helvetica").fontSize(10);
    for (const a of artwork) {
      doc.text(`• ${safe(a.name || a.url)}`, 48, doc.y, { width: doc.page.width - 96 });
    }
  }

  // Finance-specific billing block
  if (audience === "finance") {
    sectionTitle("Billing");
    if (partner.paymentTerms) kv("Terms", safe(partner.paymentTerms));
    if (partner.depositRequired) kv("Deposit", `${safe(partner.depositPct || "—")}%`);
    if (partner.billingContactEmail) kv("Billing contact", safe(partner.billingContactEmail));
    if (partner.billingEntityName) kv("Bill from", safe(partner.billingEntityName));
    if (partner.defaultBillingNotes) {
      doc.moveDown(0.3);
      doc.fillColor(text).font("Helvetica-Oblique").fontSize(9.5).text(safe(partner.defaultBillingNotes), 48, doc.y, { width: doc.page.width - 96 });
    }
  }

  // Next steps / footer
  doc.moveDown(1);
  if (audience === "customer") {
    const replyTo = partner.replyToEmail || partner.contactEmail;
    doc.save();
    const boxY = doc.y;
    doc.rect(48, boxY, doc.page.width - 96, 50).fill(`#${accent.map(n => n.toString(16).padStart(2,"0")).join("")}1a`);
    doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text("What happens next", 60, boxY + 10);
    doc.fillColor(muted).font("Helvetica").fontSize(9.5).text(`A team member will review your order and reply${replyTo ? ` from ${replyTo}` : ""} with confirmation and timing.`, 60, boxY + 25, { width: doc.page.width - 120 });
    doc.restore();
    doc.y = boxY + 60;
  }

  // Page footer (every page)
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - 40;
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(
      `${safe(partner.companyName)} · ${safe(order.orderNumber)} · ${audienceLabel(audience)}  ·  Page ${i + 1} of ${range.count}`,
      48, footerY, { width: doc.page.width - 96, align: "center" },
    );
  }

  doc.end();
  const buffer = await done;

  const slug = (partner.slug || partner.companyName || "partner").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const tag = audience === "customer" ? "Order" : audience === "finance" ? "Finance_Order" : "Internal_Order";
  const filename = `${slug}_${tag}_${safe(order.orderNumber)}.pdf`;

  return { filename, buffer, audience };
}
