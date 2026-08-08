/**
 * Email transport. Provider-agnostic send over HTTP (no SMTP dependency):
 * Resend or Postal, chosen by EMAIL_PROVIDER. Feature-flagged: when nothing is
 * configured, sendEmail() logs and reports skipped (the prior stub behavior), so
 * call sites work in every environment.
 *
 * Zero em dashes.
 */
import {
  EMAIL_PROVIDER,
  EMAIL_API_KEY,
  EMAIL_FROM,
  POSTAL_API_URL,
  PUBLIC_APP_URL,
  BASE_PATH,
  COMPANY_LEGAL_NAME,
  COMPANY_POSTAL_ADDRESS,
  emailEnabled,
} from "../config.js";
import { isEmailSuppressed, addSuppression } from "../db/communicationSuppressions.js";
import { RESEND_WEBHOOK_SECRET } from "../config.js";
import crypto from "node:crypto";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  /**
   * When present, self-hosted open/click tracking is woven into the HTML body:
   * an invisible 1x1 pixel records opens and every href is rewritten through the
   * tracked redirect. This is the claim_outreach row id, so events tie back to
   * the outreach record. When absent (all transactional mail) the body is sent
   * untouched, which keeps deliverability and compliance clean.
   */
  trackingRef?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

function recipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean);
}

