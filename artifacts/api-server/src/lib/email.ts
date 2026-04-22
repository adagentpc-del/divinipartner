import { getUncachableResendClient } from "./resend";
import { logger } from "./logger";
import { db, partnersTable, partnerThemesTable, ordersTable, orderItemsTable, eventsTable, venuesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!isFinite(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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

function renderItemsTable(items: OrderItem[], colors: BrandColors, opts: { showPricing: boolean }): string {
  if (!items.length) return "";
  const rows = items.map((it) => {
    const price = opts.showPricing ? formatCurrency(it.unitPrice) : "";
    const lineTotal = opts.showPricing && it.unitPrice ? formatCurrency(Number(it.unitPrice) * (it.quantity || 1)) : "";
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
        ${renderItemsTable(items, colors, { showPricing })}
        ${showPricing && order.totalEstimate ? `<div style="text-align:right;margin-top:12px;font-size:14px;color:${colors.text};"><span style="color:${colors.muted};">Estimated total: </span><strong>${escapeHtml(order.totalEstimate)}</strong></div>` : ""}

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
        ${renderItemsTable(items, colors, { showPricing: true })}
        ${order.totalEstimate ? `<div style="text-align:right;margin-top:10px;font-size:14px;color:${colors.text};"><span style="color:${colors.muted};">Estimated total: </span><strong>${escapeHtml(order.totalEstimate)}</strong></div>` : ""}

        ${order.notes ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#fffbe6;border-left:3px solid #f59e0b;"><div style="font-size:12px;font-weight:700;color:${colors.text};margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Customer notes</div><div style="font-size:13px;color:${colors.text};white-space:pre-wrap;">${escapeHtml(order.notes)}</div></div>` : ""}

        ${artwork.length ? `<div style="margin-top:20px;"><div style="font-size:12px;font-weight:700;color:${colors.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">Artwork (${artwork.length})</div><ul style="margin:0;padding-left:18px;font-size:13px;">${artwork.map(a => `<li><a href="${escapeHtml(a.url)}" style="color:${colors.primary};">${escapeHtml(a.name || a.url)}</a></li>`).join("")}</ul></div>` : ""}
      </td>
    </tr>
    ${brandFooter(partner, colors, partner.replyToEmail || partner.contactEmail)}
  ${shellClose()}`;
}

export interface SendResult { ok: boolean; id?: string; error?: string; }

async function sendBrandedEmail(params: {
  partner: Partner;
  to: EmailRecipient;
  cc?: EmailRecipient | null;
  subject: string;
  html: string;
  replyTo?: string | null;
  emailType: string;
  orderId?: number | null;
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
    if (params.replyTo) sendArgs.reply_to = params.replyTo;
    const result = await client.emails.send(sendArgs);
    const id = (result as any)?.data?.id || (result as any)?.id;
    emit("email.sent", {
      partnerId: params.partner.id,
      objectType: "order",
      objectId: params.orderId ?? null,
      meta: { type: params.emailType, to: params.to, subject: params.subject, providerId: id },
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

export async function sendOrderConfirmation(ctx: OrderEmailContext): Promise<SendResult> {
  const { partner, order } = ctx;
  if (!order.contactEmail) return { ok: false, error: "no_customer_email" };
  const html = renderCustomerConfirmationHtml(ctx);
  const senderLabel = partner.emailSenderLabel || partner.companyName;
  return sendBrandedEmail({
    partner,
    to: order.contactEmail,
    subject: `${senderLabel} — order received (${order.orderNumber})`,
    html,
    replyTo: partner.replyToEmail || partner.contactEmail || null,
    emailType: "order_confirmation",
    orderId: order.id,
  });
}

export async function sendInternalOrderForward(ctx: OrderEmailContext): Promise<SendResult> {
  const { partner, order } = ctx;
  const to = partner.internalForwardEmail || partner.routingEmail;
  if (!to) return { ok: false, error: "no_internal_forward_address" };
  const html = renderInternalForwardHtml(ctx);
  return sendBrandedEmail({
    partner,
    to,
    cc: partner.ccEmail || null,
    subject: `[New order] ${partner.companyName} · ${order.orderNumber}`,
    html,
    replyTo: order.contactEmail,
    emailType: "order_internal_forward",
    orderId: order.id,
  });
}

/**
 * Convenience for the order submission pipeline. Sends both emails in parallel,
 * never throws — caller should treat result as best-effort metadata.
 */
export async function sendOrderEmails(orderId: number): Promise<{ confirmation: SendResult; forward: SendResult }> {
  const ctx = await buildOrderEmailContext(orderId);
  if (!ctx) {
    return {
      confirmation: { ok: false, error: "order_not_found" },
      forward: { ok: false, error: "order_not_found" },
    };
  }
  const [confirmation, forward] = await Promise.all([
    sendOrderConfirmation(ctx).catch((err) => ({ ok: false, error: String(err?.message || err) }) as SendResult),
    sendInternalOrderForward(ctx).catch((err) => ({ ok: false, error: String(err?.message || err) }) as SendResult),
  ]);
  return { confirmation, forward };
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
