/**
 * Admin Email Campaigns routes. Mount base: /api/admin/campaigns.
 *
 * Draft -> test (to the admin) -> approve-send (the explicit gate that mails the
 * resolved audience). The audience is discovered_businesses minus the claim
 * suppression list, so unsubscribe/removal/bounce suppression is honored. ALL
 * routes are requireAdmin. Mirrors the routes/admin.ts style (h() wrapper).
 *
 * Zero em dashes in this file.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as campaigns from "../db/campaigns.js";
import { sendEmail } from "../lib/email.js";
import { getAdminAllowedEmails } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireAdmin);

// POST / : create a draft campaign.
router.post(
  "/",
  h(async (req, res) => {
    const { name, audience, subject, bodyHtml } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    if (!subject || typeof subject !== "string")
      return res.status(400).json({ error: "subject required" });
    const kind = (audience?.kind as campaigns.AudienceKind) ?? "all";
    const auth = getAuth(req);
    const campaign = await campaigns.createCampaign({
      name,
      audience: { kind },
      subject,
      bodyHtml: typeof bodyHtml === "string" ? bodyHtml : "",
      createdByEmail: auth.email ?? null,
    });
    res.json({ campaign });
  }),
);

// GET / : list campaigns newest first.
router.get(
  "/",
  h(async (_req, res) => {
    res.json({ campaigns: await campaigns.listCampaigns() });
  }),
);

// GET /:id : a campaign plus a capped preview of the resolved audience.
router.get(
  "/:id",
  h(async (req, res) => {
    const campaign = await campaigns.getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: "not found" });
    const recipients = await campaigns.resolveAudience(campaign.audience, 500);
    res.json({ campaign, recipients });
  }),
);

// POST /:id/test : render and send a TEST to the admin allowlist's first email.
router.post(
  "/:id/test",
  h(async (req, res) => {
    const campaign = await campaigns.getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: "not found" });
    const to = getAdminAllowedEmails()[0];
    if (!to) return res.status(400).json({ error: "no admin email configured for test send" });
    const footer = `<hr/><p style="font-size:12px;color:#7d776c">This is a TEST send of the "${escapeHtml(
      campaign.name,
    )}" campaign. No audience recipients were emailed. Approve in the admin dashboard to send for real.</p>`;
    await sendEmail({
      to,
      subject: `[TEST] ${campaign.subject}`,
      html: (campaign.body_html || "") + footer,
    });
    await campaigns.markTestSent(campaign.id);
    res.json({ sent: true, to });
  }),
);

// POST /:id/approve-send : THE GATE. Resolve audience and send sequentially,
// recording one campaign_recipients row per address. Nothing else auto-sends.
router.post(
  "/:id/approve-send",
  h(async (req, res) => {
    const campaign = await campaigns.getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: "not found" });
    const audience = await campaigns.resolveAudience(campaign.audience);
    let sentCount = 0;
    for (const c of audience) {
      try {
        const result = await sendEmail({
          to: c.email,
          subject: campaign.subject,
          html: campaign.body_html || "",
        });
        const ok = result.ok || result.skipped === true;
        if (result.ok) sentCount += 1;
        await campaigns.insertRecipient({
          campaignId: campaign.id,
          email: c.email,
          name: c.name,
          status: ok ? "sent" : "failed",
        });
      } catch {
        await campaigns.insertRecipient({
          campaignId: campaign.id,
          email: c.email,
          name: c.name,
          status: "failed",
        });
      }
    }
    await campaigns.markSent(campaign.id, audience.length, sentCount);
    res.json({ recipient_count: audience.length, sent_count: sentCount });
  }),
);

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

export default router;