/** Minimal, brand-consistent HTML wrapper when only text is supplied. */
function wrapHtml(subject: string, text: string): string {
  const body = text
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br/>" : `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`))
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;color:#2c2a26;max-width:560px;margin:0 auto;padding:24px">
  <div style="font-family:Georgia,serif;font-size:22px;color:#123c2e;font-weight:700;margin-bottom:16px">Divini Partners</div>
  <h1 style="font-family:Georgia,serif;font-size:20px;color:#123c2e;font-weight:600;margin:0 0 14px">${escapeHtml(subject)}</h1>
  ${body}
  <div style="margin-top:22px;border-top:1px solid #e7e1d6;padding-top:14px;font-size:12px;color:#7d776c">Divini Partners by ${escapeHtml(COMPANY_LEGAL_NAME)}<br/>${escapeHtml(COMPANY_POSTAL_ADDRESS)}</div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Absolute base for self-hosted tracking endpoints (PUBLIC_APP_URL + BASE_PATH). */
function trackingBase(): string {
  return (PUBLIC_APP_URL || "https://divinipartners.com") + BASE_PATH;
}

/**
 * Weave self-hosted open/click tracking into an HTML body:
 *   - rewrite every http/https href to the tracked redirect /api/e/c/:ref?u=...
 *   - append an invisible 1x1 open pixel /api/e/o/:ref
 * Recipient (the first address) is passed through as ?r= for per-recipient
 * attribution. Only the on-platform tracking links carry it; the original
 * destinations are preserved inside the ?u= parameter.
 */
function applyTracking(html: string, ref: string, recipient: string): string {
  const base = trackingBase();
  const r = encodeURIComponent(recipient);
  const encRef = encodeURIComponent(ref);

  const rewritten = html.replace(
    /href\s*=\s*"(https?:\/\/[^"]+)"/gi,
    (_m, original: string) =>
      `href="${base}/api/e/c/${encRef}?u=${encodeURIComponent(original)}&r=${r}"`,
  );

  const pixel = `<img src="${base}/api/e/o/${encRef}?r=${r}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`;

  if (/<\/body>/i.test(rewritten)) {
    return rewritten.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return rewritten + pixel;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  let to = recipients(msg.to);
  if (to.length === 0) return { ok: false, error: "no recipients" };
  // Suppression check (ALFY2 pack Section 10): a hard bounce or spam
  // complaint on any address, from any prior send through this shared
  // transport, silently drops that address from this send rather than
  // repeatedly emailing it. Fails open on a DB error (better to attempt
  // delivery than to silently drop all mail because a check failed).
  const suppressed = await Promise.all(to.map((addr) => isEmailSuppressed(addr).catch(() => false)));
  to = to.filter((_, i) => !suppressed[i]);
  if (to.length === 0) return { ok: false, error: "all recipients suppressed" };
  if (!emailEnabled()) {
     
    console.log(`[email:disabled] to=${to.join(", ")} subject="${msg.subject}"`);
    return { ok: false, skipped: true };
  }
  let html = msg.html || wrapHtml(msg.subject, msg.text || msg.subject);
  const text = msg.text || msg.subject;
  // Only claim outreach passes trackingRef; transactional mail stays untracked.
  if (msg.trackingRef) {
    html = applyTracking(html, msg.trackingRef, to[0]!);
  }
  try {
    if (EMAIL_PROVIDER === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${EMAIL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to, subject: msg.subject, html, text, reply_to: msg.replyTo }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return { ok: false, error: String((json.message as string) ?? res.status) };
      return { ok: true, id: String((json.id as string) ?? "") };
    }
    if (EMAIL_PROVIDER === "postal") {
      const res = await fetch(`${POSTAL_API_URL}/api/v1/send/message`, {
        method: "POST",
        headers: { "X-Server-API-Key": EMAIL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          from: EMAIL_FROM,
          subject: msg.subject,
          plain_body: text,
          html_body: html,
          reply_to: msg.replyTo,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.status === "error") {
        return { ok: false, error: String((json.message as string) ?? `postal ${res.status}`) };
      }
      const data = (json.data as { message_id?: string } | undefined) ?? {};
      return { ok: true, id: String(data.message_id ?? "") };
    }
    return { ok: false, error: `unknown EMAIL_PROVIDER: ${EMAIL_PROVIDER}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Resend delivery-event webhook (bounce/complaint auto-suppression, ALFY2
// pack Section 10). Resend signs webhooks the same way Svix does: headers
// svix-id / svix-timestamp / svix-signature, signed content
// "{id}.{timestamp}.{body}", secret is "whsec_<base64 key>", HMAC-SHA256,
// base64-encoded, and svix-signature carries one or more space-separated
// "v1,<base64sig>" values -- any match is valid (supports secret rotation).
// ---------------------------------------------------------------------------

/**
 * Verify a Resend/Svix-signed webhook. Returns the parsed JSON body when the
 * signature is valid, or null on any failure (unconfigured secret, missing
 * headers, bad signature, unparseable body). Never throws.
 */
export function verifyResendWebhook(
  rawBody: Buffer | string,
  headers: { id?: string; timestamp?: string; signature?: string },
): Record<string, unknown> | null {
  if (!RESEND_WEBHOOK_SECRET || !headers.id || !headers.timestamp || !headers.signature) return null;
  // M1 (same rationale as Stripe's verifier): bound the timestamp to defeat replay.
  const tsec = Number(headers.timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsec) || Math.abs(nowSeconds - tsec) > 300) return null;

  const secretB64 = RESEND_WEBHOOK_SECRET.startsWith("whsec_")
    ? RESEND_WEBHOOK_SECRET.slice("whsec_".length)
    : RESEND_WEBHOOK_SECRET;
  let key: Buffer;
  try {
    key = Buffer.from(secretB64, "base64");
  } catch {
    return null;
  }
  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedContent = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const candidates = headers.signature.split(" ").map((v) => v.split(",")[1]).filter(Boolean) as string[];
  const a = Buffer.from(expected);
  const matched = candidates.some((c) => {
    const b = Buffer.from(c, "base64");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!matched) return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Apply a verified Resend delivery event to the suppression list. Only
 * bounce and complaint events suppress (delivery/open/click are ignored
 * here -- open/click for claim outreach specifically is already handled by
 * the self-hosted tracking pixel/redirect, not this webhook).
 */
export async function applyResendDeliveryEvent(event: Record<string, unknown>): Promise<void> {
  const type = String(event.type ?? "");
  const data = (event.data as Record<string, unknown> | undefined) ?? {};
  const to = data.to;
  const addresses = Array.isArray(to) ? to.filter((x): x is string => typeof x === "string") : typeof to === "string" ? [to] : [];
  if (addresses.length === 0) return;
  const reason = type === "email.bounced" ? "bounce" : type === "email.complained" ? "complaint" : null;
  if (!reason) return;
  await Promise.all(addresses.map((addr) => addSuppression(addr, reason, "resend_webhook")));
}

export { emailEnabled };
