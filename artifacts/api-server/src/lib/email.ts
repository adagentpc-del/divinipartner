import { getUncachableResendClient } from "./resend";
import { logger } from "./logger";
import { db, partnersTable, partnerThemesTable, ordersTable, orderItemsTable, eventsTable, venuesTable, partnerEmailRecipientsTable, type RecipientRole } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { emit } from "../services/usageTracking";

type Partner = typeof partnersTable.$inferSelect;
type Theme = typeof partnerThemesTable.$inferSelect;
type Order = typeof ordersTable.$inferSelect;
type OrderItem = typeof orderItemsTable.$inferSelect;

export type EmailRecipient = string | string[];

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  button: string;
  text: string;
  muted: string;
}

const FALLBACK_COLORS: BrandColors = {
  primary: "#0f1729",
  secondary: "#1e293b",
  accent: "#f59e0b",
  background: "#f8fafc",
  button: "#0f1729",
  text: "#0f172a",
  muted: "#64748b",
};

export function resolveBrandColors(theme: Partial<Theme> | null | undefined): BrandColors {
  const primary = theme?.primaryColor || FALLBACK_COLORS.primary;
  return {
    primary,
    secondary: theme?.secondaryColor || FALLBACK_COLORS.secondary,
    accent: theme?.accentColor || FALLBACK_COLORS.accent,
    background: theme?.backgroundColor || FALLBACK_COLORS.background,
    button: theme?.buttonColor || primary,
    text: theme?.textColor || FALLBACK_COLORS.text,
    muted: FALLBACK_COLORS.muted,
  };
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: string | number | null | undefined, currency: string = "USD"): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!isFinite(n)) return "";
  try {
    return n.toLocaleString("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() });
  } catch {
    return `${n.toFixed(2)} ${(currency || "USD").toUpperCase()}`;
  }
}

function brandHeader(partner: Partial<Partner>, colors: BrandColors): string {
  const logo = partner.logoUrl
    ? `<img src="${escapeHtml(partner.logoUrl)}" alt="${escapeHtml(partner.companyName)}" style="max-height:56px;max-width:240px;display:block;margin:0 auto;" />`
    : `<div style="font-size:22px;font-weight:700;color:${colors.primary};letter-spacing:-0.01em;">${escapeHtml(partner.companyName || "")}</div>`;
  return `
    <tr>
      <td style="padding:32px 32px 24px 32px;background:linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%);text-align:center;">
        <div style="background:#ffffff;border-radius:12px;padding:18px 24px;display:inline-block;">${logo}</div>
      </td>
    </tr>`;
}

function brandFooter(partner: Partial<Partner>, colors: BrandColors, replyTo: string | null): string {
  return `
    <tr>
      <td style="padding:24px 32px;background:${colors.primary}08;border-top:1px solid ${colors.primary}20;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${colors.muted};">
        <div style="font-weight:600;color:${colors.text};margin-bottom:4px;">${escapeHtml(partner.companyName || "")}</div>
        ${partner.contactPhone ? `<div>${escapeHtml(partner.contactPhone)}</div>` : ""}
        ${replyTo ? `<div><a href="mailto:${escapeHtml(replyTo)}" style="color:${colors.primary};text-decoration:none;">${escapeHtml(replyTo)}</a></div>` : ""}
        ${partner.websiteUrl ? `<div style="margin-top:6px;"><a href="${escapeHtml(partner.websiteUrl)}" style="color:${colors.primary};text-decoration:none;">${escapeHtml(partner.websiteUrl)}</a></div>` : ""}
      </td>
    </tr>`;
}

