import { getUncachableResendClient } from "./resend";
import { logger } from "./logger";
import { db, salesRepsTable, type SalesRep } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface SalesSendResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
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

/** The address we actually deliver to for a rep: explicit notification email first, then login email. */
export function repNotificationAddress(rep: Pick<SalesRep, "notificationEmail" | "email">): string | null {
  return rep.notificationEmail || rep.email || null;
}

async function activeSuperAdminAddresses(): Promise<string[]> {
  const admins = await db
    .select({ email: salesRepsTable.email, notificationEmail: salesRepsTable.notificationEmail })
    .from(salesRepsTable)
    .where(and(eq(salesRepsTable.role, "super_admin"), eq(salesRepsTable.status, "active")));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of admins) {
    const addr = a.notificationEmail || a.email;
    const key = addr?.trim().toLowerCase();
    if (addr && key && !seen.has(key)) {
      seen.add(key);
      out.push(addr);
    }
  }
  return out;
}

const ROUTING_LABELS: Record<string, string> = {
  account_match: "Matched to an existing account",
  link_source: "Routed by intake link",
  super_admin_queue: "Unassigned — Super Admin review queue",
};

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:12px;color:#64748b;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;font-size:13px;color:#0f172a;font-weight:600;">${value || "—"}</td>
  </tr>`;
}

function leadHtml(params: {
  heading: string;
  intro: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  formLabel: string;
  routingMethod: string | null;
  assignedRepName: string | null;
  link: string | null;
}): string {
  const routing = params.routingMethod ? ROUTING_LABELS[params.routingMethod] || params.routingMethod : "—";
  const contactEmailCell = params.contactEmail
    ? `<a href="mailto:${escapeHtml(params.contactEmail)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(params.contactEmail)}</a>`
    : "—";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <div style="padding:22px 28px;background:linear-gradient(135deg,#0f1729,#1e293b);color:#fff;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#fbbf24;font-weight:700;">A3 Visual · Sales Intake</div>
        <h1 style="margin:6px 0 0 0;font-size:19px;">${escapeHtml(params.heading)}</h1>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.5;color:#475569;">${escapeHtml(params.intro)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:10px;overflow:hidden;">
          ${row("Company", escapeHtml(params.companyName))}
          ${row("Contact", escapeHtml(params.contactName || ""))}
          ${row("Email", contactEmailCell)}
          ${row("Phone", escapeHtml(params.contactPhone || ""))}
          ${row("Form", escapeHtml(params.formLabel))}
          ${row("Routing", escapeHtml(routing))}
          ${row("Assigned to", escapeHtml(params.assignedRepName || "Super Admin queue"))}
        </table>
        ${params.link ? `<div style="text-align:center;margin-top:24px;">
          <a href="${escapeHtml(params.link)}" style="display:inline-block;padding:12px 24px;background:#0f1729;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open in portal</a>
        </div>` : ""}
        <p style="margin:22px 0 0 0;font-size:12px;color:#94a3b8;">You're receiving this because a new intake was routed to you in the A3 Visual sales portal.</p>
      </div>
    </div>
  </body></html>`;
}

async function send(to: string | string[], subject: string, html: string, kind: string): Promise<SalesSendResult> {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) {
    logger.warn({ kind }, "sales email skipped — no recipients");
    return { ok: false, skipped: true, error: "no_recipients" };
  }
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const from = fromEmail || "A3 Visual <noreply@resend.dev>";
    const result = await client.emails.send({ from, to: recipients, subject, html });
    const id = (result as any)?.data?.id || (result as any)?.id;
    logger.info({ kind, id, count: recipients.length }, "sales email sent");
    return { ok: true, id };
  } catch (err: any) {
    const error = err?.message || String(err);
    logger.error({ err, kind }, "sales email send failed");
    return { ok: false, error };
  }
}

/**
 * Notify the right person when a public intake is routed:
 *   - assigned rep  → that rep's notification address
 *   - unassigned    → all active Super Admins (the review queue)
 * Never throws — a delivery failure must not break the public submission.
 */
export async function sendIntakeRoutedNotification(params: {
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  formType: string;
  routingMethod: string | null;
  assignedRep: SalesRep | null;
  opportunityId: number | null;
}): Promise<SalesSendResult> {
  const formLabel = params.formType === "pole_banner" ? "Pole Banner Program Intake" : "General Project Intake";
  let link: string | null = null;
  try {
    const { publicLink, warnIfFallback } = await import("./publicUrl");
    warnIfFallback();
    link = publicLink("/admin/sales-intake");
  } catch {
    link = null;
  }

  if (params.assignedRep) {
    const to = repNotificationAddress(params.assignedRep);
    const repName = `${params.assignedRep.firstName} ${params.assignedRep.lastName}`.trim();
    const html = leadHtml({
      heading: `New lead: ${params.companyName}`,
      intro: `A new ${formLabel.toLowerCase()} just came in and was routed to you.`,
      companyName: params.companyName,
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone,
      formLabel,
      routingMethod: params.routingMethod,
      assignedRepName: repName,
      link,
    });
    return send(to ?? [], `New lead routed to you — ${params.companyName}`, html, "intake_routed_rep");
  }

  // Unassigned → Super Admin queue.
  const admins = await activeSuperAdminAddresses();
  const html = leadHtml({
    heading: `Unassigned lead: ${params.companyName}`,
    intro: `A new ${formLabel.toLowerCase()} came in but could not be matched to a rep. It's waiting in the Super Admin review queue for assignment.`,
    companyName: params.companyName,
    contactName: params.contactName,
    contactEmail: params.contactEmail,
    contactPhone: params.contactPhone,
    formLabel,
    routingMethod: params.routingMethod,
    assignedRepName: null,
    link,
  });
  return send(admins, `New unassigned lead — ${params.companyName}`, html, "intake_routed_queue");
}
