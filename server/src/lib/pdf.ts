/**
 * Branded PDF rendering for standardized invoices and quotes (blueprint 19/20).
 * Uses pdfkit (pure JS, no headless browser). Produces a Divini Partners
 * co-branded document streamed as a Buffer. Zero em dashes.
 */
import PDFDocument from "pdfkit";
import type { InvoiceRow, InvoiceLineItem } from "../db/invoices.js";
import { PRICING_V2, PLATFORM_FEE_RATE_V2 } from "../config.js";
import type { PacketProjection } from "./packetProjection.js";
import type { PacketDiffEntry } from "./packetDiff.js";
import type { BeoData } from "../db/beo.js";

const EMERALD = "#123c2e";
const EMERALD2 = "#1E5D4A";
const GOLD = "#C9A35B";
const INK = "#2c2a26";
const MUT = "#7d776c";
const LINE = "#e7e1d6";
const IVORY = "#f7f4ee";

function money(v: string | number | null | undefined, currency = "USD"): string {
  const n = Number(v ?? 0) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function header(doc: PDFKit.PDFDocument, partnerName: string, partnerTier: string | null, docType: string): void {
  const top = 48;
  // Logo mark
  doc.roundedRect(48, top, 30, 30, 6).fill(EMERALD);
  doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(17).text("D", 48, top + 7, { width: 30, align: "center" });
  // Brand text
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(15).text("Divini Partners", 86, top + 2);
  doc.fillColor(MUT).font("Helvetica").fontSize(8.5).text("by Divini Group", 86, top + 19);
  // Doc type (right)
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(20).text(docType.toUpperCase(), 320, top, { width: 227, align: "right" });
  if (partnerName) {
    doc.fillColor(MUT).font("Helvetica").fontSize(9).text(`Prepared by ${partnerName}${partnerTier ? ` (${partnerTier})` : ""}`, 320, top + 26, { width: 227, align: "right" });
  }
  doc.moveTo(48, top + 50).lineTo(547, top + 50).strokeColor(LINE).lineWidth(1).stroke();
  doc.y = top + 66;
}

function metaRow(doc: PDFKit.PDFDocument, pairs: [string, string][]): void {
  const startY = doc.y;
  const colW = 499 / pairs.length;
  pairs.forEach(([label, value], i) => {
    const x = 48 + i * colW;
    doc.fillColor(MUT).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, startY, { width: colW - 8 });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(value || "-", x, startY + 11, { width: colW - 8 });
  });
  doc.y = startY + 34;
}

function itemsTable(doc: PDFKit.PDFDocument, items: InvoiceLineItem[], currency: string): void {
  const x = 48;
  const cols = { desc: x, qty: x + 300, unit: x + 360, amt: x + 430 };
  const w = { desc: 295, qty: 55, unit: 65, amt: 69 };
  // Header band
  doc.rect(x, doc.y, 499, 22).fill(IVORY);
  const hy = doc.y + 6;
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(8.5);
  doc.text("DESCRIPTION", cols.desc + 8, hy, { width: w.desc });
  doc.text("QTY", cols.qty, hy, { width: w.qty, align: "right" });
  doc.text("UNIT", cols.unit, hy, { width: w.unit, align: "right" });
  doc.text("AMOUNT", cols.amt, hy, { width: w.amt, align: "right" });
  doc.y += 22;

  doc.font("Helvetica").fontSize(9.5);
  if (items.length === 0) {
    doc.fillColor(MUT).text("No line items.", cols.desc + 8, doc.y + 6, { width: w.desc });
    doc.y += 24;
  }
  for (const li of items) {
    const rowY = doc.y + 6;
    doc.fillColor(INK).text(li.description ?? "", cols.desc + 8, rowY, { width: w.desc });
    const h = doc.heightOfString(li.description ?? "", { width: w.desc });
    doc.fillColor(MUT).text(li.quantity != null ? String(li.quantity) : "-", cols.qty, rowY, { width: w.qty, align: "right" });
    doc.text(li.unit_price != null ? money(li.unit_price, currency) : "-", cols.unit, rowY, { width: w.unit, align: "right" });
    doc.fillColor(INK).text(money(li.amount, currency), cols.amt, rowY, { width: w.amt, align: "right" });
    doc.y = rowY + Math.max(h, 11) + 6;
    doc.moveTo(x, doc.y).lineTo(x + 499, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
  }
  doc.y += 6;
}

function totalRow(doc: PDFKit.PDFDocument, label: string, value: string, opts?: { bold?: boolean; gold?: boolean; rate?: string }): void {
  const x = 320;
  const y = doc.y;
  doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts?.bold ? 12 : 10);
  doc.fillColor(opts?.gold ? GOLD : opts?.bold ? EMERALD : MUT).text(label + (opts?.rate ? ` (${opts.rate})` : ""), x, y, { width: 130 });
  doc.fillColor(opts?.bold ? EMERALD : INK).text(value, x + 130, y, { width: 97, align: "right" });
  doc.y = y + (opts?.bold ? 20 : 16);
}