function shellOpen(colors: BrandColors): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${colors.background};">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${colors.primary}1a;font-family:Arial,Helvetica,sans-serif;color:${colors.text};">`;
}

function shellClose(): string {
  return `</table></div></body></html>`;
}

/**
 * Render subtotal / tax / total breakdown using the order's snapshotted
 * currency + tax fields. Falls back gracefully when the order pre-dates
 * currency support (legacy rows without subtotal/taxAmount just show total).
 */
function renderTotalsBlock(order: any, colors: BrandColors): string {
  const cur = order.currency || "USD";
  const subtotal = order.subtotal;
  const taxAmt = order.taxAmount;
  const taxLabel = order.taxLabel || "Tax";
  const taxRate = Number(order.taxRate ?? 0);
  const taxInclusive = !!order.taxInclusive;
  const rateLabel = taxRate > 0 ? `${escapeHtml(taxLabel)} (${taxRate}%${taxInclusive ? ", incl." : ""})` : escapeHtml(taxLabel);
  return `
    <table role="presentation" align="right" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:13px;color:${colors.text};">
      ${subtotal != null ? `<tr><td style="padding:2px 12px 2px 0;color:${colors.muted};">${taxInclusive ? "Net subtotal" : "Subtotal"}</td><td style="padding:2px 0;text-align:right;">${escapeHtml(formatCurrency(subtotal, cur))}</td></tr>` : ""}
      ${taxAmt != null && Number(taxAmt) !== 0 ? `<tr><td style="padding:2px 12px 2px 0;color:${colors.muted};">${rateLabel}</td><td style="padding:2px 0;text-align:right;">${escapeHtml(formatCurrency(taxAmt, cur))}</td></tr>` : ""}
      <tr><td style="padding:6px 12px 2px 0;color:${colors.muted};font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.06em;">Total</td><td style="padding:6px 0 2px 0;text-align:right;font-weight:700;font-size:15px;">${escapeHtml(formatCurrency(order.totalEstimate, cur))} ${escapeHtml(cur)}</td></tr>
    </table>`;
}

function renderItemsTable(items: OrderItem[], colors: BrandColors, opts: { showPricing: boolean; currency?: string }): string {
  if (!items.length) return "";
  const cur = opts.currency || "USD";
  const rows = items.map((it) => {
    const price = opts.showPricing ? formatCurrency(it.unitPrice, cur) : "";
    const lineTotal = opts.showPricing && it.unitPrice ? formatCurrency(Number(it.unitPrice) * (it.quantity || 1), cur) : "";
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid ${colors.primary}14;font-size:13px;">
          <div style="font-weight:600;color:${colors.text};">${escapeHtml(it.name)}</div>
          ${it.notes ? `<div style="color:${colors.muted};font-size:12px;margin-top:2px;">${escapeHtml(it.notes)}</div>` : ""}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid ${colors.primary}14;font-size:13px;text-align:center;color:${colors.text};">${it.quantity}</td>
        ${opts.showPricing ? `<td style="padding:10px 8px;border-bottom:1px solid ${colors.primary}14;font-size:13px;text-align:right;color:${colors.text};">${price || "—"}</td>` : ""}
        ${opts.showPricing ? `<td style="padding:10px 8px;border-bottom:1px solid ${colors.primary}14;font-size:13px;text-align:right;color:${colors.text};font-weight:600;">${lineTotal || ""}</td>` : ""}
      </tr>`;
  }).join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
      <thead>
        <tr>
          <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:${colors.muted};border-bottom:2px solid ${colors.primary}26;">Item</th>
          <th align="center" style="padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:${colors.muted};border-bottom:2px solid ${colors.primary}26;">Qty</th>
          ${opts.showPricing ? `<th align="right" style="padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:${colors.muted};border-bottom:2px solid ${colors.primary}26;">Unit</th>` : ""}
          ${opts.showPricing ? `<th align="right" style="padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:${colors.muted};border-bottom:2px solid ${colors.primary}26;">Total</th>` : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export interface OrderEmailContext {
  partner: Partner;
  theme: Theme | null;
  order: Order;
  items: OrderItem[];
  event?: { name: string; eventDate?: string | Date | null } | null;
  venue?: { name: string; city?: string | null; country?: string | null } | null;
}

export async function buildOrderEmailContext(orderId: number): Promise<OrderEmailContext | null> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return null;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, order.partnerId));
  if (!partner) return null;
  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partner.id));
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  let event = null;
  let venue = null;
  if (order.eventId) {
    const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, order.eventId));
    event = ev ? { name: ev.name, eventDate: ev.eventDate } : null;
    if (ev?.venueId) {
      const [vn] = await db.select().from(venuesTable).where(eq(venuesTable.id, ev.venueId));
      venue = vn ? { name: vn.name, city: vn.city, country: vn.country } : null;
    }
  }
  if (!venue && order.shippingVenueId) {
    const [vn] = await db.select().from(venuesTable).where(eq(venuesTable.id, order.shippingVenueId));
    venue = vn ? { name: vn.name, city: vn.city, country: vn.country } : null;
  }
  return { partner, theme: theme ?? null, order, items, event, venue };
}

