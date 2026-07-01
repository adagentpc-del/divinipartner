/**
 * Strategic Partner Onboarding routes. Mount base: /api/partner-onboarding
 *
 * SUPER-ADMIN (requireAdmin = ADMIN_ALLOWED_EMAILS):
 *   POST   /                 create a private onboarding link for a partner
 *   GET    /                 list onboarding records (masked, no secrets)
 *   POST   /:id/verify       mark a submitted record verified
 *
 * PUBLIC-ISH (no auth, gated by the unguessable onboarding_code):
 *   GET    /:code            onboarding shell (partner name + needed fields, NO secrets)
 *   POST   /:code            partner submits tax/bank/W-9/agreement (SECURITY-CRITICAL)
 *
 * Banking secrets are encrypted via lib/bankCrypto before storage; responses
 * expose only bank_name + account_type + account_last4. Every bank-info submit
 * writes an audit entry and fires notify.securityEvent.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as payouts from "../db/payouts.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { getAdminAllowedEmails } from "../config.js";
import { validateUrlUpload } from "../lib/uploadGuard.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

const router = Router();

// ===========================================================================
// PUBLIC-ISH (gated by onboarding_code)
// ===========================================================================

// GET /:code : the onboarding shell. Returns the partner name + which fields are
// still needed. NEVER returns any secret. The code itself is the access token.
router.get(
  "/:code",
  h(async (req, res) => {
    const rec = await payouts.getOnboardingByCode(req.params.code);
    if (!rec) return res.status(404).json({ error: "onboarding link not found" });
    let partnerName: string | null = null;
    if (rec.partner_id) {
      const p = await payouts.getPartner(rec.partner_id);
      partnerName = p?.name ?? p?.company ?? null;
    }
    res.json({
      onboarding: {
        code: rec.onboarding_code,
        status: rec.status,
        partnerName,
        // echo back only non-secret, already-on-file fields so the form can prefill
        legal_name: rec.legal_name,
        business_name: rec.business_name,
        email: rec.email,
        phone: rec.phone,
        address: rec.address,
        tax_classification: rec.tax_classification,
        payment_preference: rec.payment_preference,
        bank_name: rec.bank_name,
        account_type: rec.account_type,
        account_last4: rec.account_last4,
        agreement_accepted: rec.agreement_accepted,
        w9_on_file: !!rec.w9_doc_id || !!rec.w9_doc_url,
      },
      neededFields: [
        "legal_name",
        "tax_classification",
        "w9",
        "payment_preference",
        "bank",
        "agreement",
        "signature",
      ],
    });
  }),
);

// POST /:code : partner submits their info. SECURITY-CRITICAL.
router.post(
  "/:code",
  h(async (req, res) => {
    const code = req.params.code;
    const existing = await payouts.getOnboardingByCode(code);
    if (!existing) return res.status(404).json({ error: "onboarding link not found" });
    if (existing.status === "verified") {
      return res.status(409).json({ error: "this onboarding is already verified and locked" });
    }
    const b = req.body ?? {};
    // require the agreement + signature for a complete submission
    if (!b.agreement_accepted) {
      return res.status(400).json({ error: "you must accept the partner agreement" });
    }
    if (!b.signature || !String(b.signature).trim()) {
      return res.status(400).json({ error: "a typed signature is required" });
    }
    // Guard the W-9 document reference when one is supplied (URL-reference upload).
    if (typeof b.w9_doc_url === "string" && b.w9_doc_url.trim()) {
      const check = validateUrlUpload(b.w9_doc_url.trim(), { allow: "documents" });
      if (!check.ok) return res.status(400).json({ error: `w9_doc_url: ${check.reason}` });
    }

    const result = await payouts.submitOnboarding(code, {
      legal_name: b.legal_name ?? null,
      business_name: b.business_name ?? null,
      email: b.email ?? null,
      phone: b.phone ?? null,
      address: b.address ?? null,
      tax_classification: b.tax_classification ?? null,
      w9_doc_id: b.w9_doc_id ?? null,
      w9_doc_url: b.w9_doc_url ?? null,
      payment_preference: b.payment_preference ?? null,
      bank_name: b.bank_name ?? null,
      routing_number: b.routing_number ?? null,
      account_number: b.account_number ?? null,
      account_type: b.account_type ?? null,
      agreement_accepted: !!b.agreement_accepted,
      signature: b.signature ?? null,
    });
    if (!result) return res.status(404).json({ error: "onboarding link not found" });

    // Audit + security notification for any bank-info submit/change. We log only
    // non-secret metadata (last4 + flags), never the routing/account numbers.
    if (result.bankCaptured) {
      await logAction(
        null,
        "partner.bank_info_submitted",
        "partner_onboarding",
        result.record.id,
        null,
        {
          partner_id: result.record.partner_id,
          account_last4: result.record.account_last4,
          account_type: result.record.account_type,
          bank_name: result.record.bank_name,
          encryption_configured: result.encryptionConfigured,
        },
        {
          summary: "Partner submitted banking information via onboarding link",
          ip: clientIp(req),
        },
      );
      const admins = getAdminAllowedEmails();
      if (admins.length) {
        await notify
          .securityEvent(admins, "Partner banking info submitted", {
            partner_id: result.record.partner_id,
            account_last4: result.record.account_last4,
            encryption_configured: result.encryptionConfigured,
          })
          .catch(() => undefined);
      }
    }
    await logAction(
      null,
      "partner.onboarding_submitted",
      "partner_onboarding",
      result.record.id,
      null,
      { partner_id: result.record.partner_id, status: result.record.status },
      { summary: "Partner submitted onboarding info", ip: clientIp(req) },
    );

    res.json({
      ok: true,
      // masked confirmation only; never redisplay the full account number
      confirmation: {
        status: result.record.status,
        bank_name: result.record.bank_name,
        account_type: result.record.account_type,
        account_last4: result.record.account_last4,
        masked: result.record.account_last4 ? `****${result.record.account_last4}` : null,
        bankCaptured: result.bankCaptured,
        encryptionConfigured: result.encryptionConfigured,
      },
      warning: result.bankCaptured && !result.encryptionConfigured
        ? "Server encryption key is not configured. Only the last 4 digits were stored; please contact the Divini Partners team to securely complete your banking setup."
        : null,
    });
  }),
);

// ===========================================================================
// SUPER-ADMIN
// ===========================================================================

// POST / : create a private onboarding link for a partner.
router.post(
  "/",
  requireAdmin,
  h(async (req, res) => {
    const auth = getAuth(req);
    const partnerId = (req.body ?? {}).partner_id;
    if (!partnerId) return res.status(400).json({ error: "partner_id required" });
    const rec = await payouts.createOnboarding(String(partnerId));
    await logAction(
      { id: auth.userId, email: auth.email },
      "partner.onboarding_link_created",
      "partner_onboarding",
      rec.id,
      null,
      { partner_id: partnerId, onboarding_code: rec.onboarding_code },
      { summary: "Super-admin created a partner onboarding link", ip: clientIp(req) },
    );
    res.status(201).json({ onboarding: rec });
  }),
);

// GET / : list onboarding records (masked).
router.get(
  "/",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ onboarding: await payouts.listOnboarding() });
  }),
);

// POST /:id/verify : mark a submitted record verified.
router.post(
  "/:id/verify",
  requireAdmin,
  h(async (req, res) => {
    const auth = getAuth(req);
    const rec = await payouts.verifyOnboarding(req.params.id);
    if (!rec) return res.status(404).json({ error: "record not found" });
    await logAction(
      { id: auth.userId, email: auth.email },
      "partner.onboarding_verified",
      "partner_onboarding",
      rec.id,
      null,
      { partner_id: rec.partner_id },
      { summary: "Super-admin verified partner onboarding", ip: clientIp(req) },
    );
    res.json({ onboarding: rec });
  }),
);

export default router;