export async function renderInvoicePdf(inv: InvoiceRow): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const out = toBuffer(doc);
  const brand = (inv.brand ?? {}) as { partner?: { name?: string; tier?: string | null } };
  const currency = inv.currency || "USD";

  header(doc, brand.partner?.name ?? "", brand.partner?.tier ?? null, "Invoice");
  metaRow(doc, [
    ["Invoice", inv.invoice_number ?? inv.id.slice(0, 8)],
    ["Status", (inv.status ?? "draft").replace(/_/g, " ")],
    ["Issued", new Date(inv.created_at).toLocaleDateString()],
    ["Due", inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "On receipt"],
  ]);
  doc.moveDown(0.5);
  itemsTable(doc, inv.line_items ?? [], currency);

  totalRow(doc, "Subtotal", money(inv.subtotal, currency));
  totalRow(doc, "Taxes", money(inv.taxes, currency));
  // Pricing V2: the 5% platform fee is added ON TOP of the vendor subtotal and
  // shown as its own line; the vendor receives the full subtotal. The fee rate
  // label uses the flat V2 rate. Legacy keeps the stored per-tier rate label.
  const rate = PRICING_V2
    ? `${(PLATFORM_FEE_RATE_V2 * 100).toFixed(0)}%`
    : inv.platform_fee_rate != null
      ? `${(Number(inv.platform_fee_rate) * 100).toFixed(2)}%`
      : undefined;
  totalRow(doc, "Platform fee", money(inv.platform_fee, currency), { rate });
  if (!PRICING_V2) totalRow(doc, "Processing fee", money(inv.processing_fee, currency));
  totalRow(doc, "Total", money(inv.total, currency), { bold: true });
  if (Number(inv.deposit_paid ?? 0) > 0) totalRow(doc, "Deposit paid", money(inv.deposit_paid, currency));
  totalRow(doc, "Balance due", money(inv.balance_due ?? inv.total, currency), { bold: true, gold: true });

  if (inv.terms || inv.notes) {
    doc.moveDown(1.2);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(LINE).lineWidth(1).stroke();
    doc.y += 12;
    if (inv.terms) {
      doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(10).text("Terms", 48, doc.y);
      doc.fillColor(MUT).font("Helvetica").fontSize(9).text(inv.terms, 48, doc.y + 2, { width: 499 });
      doc.moveDown(0.5);
    }
    if (inv.notes) {
      doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(10).text("Notes", 48, doc.y);
      doc.fillColor(MUT).font("Helvetica").fontSize(9).text(inv.notes, 48, doc.y + 2, { width: 499 });
    }
  }

  if (PRICING_V2) {
    doc.moveDown(0.6);
    doc.fillColor(MUT).font("Helvetica").fontSize(8.5).text(
      "The platform fee is a flat 5% added on top of the vendor price. Your vendor receives their full quoted amount; this fee is what you pay Divini Partners for protected, on-platform service.",
      320, doc.y, { width: 227, align: "right" },
    );
  }

  doc.fillColor(MUT).font("Helvetica").fontSize(8).text(
    "Divini Partners by Divini Group. Payments are protected when made through Divini Partners.",
    48, 790, { width: 499, align: "center" },
  );
  doc.fillColor(EMERALD2);
  doc.end();
  return out;
}

export interface QuotePdfLineItem {
  label: string;
  qty?: number;
  unit_price?: number;
  amount?: number;
  kind?: string;
  note?: string;
}