export function renderCustomerConfirmationHtml(ctx: OrderEmailContext): string {
  const { partner, theme, order, items, event, venue } = ctx;
  const colors = resolveBrandColors(theme);
  const showPricing = !!partner.pricingDisplayEnabled;
  const replyTo = partner.replyToEmail || partner.contactEmail || partner.routingEmail || null;
  const eventLine = event ? `${escapeHtml(event.name)}${event.eventDate ? ` · ${escapeHtml(new Date(event.eventDate).toLocaleDateString())}` : ""}` : "";
  const venueLine = venue ? `${escapeHtml(venue.name)}${venue.city ? `, ${escapeHtml(venue.city)}` : ""}${venue.country ? `, ${escapeHtml(venue.country)}` : ""}` : "";
  return `${shellOpen(colors)}
    ${brandHeader(partner, colors)}
    <tr>
      <td style="padding:32px;">
        <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${colors.text};">Thanks${order.contactName ? `, ${escapeHtml(order.contactName.split(" ")[0])}` : ""}!</h1>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:${colors.muted};">
          We received your order. Our team will follow up shortly with confirmation and next steps.
        </p>

        <div style="background:${colors.background};border:1px solid ${colors.primary}1a;border-radius:10px;padding:16px;margin-bottom:20px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${colors.muted};margin-bottom:4px;">Order reference</div>
          <div style="font-size:18px;font-weight:700;color:${colors.text};font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(order.orderNumber)}</div>
        </div>

        ${eventLine || venueLine ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          ${eventLine ? `<tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};width:90px;">Event</td><td style="padding:6px 0;font-size:13px;color:${colors.text};font-weight:600;">${eventLine}</td></tr>` : ""}
          ${venueLine ? `<tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};width:90px;">Venue</td><td style="padding:6px 0;font-size:13px;color:${colors.text};font-weight:600;">${venueLine}</td></tr>` : ""}
        </table>` : ""}

        <h2 style="margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:${colors.muted};">Order summary</h2>
        ${renderItemsTable(items, colors, { showPricing, currency: (order as any).currency || "USD" })}
        ${showPricing && order.totalEstimate ? renderTotalsBlock(order as any, colors) : ""}

        <div style="margin-top:28px;padding:16px;border-radius:10px;background:${colors.accent}14;border-left:3px solid ${colors.accent};">
          <div style="font-weight:600;font-size:13px;color:${colors.text};margin-bottom:4px;">What happens next</div>
          <div style="font-size:13px;color:${colors.muted};line-height:1.5;">A team member will review your order and reply${replyTo ? ` from <strong>${escapeHtml(replyTo)}</strong>` : ""} with confirmation, artwork details, and timing.</div>
        </div>

        ${replyTo ? `<div style="text-align:center;margin-top:28px;">
          <a href="mailto:${escapeHtml(replyTo)}?subject=${encodeURIComponent("Order " + order.orderNumber)}" style="display:inline-block;padding:12px 22px;background:${colors.button};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Reply to this order</a>
        </div>` : ""}
      </td>
    </tr>
    ${brandFooter(partner, colors, replyTo)}
  ${shellClose()}`;
}

// Section 29: surface order-level exceptions and "artwork needed" requests
// at the top of the internal forward email so whoever's triaging knows what's
// blocking before they read the line items. Uses inline styles + a colored
// left border so it survives Outlook/Gmail rendering without classes.
const EXCEPTION_STATE_LABELS: Record<string, { label: string; bg: string; border: string; text: string }> = {
  warning:          { label: "Warning",            bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
  exception:        { label: "Exception flagged",  bg: "#fef2f2", border: "#dc2626", text: "#991b1b" },
  waiting_client:   { label: "Waiting on client",  bg: "#eff6ff", border: "#2563eb", text: "#1e40af" },
  waiting_internal: { label: "Waiting internal",   bg: "#f5f3ff", border: "#7c3aed", text: "#5b21b6" },
  resolved:         { label: "Resolved",           bg: "#ecfdf5", border: "#059669", text: "#065f46" },
};
const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  missing_artwork: "Missing artwork",
  artwork_creation_needed: "Artwork creation needed",
  wrong_file_or_spec_format: "Wrong file or spec format",
  missing_dimensions: "Missing dimensions",
  missing_contact_info: "Missing contact info",
  unclear_order_notes: "Unclear order notes",
  custom_review_needed: "Custom review needed",
  rush_request: "Rush request",
  incomplete_package_selection: "Incomplete package selection",
  asset_mismatch: "Asset mismatch",
  manual_follow_up_required: "Manual follow-up required",
};

