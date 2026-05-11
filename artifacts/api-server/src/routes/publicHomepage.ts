import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, partnershipRequestsTable } from "@workspace/db";
import { getUncachableResendClient } from "../lib/resend";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PARTNER_TYPES = [
  "Hotel or Resort",
  "Venue",
  "Event",
  "Toured Event",
  "Festival or Market",
  "Sports or Entertainment",
  "Agency or Producer",
  "Corporate Brand",
  "Retail or Pop-Up Program",
  "Other",
] as const;

const USE_CASES = [
  "Public customer-facing portal",
  "Private password-protected portal",
  "Vendor or exhibitor ordering portal",
  "Internal event team portal",
  "Multi-location or toured event portal",
  "Not sure yet",
] as const;

const VOLUMES = [
  "One-time event",
  "Recurring monthly",
  "Seasonal",
  "Annual event",
  "Multi-city or national program",
  "Ongoing partnership",
] as const;

const PartnershipRequestBody = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional().nullable(),
  partnerType: z.enum(PARTNER_TYPES).optional().nullable(),
  portalUseCase: z.enum(USE_CASES).optional().nullable(),
  estimatedVolume: z.enum(VOLUMES).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.post("/public/partnership-requests", async (req, res) => {
  const parsed = PartnershipRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid submission", details: parsed.error.issues });
    return;
  }

  try {
    const [row] = await db
      .insert(partnershipRequestsTable)
      .values(parsed.data)
      .returning({ id: partnershipRequestsTable.id });

    // Fire-and-forget admin notification — never block the response on email
    void (async () => {
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        const to = process.env.PARTNERSHIP_NOTIFY_EMAIL || fromEmail;
        if (!to) return;
        const d = parsed.data;
        const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;">
  <div style="background:#0E1B3D;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7;">Partnership Portal</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px;">New partnership request</div>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
    <table cellpadding="6" cellspacing="0" style="font-size:14px;border-collapse:collapse;width:100%;">
      <tr><td style="color:#64748b;width:140px;">Company</td><td style="font-weight:600;">${escapeHtml(d.companyName)}</td></tr>
      <tr><td style="color:#64748b;">Contact</td><td>${escapeHtml(d.contactName)}</td></tr>
      <tr><td style="color:#64748b;">Email</td><td><a href="mailto:${escapeHtml(d.email)}" style="color:#0E1B3D;">${escapeHtml(d.email)}</a></td></tr>
      ${d.phone ? `<tr><td style="color:#64748b;">Phone</td><td>${escapeHtml(d.phone)}</td></tr>` : ""}
      ${d.partnerType ? `<tr><td style="color:#64748b;">Partner type</td><td>${escapeHtml(d.partnerType)}</td></tr>` : ""}
      ${d.portalUseCase ? `<tr><td style="color:#64748b;">Use case</td><td>${escapeHtml(d.portalUseCase)}</td></tr>` : ""}
      ${d.estimatedVolume ? `<tr><td style="color:#64748b;">Volume</td><td>${escapeHtml(d.estimatedVolume)}</td></tr>` : ""}
    </table>
    ${d.message ? `<div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border-left:3px solid #E9B947;"><div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.06em;margin-bottom:6px;">Message</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(d.message)}</div></div>` : ""}
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">Reply directly to this email to reach <strong>${escapeHtml(d.contactName)}</strong>.</div>
  </div>
</div>`;
        await client.emails.send({
          from: fromEmail || "noreply@resend.dev",
          to,
          subject: `New partnership request — ${d.companyName}`,
          html,
          reply_to: d.email,
        } as Parameters<typeof client.emails.send>[0]);
      } catch (err) {
        logger.warn({ err }, "partnership_request notification email failed");
      }
    })();

    res.status(201).json({ id: row.id });
  } catch (err) {
    logger.error({ err }, "Failed to save partnership request");
    res.status(500).json({ error: "Failed to save request" });
  }
});

export default router;