function quoteItemToRow(li: QuotePdfLineItem): InvoiceLineItem {
  return { description: li.label, quantity: li.qty, unit_price: li.unit_price, amount: Number(li.amount ?? 0) || 0 };
}
export interface QuotePdfData {
  quote_id: string;
  status: string | null;
  brand: { platform: string; vendor: string; vendor_category: string | null };
  event: { name: string; date_time: string | null };
  line_items: { services: QuotePdfLineItem[]; rentals: QuotePdfLineItem[]; add_ons: QuotePdfLineItem[]; exclusions: QuotePdfLineItem[] };
  totals: { subtotal: string | null; platform_fee: string | null; total: string | null };
  expiration_date: string | null;
  currency?: string;
}

export async function renderQuotePdf(qd: QuotePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const out = toBuffer(doc);
  const currency = qd.currency || "USD";

  header(doc, qd.brand.vendor, qd.brand.vendor_category, "Quote");
  metaRow(doc, [
    ["Quote", qd.quote_id.slice(0, 8)],
    ["Event", qd.event.name],
    ["Status", (qd.status ?? "draft").replace(/_/g, " ")],
    ["Valid until", qd.expiration_date ? new Date(qd.expiration_date).toLocaleDateString() : "See terms"],
  ]);
  doc.moveDown(0.5);

  const priced = [...qd.line_items.services, ...qd.line_items.rentals, ...qd.line_items.add_ons].map(quoteItemToRow);
  itemsTable(doc, priced, currency);

  totalRow(doc, "Subtotal", money(qd.totals.subtotal, currency));
  // Pricing V2: flat 5% platform fee added ON TOP of the vendor subtotal; the
  // total IS the client total (subtotal + fee). The vendor receives the full
  // subtotal. The fee line carries the explicit 5% rate under V2.
  totalRow(doc, "Platform fee", money(qd.totals.platform_fee, currency), PRICING_V2 ? { rate: `${(PLATFORM_FEE_RATE_V2 * 100).toFixed(0)}%` } : undefined);
  totalRow(doc, "Total", money(qd.totals.total, currency), { bold: true, gold: true });

  if (qd.line_items.exclusions.length) {
    doc.moveDown(1);
    doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(10).text("Not included", 48, doc.y);
    doc.fillColor(MUT).font("Helvetica").fontSize(9);
    for (const ex of qd.line_items.exclusions) doc.text(`- ${ex.label}`, 48, doc.y + 2, { width: 499 });
  }

  if (PRICING_V2) {
    doc.moveDown(0.6);
    doc.fillColor(MUT).font("Helvetica").fontSize(8.5).text(
      "The platform fee is a flat 5% added on top of your price. You receive your full quoted subtotal; the client pays the subtotal plus the 5% fee.",
      320, doc.y, { width: 227, align: "right" },
    );
  }

  doc.fillColor(MUT).font("Helvetica").fontSize(8).text(
    "Divini Partners by Divini Group. This quote is standardized in the Divini format.",
    48, 790, { width: 499, align: "center" },
  );
  doc.end();
  return out;
}

// --- Native e-signature: stamped signed agreement PDF (blueprint 30.2) -------

export interface SignedAgreementPdfData {
  title: string;
  bodyText: string;
  signerName: string;
  signerRole?: string | null;
  signerEmail?: string | null;
  signedAt: string | Date;
  ip?: string | null;
  hash: string;
  /** A PNG/JPEG data URL of the drawn signature, or null when the signer typed instead. */
  signatureImage?: string | null;
}

/** Detect an inline image data URL we can hand to pdfkit's doc.image. */
function isImageDataUrl(v: string | null | undefined): v is string {
  return typeof v === "string" && /^data:image\/(png|jpe?g);base64,/.test(v);
}

/**
 * Render a clean, branded PDF of an agreement plus a tamper-evident signature
 * block: the drawn signature image (or the typed name in a script-ish style),
 * the signer details, the timestamp, the IP, and the sha256 content hash.
 */