function renderExceptionBanner(order: any): string {
  const blocks: string[] = [];
  const state = order?.exceptionState && order.exceptionState !== "none" ? String(order.exceptionState) : null;
  const meta = state ? EXCEPTION_STATE_LABELS[state] : null;
  if (state && meta) {
    const typeLabel = order.exceptionType ? (EXCEPTION_TYPE_LABELS[order.exceptionType] || order.exceptionType) : null;
    blocks.push(`<div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:${meta.bg};border-left:4px solid ${meta.border};color:${meta.text};">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(meta.label)}${typeLabel ? ` · ${escapeHtml(typeLabel)}` : ""}</div>
      ${order.exceptionMessage ? `<div style="margin-top:4px;font-size:13px;white-space:pre-wrap;">${escapeHtml(order.exceptionMessage)}</div>` : ""}
    </div>`);
  }
  if (order?.artworkNeededFlag) {
    const contact = [order.artworkContactName, order.artworkContactEmail].filter(Boolean).join(" · ");
    blocks.push(`<div style="margin-top:10px;padding:12px 14px;border-radius:8px;background:#fdf4ff;border-left:4px solid #a21caf;color:#701a75;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Artwork creation requested</div>
      ${order.artworkBrief ? `<div style="margin-top:4px;font-size:13px;white-space:pre-wrap;">${escapeHtml(order.artworkBrief)}</div>` : ""}
      ${contact ? `<div style="margin-top:6px;font-size:12px;color:#86198f;">Design contact: ${escapeHtml(contact)}</div>` : ""}
    </div>`);
  }
  return blocks.join("");
}

