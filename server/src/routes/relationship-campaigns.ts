/**
 * WS-3 - Relationship Campaigns routes. Mount base: /api/relationship-campaigns.
 * Requires a signed-in user; every op is scoped to the caller's own org. This is
 * NOT the admin cold-outreach tool: it targets the org's own saved partners or a
 * past event's roster, for annual rebooking.
 *
 *   GET    /                     list the org's campaigns
 *   POST   /                     draft { name, audience, subject, body_html, cta_* }
 *   GET    /:id                  campaign + resolved recipients
 *   PATCH  /:id                  edit a draft
 *   DELETE /:id                  delete
 *   POST   /:id/resolve          expand + persist recipients from the audience
 *   POST   /:id/test             send only to the caller
 *   POST   /:id/send             approve + send to all resolved recipients
 *
 * The actual dispatch is gated by REL_CAMPAIGNS_ENABLED (default on; set to
 * "false" to disable sends platform-wide). sendEmail itself no-ops when no email
 * provider is configured, so this is always safe to call.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as rc from "../db/relationshipCampaigns.js";
import { sendEmail } from "../lib/email.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function sendsEnabled(): boolean {
  return (process.env.REL_CAMPAIGNS_ENABLED ?? "true").toLowerCase() !== "false";
}

/**
 * Read-only / individual roles must not create or dispatch campaigns (they could
 * otherwise email the org's whole partner list). Owner-scoping is separate; this
 * is an intra-org role gate on the sensitive write/send actions.
 */
const NON_OPERATOR_ROLES = new Set(["viewer", "donor", "volunteer"]);
function assertOperator(a: db.Actor): void {
  if (NON_OPERATOR_ROLES.has(a.user.role ?? "")) {
    throw new db.ForbiddenError("your role cannot create or send campaigns");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

/** Compose the campaign HTML: the drafted body plus a single CTA button. */
function renderEmail(subject: string, bodyHtml: string | null, ctaUrl: string): { html: string; text: string } {
  const body = bodyHtml && bodyHtml.trim() ? bodyHtml : `<p>${escapeHtml(subject)}</p>`;
  const button = `<p style="margin:24px 0"><a href="${ctaUrl}" style="background:#123c2e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Rebook now</a></p>`;
  const html = `${body}${button}<p style="font-size:12px;color:#7d776c;margin-top:8px">Or open: ${ctaUrl}</p>`;
  const text = `${bodyHtml ? bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : subject}\n\nRebook now: ${ctaUrl}`;
  return { html, text };
}

const router = Router();
router.use(requireUser);

router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ campaigns: await rc.listCampaigns(a) });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    assertOperator(a);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    res.status(201).json({ campaign: await rc.createCampaign(a, req.body) });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const campaign = await rc.getCampaign(a, req.params.id);
    const recipients = await rc.listRecipients(a, req.params.id);
    res.json({ campaign, recipients });
  }),
);

router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ campaign: await rc.updateCampaign(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await rc.deleteCampaign(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "campaign not found" });
    res.status(204).end();
  }),
);

/** Expand the audience into a persisted recipient list. */
router.post(
  "/:id/resolve",
  h(async (req, res) => {
    const a = await actor(req);
    const recipients = await rc.resolveAudience(a, req.params.id);
    res.json({ recipients, recipient_count: recipients.length });
  }),
);

/** Send a test to the caller's own email. */
router.post(
  "/:id/test",
  h(async (req, res) => {
    const a = await actor(req);
    assertOperator(a);
    const campaign = await rc.getCampaign(a, req.params.id);
    const to = a.user.email;
    if (!to) return res.status(400).json({ error: "no email on your account" });
    const { html, text } = renderEmail(campaign.subject ?? campaign.name, campaign.body_html, rc.buildCtaUrl(campaign));
    await sendEmail({ to, subject: `[Test] ${campaign.subject ?? campaign.name}`, html, text }).catch(() => null);
    await rc.markTestSent(a, req.params.id);
    res.json({ ok: true, sent_to: to });
  }),
);

/** Approve + send to every resolved recipient. The single real-send gate. */
router.post(
  "/:id/send",
  h(async (req, res) => {
    const a = await actor(req);
    assertOperator(a);
    if (!sendsEnabled()) {
      return res.status(403).json({ error: "Relationship campaigns are currently disabled." });
    }
    const campaign = await rc.getCampaign(a, req.params.id);
    // Resolve fresh so the send targets the current audience.
    const recipients = await rc.resolveAudience(a, req.params.id);
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients. Save partners or pick an event roster first." });
    }
    const ctaUrl = rc.buildCtaUrl(campaign);
    const { html, text } = renderEmail(campaign.subject ?? campaign.name, campaign.body_html, ctaUrl);
    let sent = 0;
    for (const r of recipients) {
      const result = await sendEmail({
        to: r.email,
        subject: campaign.subject ?? campaign.name,
        html,
        text,
      }).catch(() => ({ ok: false }) as { ok: boolean });
      const ok = !!result?.ok;
      if (ok) sent += 1;
      await rc.markRecipientSent(r.id, ok);
    }
    await rc.markSent(a, req.params.id, sent);
    res.json({ ok: true, recipient_count: recipients.length, sent_count: sent });
  }),
);

export default router;