export async function renderSignedAgreementPdf(data: SignedAgreementPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const out = toBuffer(doc);

  header(doc, "", null, "Signed Agreement");
  metaRow(doc, [
    ["Document", data.title],
    ["Signer", data.signerName || "-"],
    ["Signed", new Date(data.signedAt).toLocaleString()],
  ]);
  doc.moveDown(0.5);

  // Agreement body
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(11).text("Agreement", 48, doc.y);
  doc.moveDown(0.3);
  doc.fillColor(INK).font("Helvetica").fontSize(9.5).text(data.bodyText || "", 48, doc.y, {
    width: 499,
    align: "left",
    lineGap: 2,
  });

  doc.moveDown(1.2);
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(LINE).lineWidth(1).stroke();
  doc.y += 14;

  // Signature block
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(11).text("Signature", 48, doc.y);
  doc.y += 6;

  const sigTop = doc.y;
  if (isImageDataUrl(data.signatureImage)) {
    try {
      const b64 = data.signatureImage.split(",")[1] ?? "";
      const buf = Buffer.from(b64, "base64");
      doc.image(buf, 48, sigTop, { fit: [240, 80] });
      doc.y = sigTop + 84;
    } catch {
      doc.fillColor(EMERALD2).font("Helvetica-BoldOblique").fontSize(26).text(data.signerName || "", 48, sigTop);
      doc.y = sigTop + 38;
    }
  } else {
    // Typed signature rendered in an italic, script-ish style.
    doc.fillColor(EMERALD2).font("Helvetica-BoldOblique").fontSize(26).text(data.signerName || "", 48, sigTop);
    doc.y = sigTop + 38;
  }
  doc.moveTo(48, doc.y).lineTo(300, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
  doc.y += 6;

  // Signer details
  const detailY = doc.y;
  doc.fillColor(MUT).font("Helvetica").fontSize(8.5).text("SIGNED BY", 48, detailY);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(data.signerName || "-", 48, detailY + 11, { width: 280 });
  let dy = detailY + 28;
  if (data.signerRole) {
    doc.fillColor(MUT).font("Helvetica").fontSize(9).text(`Role: ${data.signerRole}`, 48, dy, { width: 280 });
    dy += 13;
  }
  if (data.signerEmail) {
    doc.fillColor(MUT).font("Helvetica").fontSize(9).text(data.signerEmail, 48, dy, { width: 280 });
    dy += 13;
  }
  doc.fillColor(MUT).font("Helvetica").fontSize(9).text(
    `Timestamp: ${new Date(data.signedAt).toISOString()}`,
    48, dy, { width: 280 },
  );
  dy += 13;
  doc.fillColor(MUT).font("Helvetica").fontSize(9).text(`IP address: ${data.ip || "unknown"}`, 48, dy, { width: 280 });

  doc.y = Math.max(dy + 24, doc.y);

  // Tamper-evidence hash band
  doc.rect(48, doc.y, 499, 40).fill(IVORY);
  const hy = doc.y + 8;
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(8).text("CONTENT HASH (SHA-256)", 56, hy);
  doc.fillColor(INK).font("Courier").fontSize(8.5).text(data.hash, 56, hy + 12, { width: 483 });
  doc.y += 52;

  doc.fillColor(MUT).font("Helvetica").fontSize(8).text(
    "Divini Partners by Divini Group. This signature was captured natively and is bound to the content hash above for tamper-evidence.",
    48, 790, { width: 499, align: "center" },
  );
  doc.end();
  return out;
}

// --- Final Event Schedule / Execution Packet PDF (completion phase, Part 12) ---

/**
 * Manually add a page when the next block would run past the bottom margin.
 * pdfkit auto-paginates plain .text() calls, but not the rect/line-drawn
 * bands used elsewhere in this file, so section headers and table rows
 * check remaining space explicitly.
 */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > 780) doc.addPage();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.rect(48, doc.y, 499, 20).fill(IVORY);
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(10.5).text(title.toUpperCase(), 56, doc.y + 5);
  doc.y += 20;
  doc.moveDown(0.4);
}

function emptyNote(doc: PDFKit.PDFDocument, text: string): void {
  doc.fillColor(MUT).font("Helvetica-Oblique").fontSize(9).text(text, 48, doc.y, { width: 499 });
  doc.moveDown(0.3);
}

function fmtDate(v: string | null, timezone: string | null): string {
  if (!v) return "TBD";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  } catch {
    return new Date(v).toLocaleString();
  }
}