export function renderInternalForwardHtml(ctx: OrderEmailContext): string {
  const { partner, theme, order, items, event, venue } = ctx;
  const colors = resolveBrandColors(theme);
  const eventLine = event ? `${escapeHtml(event.name)}${event.eventDate ? ` · ${escapeHtml(new Date(event.eventDate).toLocaleDateString())}` : ""}` : "—";
  const venueLine = venue ? `${escapeHtml(venue.name)}${venue.city ? `, ${escapeHtml(venue.city)}` : ""}${venue.country ? `, ${escapeHtml(venue.country)}` : ""}` : "—";
  const artwork = (order.artworkFilesJson as Array<{ name: string; url: string }> | null) || [];
  const ship = order.shippingAddressJson as any;
  const shipLine = ship ? [ship.line1, ship.line2, ship.city, ship.region, ship.postalCode, ship.country].filter(Boolean).map(escapeHtml).join(", ") : "";
  return `${shellOpen(colors)}
    ${brandHeader(partner, colors)}
    <tr>
      <td style="padding:24px 32px;">
        <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${colors.accent}26;color:${colors.text};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">New order · action required</div>
        <h1 style="margin:0 0 4px 0;font-size:20px;color:${colors.text};">${escapeHtml(order.orderNumber)}</h1>
        <div style="font-size:13px;color:${colors.muted};">Submitted ${escapeHtml(new Date(order.createdAt).toLocaleString())}</div>
        ${renderExceptionBanner(order as any)}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;background:${colors.background};border-radius:10px;overflow:hidden;">
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};width:120px;">Customer</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};font-weight:600;">${escapeHtml(order.contactName)}${order.companyName ? ` · ${escapeHtml(order.companyName)}` : ""}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Email</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;"><a href="mailto:${escapeHtml(order.contactEmail)}" style="color:${colors.primary};text-decoration:none;">${escapeHtml(order.contactEmail)}</a></td></tr>
          ${order.contactPhone ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Phone</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(order.contactPhone)}</td></tr>` : ""}
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Event</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${eventLine}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Venue</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${venueLine}</td></tr>
          ${shipLine ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Ship to</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${shipLine}</td></tr>` : ""}
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Fulfillment</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(order.fulfillmentMode || "—")}</td></tr>
          ${order.measurementSystem ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Units</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(order.measurementSystem)}</td></tr>` : ""}
        </table>

        <h2 style="margin:24px 0 4px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:${colors.muted};">Items (${items.length})</h2>
        ${renderItemsTable(items, colors, { showPricing: true, currency: (order as any).currency || "USD" })}
        ${order.totalEstimate ? renderTotalsBlock(order as any, colors) : ""}

        ${order.notes ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#fffbe6;border-left:3px solid #f59e0b;"><div style="font-size:12px;font-weight:700;color:${colors.text};margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Customer notes</div><div style="font-size:13px;color:${colors.text};white-space:pre-wrap;">${escapeHtml(order.notes)}</div></div>` : ""}

        ${artwork.length ? `<div style="margin-top:20px;"><div style="font-size:12px;font-weight:700;color:${colors.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">Artwork (${artwork.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;">${artwork.map(a => `<li><a href="${escapeHtml(a.url)}" style="color:${colors.primary};">${escapeHtml(a.name || a.url)}</a></li>`).join("")}</ul></div>` : ""}
      </td>
    </tr>
    ${brandFooter(partner, colors, partner.replyToEmail || partner.contactEmail)}
  ${shellClose()}`;
}

export interface SendResult { ok: boolean; id?: string; error?: string; }

export interface EmailAttachment {
  filename: string;
  content: Buffer; // raw bytes — we base64-encode at the Resend boundary
}

async function sendBrandedEmail(params: {
  partner: Partner;
  to: EmailRecipient;
  cc?: EmailRecipient | null;
  bcc?: EmailRecipient | null;
  subject: string;
  html: string;
  replyTo?: string | null;
  emailType: string;
  orderId?: number | null;
  attachments?: EmailAttachment[] | null;
}): Promise<SendResult> {
  if (partnerEmailDisabled(params.partner)) {
    logger.warn({ partnerId: params.partner.id, type: params.emailType }, "Email disabled for partner; skipping send");
    return { ok: false, error: "email_disabled_for_partner" };
  }
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const fromName = params.partner.emailFromName || params.partner.companyName;
    const fromAddress = fromEmail || "noreply@resend.dev";
    const from = fromName ? `${fromName} <${fromAddress.replace(/^.*<|>.*$/g, "")}>` : fromAddress;
    const sendArgs: any = {
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    };
    if (params.cc) sendArgs.cc = params.cc;
    if (params.bcc) sendArgs.bcc = params.bcc;
    if (params.replyTo) sendArgs.reply_to = params.replyTo;
    if (params.attachments && params.attachments.length > 0) {
      sendArgs.attachments = params.attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      }));
    }
    const result = await client.emails.send(sendArgs);
    const id = (result as any)?.data?.id || (result as any)?.id;
    const attachmentNames = (params.attachments || []).map(a => a.filename);
    emit("email.sent", {
      partnerId: params.partner.id,
      objectType: "order",
      objectId: params.orderId ?? null,
      meta: { type: params.emailType, to: params.to, subject: params.subject, providerId: id, attached: attachmentNames.length > 0, attachments: attachmentNames },
    }).catch(() => {});
    logger.info({ partnerId: params.partner.id, type: params.emailType, id }, "Email sent");
    return { ok: true, id };
  } catch (err: any) {
    const error = err?.message || String(err);
    emit("email.failed", {
      partnerId: params.partner.id,
      objectType: "order",
      objectId: params.orderId ?? null,
      meta: { type: params.emailType, to: params.to, subject: params.subject, error },
    }).catch(() => {});
    logger.error({ err, partnerId: params.partner.id, type: params.emailType }, "Email send failed");
    return { ok: false, error };
  }
}

function partnerEmailDisabled(partner: Partner): boolean {
  return partner.emailEnabled === false;
}

// Attachment helper. Generates a PDF for the given audience but never throws —
// failures are logged and the email sends without the attachment so we never
// regress the customer-facing notification because of a rendering bug.
async function maybeAttach(ctx: OrderEmailContext, audience: "customer" | "internal" | "finance", enabled: boolean): Promise<EmailAttachment[] | null> {
  if (!enabled) return null;
  try {
    const { generateOrderSummaryPdf } = await import("./pdf");
    const pdf = await generateOrderSummaryPdf(ctx, audience);
    emit("pdf.generated", {
      partnerId: ctx.partner.id,
      objectType: "order",
      objectId: ctx.order.id,
      meta: { audience, filename: pdf.filename, bytes: pdf.buffer.length },
    }).catch(() => {});
    return [{ filename: pdf.filename, content: pdf.buffer }];
  } catch (err: any) {
    logger.error({ err, audience, orderId: ctx.order.id }, "PDF generation failed; sending email without attachment");
    emit("pdf.failed", {
      partnerId: ctx.partner.id,
      objectType: "order",
      objectId: ctx.order.id,
      meta: { audience, error: err?.message || String(err) },
    }).catch(() => {});
    return null;
  }
}

export async function sendOrderConfirmation(ctx: OrderEmailContext): Promise<SendResult> {
  const { partner, order } = ctx;
  if (!order.contactEmail) return { ok: false, error: "no_customer_email" };
  const html = renderCustomerConfirmationHtml(ctx);
  const senderLabel = partner.emailSenderLabel || partner.companyName;
  const attachments = await maybeAttach(ctx, "customer", !!partner.attachPdfCustomer);
  return sendBrandedEmail({
    partner,
    to: order.contactEmail,
    subject: `${senderLabel} — order received (${order.orderNumber})`,
    html,
    replyTo: partner.replyToEmail || partner.contactEmail || null,
    emailType: "order_confirmation",
    orderId: order.id,
    attachments,
  });
}

// ---------------------------------------------------------------------------
// Multi-recipient routing
// ---------------------------------------------------------------------------
// Each partner can declare any number of email recipients with a structured
// role (ops, finance, partner_contact, vendor, cc, bcc). We fan out one email
// per role at order-submission time, with cc/bcc folded into the ops send.
//
// Backwards compatibility: when no recipients are configured for a role we
// fall back to the legacy partner-level fields:
//   ops              → partner.internalForwardEmail / partner.routingEmail
//   ops cc           → partner.ccEmail
//   finance          → partner.billingContactEmail
//   partner_contact  → partner.contactEmail
// This means existing partners keep working without any data migration.
// ---------------------------------------------------------------------------

export type RecipientsByRole = Record<RecipientRole, string[]>;

export async function getRecipientsByRole(partnerId: number): Promise<RecipientsByRole> {
  const rows = await db
    .select()
    .from(partnerEmailRecipientsTable)
    .where(and(
      eq(partnerEmailRecipientsTable.partnerId, partnerId),
      eq(partnerEmailRecipientsTable.isActive, true),
    ));
  const out: RecipientsByRole = { ops: [], finance: [], partner_contact: [], vendor: [], cc: [], bcc: [] };
  for (const r of rows) {
    const role = r.role as RecipientRole;
    if (out[role] === undefined) continue; // skip unknown roles defensively
    if (r.email) out[role].push(r.email);
  }
  return out;
}

function uniq(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (!s) continue;
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function resolveOpsRecipients(partner: Partner, configured: string[]): string[] {
  if (configured.length > 0) return uniq(configured);
  return uniq([partner.internalForwardEmail, partner.routingEmail]);
}
function resolveFinanceRecipients(partner: Partner, configured: string[]): string[] {
  if (configured.length > 0) return uniq(configured);
  return uniq([partner.billingContactEmail]);
}
function resolvePartnerContactRecipients(partner: Partner, configured: string[]): string[] {
  if (configured.length > 0) return uniq(configured);
  return uniq([partner.contactEmail]);
}

// ----- Templates -----------------------------------------------------------

function renderFinanceHtml(ctx: OrderEmailContext): string {
  const { partner, theme, order, event, venue } = ctx;
  const colors = resolveBrandColors(theme);
  const eventLine = event ? `${escapeHtml(event.name)}${event.eventDate ? ` · ${escapeHtml(new Date(event.eventDate).toLocaleDateString())}` : ""}` : "—";
  const venueLine = venue ? `${escapeHtml(venue.name)}${venue.city ? `, ${escapeHtml(venue.city)}` : ""}` : "—";
  const billing = (order.billingAddressJson as any) || null;
  const billLine = billing ? [billing.line1, billing.line2, billing.city, billing.region, billing.postalCode, billing.country].filter(Boolean).map(escapeHtml).join(", ") : "";
  return `${shellOpen(colors)}
    ${brandHeader(partner, colors)}
    <tr>
      <td style="padding:24px 32px;">
        <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Finance · new order</div>
        <h1 style="margin:0 0 4px 0;font-size:20px;color:${colors.text};">${escapeHtml(order.orderNumber)}</h1>
        <div style="font-size:13px;color:${colors.muted};">Submitted ${escapeHtml(new Date(order.createdAt).toLocaleString())}</div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;background:${colors.background};border-radius:10px;overflow:hidden;">
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};width:140px;">Bill to</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};font-weight:600;">${escapeHtml(order.companyName || order.contactName)}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Contact</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(order.contactName)} · <a href="mailto:${escapeHtml(order.contactEmail)}" style="color:${colors.primary};">${escapeHtml(order.contactEmail)}</a></td></tr>
          ${billLine ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Billing address</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${billLine}</td></tr>` : ""}
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Event</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${eventLine}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Venue</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${venueLine}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Payment status</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;font-weight:600;">${escapeHtml(order.paymentStatus || "not_charged")}</td></tr>
          ${partner.paymentTerms ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Terms</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(partner.paymentTerms)}</td></tr>` : ""}
          ${partner.depositRequired ? `<tr><td style="padding:8px 12px;font-size:12px;color:${colors.muted};border-top:1px solid ${colors.primary}14;">Deposit</td><td style="padding:8px 12px;font-size:13px;color:${colors.text};border-top:1px solid ${colors.primary}14;">${escapeHtml(partner.depositPct || "—")}%</td></tr>` : ""}
        </table>

        <div style="margin-top:20px;padding:14px 18px;border-radius:10px;background:${colors.primary}0a;border:1px solid ${colors.primary}1a;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${colors.muted};margin-bottom:4px;">Estimated total (${escapeHtml((order as any).currency || "USD")})</div>
          <div style="font-size:24px;font-weight:700;color:${colors.text};">${order.totalEstimate ? escapeHtml(formatCurrency(order.totalEstimate, (order as any).currency || "USD")) : "—"}</div>
        </div>

        ${partner.defaultBillingNotes ? `<div style="margin-top:18px;padding:12px;border-radius:8px;background:${colors.accent}10;border-left:3px solid ${colors.accent};font-size:13px;color:${colors.text};white-space:pre-wrap;">${escapeHtml(partner.defaultBillingNotes)}</div>` : ""}
      </td>
    </tr>
    ${brandFooter(partner, colors, partner.billingContactEmail || partner.replyToEmail)}
  ${shellClose()}`;
}

function renderPartnerContactHtml(ctx: OrderEmailContext): string {
  const { partner, theme, order, items, event, venue } = ctx;
  const colors = resolveBrandColors(theme);
  const eventLine = event ? `${escapeHtml(event.name)}${event.eventDate ? ` · ${escapeHtml(new Date(event.eventDate).toLocaleDateString())}` : ""}` : "";
  const venueLine = venue ? `${escapeHtml(venue.name)}${venue.city ? `, ${escapeHtml(venue.city)}` : ""}` : "";
  return `${shellOpen(colors)}
    ${brandHeader(partner, colors)}
    <tr>
      <td style="padding:32px;">
        <h1 style="margin:0 0 8px 0;font-size:22px;color:${colors.text};">A new order is in</h1>
        <p style="margin:0 0 20px 0;font-size:14px;color:${colors.muted};line-height:1.5;">A customer just submitted an order through your portal. Here's a quick summary so you can stay in the loop.</p>

        <div style="background:${colors.background};border:1px solid ${colors.primary}1a;border-radius:10px;padding:16px;margin-bottom:18px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${colors.muted};margin-bottom:4px;">Reference</div>
          <div style="font-size:18px;font-weight:700;color:${colors.text};font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(order.orderNumber)}</div>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
          <tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};width:110px;">Customer</td><td style="padding:6px 0;font-size:13px;color:${colors.text};font-weight:600;">${escapeHtml(order.contactName)}${order.companyName ? ` · ${escapeHtml(order.companyName)}` : ""}</td></tr>
          ${eventLine ? `<tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};">Event</td><td style="padding:6px 0;font-size:13px;color:${colors.text};">${eventLine}</td></tr>` : ""}
          ${venueLine ? `<tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};">Venue</td><td style="padding:6px 0;font-size:13px;color:${colors.text};">${venueLine}</td></tr>` : ""}
          <tr><td style="padding:6px 0;font-size:13px;color:${colors.muted};">Items</td><td style="padding:6px 0;font-size:13px;color:${colors.text};">${items.length}</td></tr>
        </table>

        ${renderItemsTable(items, colors, { showPricing: !!partner.pricingDisplayEnabled, currency: (order as any).currency || "USD" })}

        <div style="margin-top:22px;padding:14px;border-radius:8px;background:${colors.primary}08;font-size:13px;color:${colors.muted};line-height:1.5;">
          The ops team has been notified and will follow up with the customer. No action is required from you unless flagged separately.
        </div>
      </td>
    </tr>
    ${brandFooter(partner, colors, partner.replyToEmail || partner.contactEmail)}
  ${shellClose()}`;
}

// ----- Senders -------------------------------------------------------------

export async function sendInternalOrderForward(ctx: OrderEmailContext): Promise<SendResult> {
  // Legacy alias retained for any external caller. The new pipeline uses
  // sendOpsForward which understands configured recipients.
  return sendOpsForward(ctx);
}

export async function sendOpsForward(ctx: OrderEmailContext, overrideTo?: string[]): Promise<SendResult> {
  const { partner, order } = ctx;
  const recipients = await getRecipientsByRole(partner.id);
  const to = overrideTo && overrideTo.length > 0
    ? uniq(overrideTo)
    : resolveOpsRecipients(partner, recipients.ops);
  if (to.length === 0) return { ok: false, error: "no_ops_recipient" };
  // Legacy partner.ccEmail is only a fallback — if any role-based cc
  // recipients are configured, the legacy field is ignored to avoid leaking
  // order data to stale addresses after a partner migrates to the new model.
  const cc = (recipients.cc && recipients.cc.length > 0)
    ? uniq(recipients.cc)
    : uniq([partner.ccEmail]);
  const bcc = uniq(recipients.bcc || []);
  const html = renderInternalForwardHtml(ctx);
  const attachments = await maybeAttach(ctx, "internal", !!partner.attachPdfOps);
  return sendBrandedEmail({
    partner,
    to,
    cc: cc.length > 0 ? cc : null,
    bcc: bcc.length > 0 ? bcc : null,
    subject: `[New order] ${partner.companyName} · ${order.orderNumber}`,
    html,
    replyTo: order.contactEmail,
    emailType: "order_ops_forward",
    orderId: order.id,
    attachments,
  });
}

export async function sendFinanceNotification(ctx: OrderEmailContext, overrideTo?: string[]): Promise<SendResult> {
  const { partner, order } = ctx;
  const recipients = await getRecipientsByRole(partner.id);
  const to = overrideTo && overrideTo.length > 0
    ? uniq(overrideTo)
    : resolveFinanceRecipients(partner, recipients.finance);
  if (to.length === 0) return { ok: false, error: "no_finance_recipient" };
  const attachments = await maybeAttach(ctx, "finance", !!partner.attachPdfFinance);
  return sendBrandedEmail({
    partner,
    to,
    subject: `[Finance] ${partner.companyName} · ${order.orderNumber}`,
    html: renderFinanceHtml(ctx),
    replyTo: partner.billingContactEmail || partner.replyToEmail || order.contactEmail,
    emailType: "order_finance_notification",
    orderId: order.id,
    attachments,
  });
}

export async function sendPartnerContactNotification(ctx: OrderEmailContext, overrideTo?: string[]): Promise<SendResult> {
  const { partner, order } = ctx;
  const recipients = await getRecipientsByRole(partner.id);
  const to = overrideTo && overrideTo.length > 0
    ? uniq(overrideTo)
    : resolvePartnerContactRecipients(partner, recipients.partner_contact);
  if (to.length === 0) return { ok: false, error: "no_partner_contact_recipient" };
  // Partner contacts get the customer-facing PDF (clean, no internal pricing
  // or supplier details) when attachments are enabled for that audience.
  const attachments = await maybeAttach(ctx, "customer", !!partner.attachPdfPartnerContact);
  return sendBrandedEmail({
    partner,
    to,
    subject: `New order received · ${order.orderNumber}`,
    html: renderPartnerContactHtml(ctx),
    replyTo: partner.replyToEmail || partner.contactEmail || order.contactEmail,
    emailType: "order_partner_contact_notification",
    orderId: order.id,
    attachments,
  });
}

export async function sendVendorNotification(ctx: OrderEmailContext, overrideTo?: string[]): Promise<SendResult> {
  const { partner, order } = ctx;
  const recipients = await getRecipientsByRole(partner.id);
  const to = overrideTo && overrideTo.length > 0 ? uniq(overrideTo) : uniq(recipients.vendor);
  if (to.length === 0) return { ok: false, error: "no_vendor_recipient" };
  // Vendors get the operational view (same template) so they can act on the
  // order. A dedicated vendor template can be split out later if needed.
  return sendBrandedEmail({
    partner,
    to,
    subject: `[Vendor] ${partner.companyName} · ${order.orderNumber}`,
    html: renderInternalForwardHtml(ctx),
    replyTo: partner.replyToEmail || partner.contactEmail || order.contactEmail,
    emailType: "order_vendor_notification",
    orderId: order.id,
  });
}

export interface OrderEmailFanoutResult {
  confirmation: SendResult;
  ops: SendResult;
  finance: SendResult;
  partnerContact: SendResult;
  vendor: SendResult;
  // Legacy alias so existing callers reading `forward` keep working.
  forward: SendResult;
}

/**
 * Convenience for the order submission pipeline. Sends every audience-specific
 * email in parallel, never throws — caller should treat result as best-effort
 * metadata.
 *
 * Each role independently resolves its recipient list. Roles with no
 * configured recipients (and no legacy fallback) return `{ ok: false }` with a
 * "no_..._recipient" error and do not produce a Resend call. This makes it
 * easy for the UI to render a per-role status pill.
 */
export async function sendOrderEmails(orderId: number): Promise<OrderEmailFanoutResult> {
  const ctx = await buildOrderEmailContext(orderId);
  if (!ctx) {
    const notFound: SendResult = { ok: false, error: "order_not_found" };
    return { confirmation: notFound, ops: notFound, finance: notFound, partnerContact: notFound, vendor: notFound, forward: notFound };
  }
  const safe = (p: Promise<SendResult>): Promise<SendResult> =>
    p.catch((err) => ({ ok: false, error: String(err?.message || err) }) as SendResult);
  const [confirmation, ops, finance, partnerContact, vendor] = await Promise.all([
    safe(sendOrderConfirmation(ctx)),
    safe(sendOpsForward(ctx)),
    safe(sendFinanceNotification(ctx)),
    safe(sendPartnerContactNotification(ctx)),
    safe(sendVendorNotification(ctx)),
  ]);
  return { confirmation, ops, finance, partnerContact, vendor, forward: ops };
}

export function emailConfigStatus(partner: Partial<Partner>): { ready: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!partner.emailEnabled) warnings.push("Outbound email is disabled for this partner.");
  if (!partner.internalForwardEmail && !partner.routingEmail) missing.push("internal_forward_email");
  if (!partner.replyToEmail && !partner.contactEmail) warnings.push("No reply-to or contact email set — replies will route to the default sender.");
  if (!partner.emailFromName) warnings.push("No 'from name' set — the company name will be used.");
  return { ready: missing.length === 0, missing, warnings };
}