export interface ExecutionPacketPdfData {
  projection: PacketProjection;
  version: number;
  status: string;
  /** WHAT CHANGED since the previous version. Omitted (not fabricated) when
   *  this is the first version or the caller did not request a diff. */
  changes?: PacketDiffEntry[];
}

/**
 * Render the Final Event Schedule as a branded, versioned PDF -- a frozen
 * snapshot of exactly what `projection` (already role-projected and
 * backend-enforced, see lib/packetProjection.ts) contains. The caller is
 * responsible for authorization and for choosing which projection to render
 * (the actor's own real event role); this function never widens visibility,
 * it only lays out whatever it is given. No sponsor-ops section is rendered
 * because no structured sponsor data model exists yet (same honesty note as
 * lib/packetDiff.ts) -- fabricating one would violate "do not put fabricated
 * data in a document a recipient will treat as authoritative."
 */
export async function renderExecutionPacketPdf(data: ExecutionPacketPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const out = toBuffer(doc);
  const p = data.projection;
  const tz = p.event.timezone;

  header(doc, "", null, "Final Event Schedule");
  metaRow(doc, [
    ["Event", p.event.name],
    ["Version", `v${data.version}${data.status === "final" ? " (final)" : ""}`],
    ["Status", (data.status ?? "issued").replace(/_/g, " ")],
    ["Generated", fmtDate(p.generated_at, tz)],
  ]);

  // --- Event Overview ---
  sectionTitle(doc, "Event Overview");
  const overviewPairs: [string, string][] = [
    ["Date / time", fmtDate(p.event.date_time, tz)],
    ["Load-in", fmtDate(p.event.load_in_at, tz)],
    ["Setup", fmtDate(p.event.setup_at, tz)],
    ["Vendor call", fmtDate(p.event.vendor_call_at, tz)],
    ["Doors", fmtDate(p.event.doors_at, tz)],
    ["Strike", fmtDate(p.event.strike_at, tz)],
  ];
  for (let i = 0; i < overviewPairs.length; i += 2) {
    ensureSpace(doc, 16);
    metaRow(doc, overviewPairs.slice(i, i + 2));
  }
  if (p.event.emergency_contact_name || p.event.emergency_contact_phone) {
    doc.fillColor(MUT).font("Helvetica").fontSize(9).text(
      `Emergency contact: ${p.event.emergency_contact_name ?? "-"}${p.event.emergency_contact_phone ? ` (${p.event.emergency_contact_phone})` : ""}`,
      48, doc.y, { width: 499 },
    );
    doc.moveDown(0.3);
  }

  // --- Key Contacts ---
  sectionTitle(doc, "Key Contacts");
  if (p.key_contacts.length === 0) {
    emptyNote(doc, "No contacts on record yet.");
  } else {
    for (const c of p.key_contacts) {
      ensureSpace(doc, 16);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(
        `${c.name || "(name pending)"} - ${c.role.replace(/_/g, " ")}`,
        48, doc.y, { width: 499 },
      );
      doc.fillColor(MUT).font("Helvetica").fontSize(8.5).text(
        [c.organization_name, c.email, c.phone].filter(Boolean).join("  |  "),
        48, doc.y, { width: 499 },
      );
      doc.moveDown(0.3);
    }
  }

  // --- Venue Info ---
  sectionTitle(doc, "Venue Info");
  if (!p.venue.name) {
    emptyNote(doc, "No venue selected yet.");
  } else {
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(p.venue.name, 48, doc.y, { width: 499 });
    const addr = [p.venue.address, p.venue.city, p.venue.region].filter(Boolean).join(", ");
    if (addr) doc.fillColor(MUT).font("Helvetica").fontSize(9).text(addr, 48, doc.y, { width: 499 });
    if (p.venue.space) doc.fillColor(MUT).font("Helvetica").fontSize(9).text(`Space: ${p.venue.space}`, 48, doc.y, { width: 499 });
    doc.moveDown(0.3);
  }

  // --- Final Counts ---
  sectionTitle(doc, "Final Counts");
  if (!p.final_count) {
    emptyNote(doc, "No final count has been set yet.");
  } else {
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(
      `${p.final_count.count} guests (v${p.final_count.version})`,
      48, doc.y,
    );
    doc.moveDown(0.3);
  }
  if (p.my_final_quantity && p.my_final_quantity.length) {
    for (const q of p.my_final_quantity) {
      ensureSpace(doc, 14);
      const status = q.discrepancy_status && q.discrepancy_status !== "not_applicable" ? ` [${q.discrepancy_status}]` : "";
      doc.fillColor(MUT).font("Helvetica").fontSize(9).text(
        `${q.scope}: ${q.quantity} ${q.unit}${status}`,
        48, doc.y, { width: 499 },
      );
    }
    doc.moveDown(0.3);
  }

  // --- Run of Show ---
  sectionTitle(doc, "Run of Show");
  if (p.schedule_items.length === 0) {
    emptyNote(doc, "No schedule items yet.");
  } else {
    for (const item of p.schedule_items) {
      ensureSpace(doc, 16);
      const when = item.start_time
        ? `${fmtDate(item.start_time, tz)}${item.end_time ? ` - ${fmtDate(item.end_time, tz)}` : ""}`
        : "Time TBD";
      doc.fillColor(EMERALD2).font("Helvetica-Bold").fontSize(9).text(when, 48, doc.y, { width: 150 });
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(item.title, 200, doc.y - 11, { width: 347 });
      if (item.location) {
        doc.fillColor(MUT).font("Helvetica").fontSize(8).text(item.location, 200, doc.y, { width: 347 });
      }
      doc.moveDown(0.35);
    }
  }

  // --- Vendor Roster ---
  sectionTitle(doc, "Vendor Roster");
  if (!p.vendor_assignments || p.vendor_assignments.length === 0) {
    emptyNote(doc, p.vendor_assignments === null ? "Vendor roster not shown for this view." : "No vendors attached yet.");
  } else {
    for (const v of p.vendor_assignments) {
      ensureSpace(doc, 14);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(
        `${v.vendor_name}${v.role ? ` - ${v.role.replace(/_/g, " ")}` : ""}${v.status ? ` (${v.status})` : ""}`,
        48, doc.y, { width: 499 },
      );
    }
    doc.moveDown(0.3);
  }

  // --- Vendor Schedule (Part 3): the unified Time / Vendor / Action /
  // Location / Contact / Status arrival-delivery table, derived from the
  // same responsible_org_id itinerary data as the Run of Show above -- not
  // a second schedule, just this audience's own rows from it. ---
  sectionTitle(doc, "Vendor Schedule");
  if (p.vendor_schedule.length === 0) {
    emptyNote(doc, "No vendor arrival or delivery times scheduled yet.");
  } else {
    for (const v of p.vendor_schedule) {
      ensureSpace(doc, 26);
      const when = v.start_time
        ? `${fmtDate(v.start_time, tz)}${v.end_time ? ` - ${fmtDate(v.end_time, tz)}` : ""}`
        : "Time TBD";
      doc.fillColor(EMERALD2).font("Helvetica-Bold").fontSize(9).text(when, 48, doc.y, { width: 150 });
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(
        `${v.vendor_name} - ${v.action}`,
        200, doc.y - 11, { width: 347 },
      );
      const subParts = [v.location, v.status.replace(/_/g, " ")].filter(Boolean);
      if (subParts.length) {
        doc.fillColor(MUT).font("Helvetica").fontSize(8).text(subParts.join("  |  "), 200, doc.y, { width: 347 });
      }
      const contactParts = [v.contact_name, v.contact_phone, v.contact_email].filter(Boolean);
      if (contactParts.length) {
        doc.fillColor(MUT).font("Helvetica").fontSize(8).text(contactParts.join("  |  "), 200, doc.y, { width: 347 });
      }
      doc.moveDown(0.35);
    }
    doc.moveDown(0.3);
  }

  // --- Setup / Access ---
  sectionTitle(doc, "Setup / Access");
  const accessPairs: [string, string | null][] = [
    ["Access time", fmtDate(p.venue.access_time, tz)],
    ["Vendor entrance", p.venue.vendor_entrance],
    ["Guest entrance", p.venue.guest_entrance],
    ["Loading dock", p.venue.loading_dock],
    ["Parking", p.venue.parking_info],
  ];
  const knownAccess = accessPairs.filter(([, v]) => v);
  if (knownAccess.length === 0) {
    emptyNote(doc, "No setup/access details recorded for this view.");
  } else {
    for (const [label, value] of knownAccess) {
      ensureSpace(doc, 14);
      doc.fillColor(MUT).font("Helvetica-Bold").fontSize(8.5).text(`${label}: `, 48, doc.y, { continued: true, width: 499 });
      doc.fillColor(INK).font("Helvetica").fontSize(8.5).text(value as string);
    }
    doc.moveDown(0.3);
  }

  // --- Maps / Plans ---
  sectionTitle(doc, "Maps / Plans");
  if (p.floorplans.length === 0) {
    emptyNote(doc, "No floorplans uploaded yet.");
  } else {
    for (const fp of p.floorplans) {
      ensureSpace(doc, 14);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(
        `${fp.name || "Floorplan"}${fp.is_primary ? " (primary)" : ""}`,
        48, doc.y, { width: 499 },
      );
    }
    doc.moveDown(0.3);
  }

  // --- Special Instructions ---
  sectionTitle(doc, "Special Instructions");
  if (p.venue.restrictions || p.venue.notes) {
    if (p.venue.restrictions) {
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(p.venue.restrictions, 48, doc.y, { width: 499 });
      doc.moveDown(0.2);
    }
    if (p.venue.notes) {
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(p.venue.notes, 48, doc.y, { width: 499 });
    }
    doc.moveDown(0.3);
  } else {
    emptyNote(doc, "No special instructions on record for this view.");
  }

  // --- Change Summary (WHAT CHANGED since the previous version) ---
  if (data.changes) {
    sectionTitle(doc, "Change Summary");
    if (data.changes.length === 0) {
      emptyNote(doc, "No changes since the previous version.");
    } else {
      for (const c of data.changes) {
        ensureSpace(doc, 14);
        doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(8.5).text(`${c.label}: `, 48, doc.y, { continued: true, width: 499 });
        doc.fillColor(INK).font("Helvetica").fontSize(8.5).text(`${c.old_value} -> ${c.new_value}`);
      }
    }
  }

  doc.fillColor(MUT).font("Helvetica").fontSize(8).text(
    "Divini Partners by Divini Group. This is a frozen snapshot of the Final Event Schedule at the version noted above; the live app view is always authoritative for anything after this version.",
    48, 790, { width: 499, align: "center" },
  );
  doc.end();
  return out;
}

/**
 * Render the Banquet Event Order (BEO) -- the hospitality-industry-standard
 * document venue/catering/AV professionals expect: event overview, venue
 * setup/access, the run-of-show timeline, and (the part the Final Event
 * Schedule deliberately omits, since that document is pure day-of
 * logistics) what is actually ORDERED from each awarded vendor, with real
 * pricing pulled from their awarded quote. Never fabricates a vendor order
 * section when no vendor has been awarded yet -- says so plainly instead.
 */
export async function renderBeoPdf(data: BeoData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const out = toBuffer(doc);
  const tz = data.event.timezone;

  header(doc, "", null, "Banquet Event Order");
  metaRow(doc, [
    ["Event", data.event.name],
    ["Date / time", fmtDate(data.event.date_time, tz)],
    ["Generated", fmtDate(data.generated_at, tz)],
  ]);

  // --- Event Overview ---
  sectionTitle(doc, "Event Overview");
  const overviewPairs: [string, string][] = [
    ["Load-in", fmtDate(data.event.load_in_at, tz)],
    ["Setup", fmtDate(data.event.setup_at, tz)],
    ["Doors", fmtDate(data.event.doors_at, tz)],
    ["Strike", fmtDate(data.event.strike_at, tz)],
  ];
  for (let i = 0; i < overviewPairs.length; i += 2) {
    ensureSpace(doc, 16);
    metaRow(doc, overviewPairs.slice(i, i + 2));
  }
  if (data.event.emergency_contact_name || data.event.emergency_contact_phone) {
    doc.fillColor(MUT).font("Helvetica").fontSize(9).text(
      `Emergency contact: ${data.event.emergency_contact_name ?? "-"}${data.event.emergency_contact_phone ? ` (${data.event.emergency_contact_phone})` : ""}`,
      48, doc.y, { width: 499 },
    );
    doc.moveDown(0.3);
  }

  // --- Venue Setup / Access ---
  sectionTitle(doc, "Venue Setup / Access");
  if (!data.venue.name && !data.venue.access_time && !data.venue.notes) {
    emptyNote(doc, "No venue setup/access details recorded yet.");
  } else {
    if (data.venue.name) {
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(data.venue.name, 48, doc.y, { width: 499 });
    }
    if (data.venue.space) doc.fillColor(MUT).font("Helvetica").fontSize(9).text(`Space: ${data.venue.space}`, 48, doc.y, { width: 499 });
    const accessPairs: [string, string | null][] = [
      ["Access time", fmtDate(data.venue.access_time, tz)],
      ["Vendor entrance", data.venue.vendor_entrance],
      ["Guest entrance", data.venue.guest_entrance],
      ["Loading dock", data.venue.loading_dock],
      ["Parking", data.venue.parking_info],
    ];
    for (const [label, value] of accessPairs.filter(([, v]) => v)) {
      ensureSpace(doc, 14);
      doc.fillColor(MUT).font("Helvetica-Bold").fontSize(8.5).text(`${label}: `, 48, doc.y, { continued: true, width: 499 });
      doc.fillColor(INK).font("Helvetica").fontSize(8.5).text(value as string);
    }
    if (data.venue.restrictions) {
      doc.moveDown(0.2);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(data.venue.restrictions, 48, doc.y, { width: 499 });
    }
    if (data.venue.notes) {
      doc.moveDown(0.2);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(data.venue.notes, 48, doc.y, { width: 499 });
    }
    doc.moveDown(0.3);
  }

  // --- Run of Show ---
  sectionTitle(doc, "Run of Show");
  if (data.schedule.length === 0) {
    emptyNote(doc, "No schedule items yet.");
  } else {
    for (const item of data.schedule) {
      ensureSpace(doc, 16);
      const when = item.start_time
        ? `${fmtDate(item.start_time, tz)}${item.end_time ? ` - ${fmtDate(item.end_time, tz)}` : ""}`
        : "Time TBD";
      doc.fillColor(EMERALD2).font("Helvetica-Bold").fontSize(9).text(when, 48, doc.y, { width: 150 });
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(item.title, 200, doc.y - 11, { width: 347 });
      if (item.location) {
        doc.fillColor(MUT).font("Helvetica").fontSize(8).text(item.location, 200, doc.y, { width: 347 });
      }
      doc.moveDown(0.35);
    }
  }

  // --- Vendor Orders (the BEO-specific section: what is actually ordered,
  // with real pricing from the awarded quote) ---
  sectionTitle(doc, "Vendor Orders");
  if (data.vendor_orders.length === 0) {
    emptyNote(doc, "No vendor has been awarded on this event yet -- nothing to order.");
  } else {
    for (const v of data.vendor_orders) {
      ensureSpace(doc, 24);
      doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(10.5).text(
        `${v.vendor_name}${v.category ? ` - ${v.category}` : ""}`,
        48, doc.y, { width: 499 },
      );
      doc.moveDown(0.2);
      if (v.line_items.length === 0) {
        doc.fillColor(MUT).font("Helvetica-Oblique").fontSize(8.5).text("No itemized line items on the awarded quote.", 48, doc.y, { width: 499 });
      } else {
        for (const li of v.line_items) {
          ensureSpace(doc, 12);
          doc.fillColor(INK).font("Helvetica").fontSize(9).text(li.description || "Item", 56, doc.y, { width: 400, continued: true });
          doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(money(li.amount), { align: "right", width: 483 - 56 });
        }
      }
      doc.moveDown(0.1);
      doc.fillColor(EMERALD2).font("Helvetica-Bold").fontSize(9.5).text(
        `Order total: ${money(v.awarded_amount)}`,
        48, doc.y, { width: 499, align: "right" },
      );
      doc.moveDown(0.5);
    }
  }

  doc.fillColor(MUT).font("Helvetica").fontSize(8).text(
    "Divini Partners by Divini Group. This Banquet Event Order reflects the awarded vendor orders and event schedule at the time it was generated; the live app view is always authoritative for anything after this point.",
    48, 790, { width: 499, align: "center" },
  );
  doc.end();
  return out;
}
