/**
 * Phase 2 routes: AI-assisted onboarding + co-branded partner profiles.
 * Mount base (added at integration): /api/profile
 *
 * Routes (relative to the mount):
 *   GET  /                      my profile + onboarding state
 *   PUT  /onboarding            save draft sections (sectioned, saveable)
 *   POST /onboarding/website    accept a website/link; create AI-suggested DRAFT
 *                               placeholders marked pending verification
 *   POST /onboarding/documents  record an uploaded document reference
 *   POST /onboarding/suggestions/:id  accept / edit / reject an AI suggestion
 *   PUT  /theme                 save theme controls
 *   POST /publish               submit for review or publish per rules
 *   GET  /public/:slug          public co-branded profile (published fields only)
 *
 * All authed routes are organization-scoped via getActor(). The only public
 * route is GET /public/:slug, which returns nothing for unpublished profiles.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as profiles from "../db/profiles.js";
import { extractProfileFromUrl } from "../lib/extract.js";
import { validateUrlUpload } from "../lib/uploadGuard.js";
import { sendEmail } from "../lib/email.js";
import { randomToken } from "../lib/session.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const AI_PENDING_NOTE = "ai_suggested pending owner verification";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

/** Resolve the signed-in actor and require an organization (account). */
async function requireOrg(req: Request, res: Response) {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(409).json({ error: "no organization; complete registration first" });
    return null;
  }
  return { actor, auth };
}

// ---- GET / : my profile + onboarding state --------------------------------
router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const state = await profiles.getMyProfileState(ctx.actor.org!.id, ctx.actor.user.role);
    res.json(state);
  }),
);

// ---- PUT /onboarding : save draft sections --------------------------------
router.put(
  "/onboarding",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { sections, currentStep, stepsCompleted, role } = req.body ?? {};
    const draft = await profiles.saveDraft(ctx.actor.org!.id, {
      sections: sections && typeof sections === "object" ? sections : {},
      currentStep: typeof currentStep === "string" ? currentStep : null,
      stepsCompleted: Array.isArray(stepsCompleted) ? stepsCompleted : undefined,
      role: typeof role === "string" ? role : ctx.actor.user.role,
    });
    res.json({ draft });
  }),
);

// ---- POST /onboarding/website : accept a website / link -------------------
router.post(
  "/onboarding/website",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { url, linkType } = req.body ?? {};
    if (!url || typeof url !== "string" || url.trim().length < 3) {
      return res.status(400).json({ error: "a valid url is required" });
    }
    const out = await profiles.intakeWebsite(
      ctx.actor.org!.id,
      url.trim(),
      typeof linkType === "string" ? linkType : undefined,
    );
    res.status(201).json(out);
  }),
);

// ---- POST /extract : local-model website extraction (suggestion only) -----
// Fetches the supplied public URL server-side and uses the LOCAL LLM to extract
// suggested public-profile fields. Every field is returned clearly marked
// "ai_suggested pending owner verification" and NOTHING is written to the draft;
// the partner must accept each suggestion (existing /onboarding/suggestions flow
// or the deterministic /onboarding/website intake). When the local model is not
// available, returns { available: false } so the client falls back to the
// deterministic intake. Never invents pricing, availability, capacity, or
// insurance.
router.post(
  "/extract",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string" || url.trim().length < 3) {
      return res.status(400).json({ error: "a valid url is required" });
    }
    const extracted = await extractProfileFromUrl(url.trim());
    if (!extracted) {
      // Local model unavailable or extraction failed: client should fall back to
      // POST /onboarding/website (deterministic, always available).
      return res.json({ available: false, url: url.trim(), suggestion: null });
    }
    // Shape as pending, owner-unconfirmed suggested fields. This does not touch
    // the draft; owner-entered values are never overwritten.
    const suggestion = {
      status: AI_PENDING_NOTE,
      source: "website",
      sourceRef: url.trim(),
      fields: {
        name: extracted.name ?? null,
        description: extracted.description ?? null,
        services: extracted.services ?? null,
        tags: extracted.tags ?? null,
      },
    };
    res.json({ available: true, url: url.trim(), suggestion });
  }),
);

// ---- POST /onboarding/documents : record an uploaded document -------------
router.post(
  "/onboarding/documents",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { fileUrl, documentType, section } = req.body ?? {};
    if (!fileUrl || typeof fileUrl !== "string") {
      return res.status(400).json({ error: "fileUrl is required" });
    }
    const docCheck = validateUrlUpload(fileUrl.trim(), { allow: "documents" });
    if (!docCheck.ok) {
      return res.status(400).json({ error: docCheck.reason });
    }
    const out = await profiles.intakeDocument(ctx.actor.org!.id, ctx.actor.user.id, {
      fileUrl: fileUrl.trim(),
      documentType: typeof documentType === "string" ? documentType : undefined,
      section: typeof section === "string" ? section : undefined,
    });
    res.status(201).json(out);
  }),
);

// ---- POST /onboarding/suggestions/:id : accept / edit / reject ------------
router.post(
  "/onboarding/suggestions/:id",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { action, value } = req.body ?? {};
    if (!["accepted", "edited", "rejected"].includes(action)) {
      return res.status(400).json({ error: "action must be accepted, edited, or rejected" });
    }
    const sugg = await profiles.resolveSuggestion(
      ctx.actor.org!.id,
      req.params.id,
      action,
      value,
    );
    if (!sugg) return res.status(404).json({ error: "suggestion not found" });
    res.json({ suggestion: sugg });
  }),
);

// ---- PUT /theme : save theme controls -------------------------------------
router.put(
  "/theme",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const b = req.body ?? {};
    for (const [field, val] of [
      ["logo_url", b.logo_url],
      ["cover_url", b.cover_url],
    ] as const) {
      if (typeof val === "string" && val.trim()) {
        const check = validateUrlUpload(val.trim(), { allow: "images" });
        if (!check.ok) {
          return res.status(400).json({ error: `${field}: ${check.reason}` });
        }
      }
    }
    const theme = await profiles.saveTheme(ctx.actor.org!.id, {
      logo_url: typeof b.logo_url === "string" ? b.logo_url : undefined,
      cover_url: typeof b.cover_url === "string" ? b.cover_url : undefined,
      primary_color: typeof b.primary_color === "string" ? b.primary_color : undefined,
      secondary_color: typeof b.secondary_color === "string" ? b.secondary_color : undefined,
      accent_color: typeof b.accent_color === "string" ? b.accent_color : undefined,
      button_style: typeof b.button_style === "string" ? b.button_style : undefined,
      template: typeof b.template === "string" ? b.template : undefined,
    });
    res.json({ theme });
  }),
);

// ---- POST /publish : submit for review or publish -------------------------
router.post(
  "/publish",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const { mode } = req.body ?? {};
    // Free + free_partner tiers go through a light review; partner/premier may
    // self-publish. Admins may publish anything.
    const tier = ctx.actor.org!.tier ?? "free_partner";
    const requested = mode === "publish" ? "publish" : "submit";
    const canSelfPublish =
      ctx.auth.isAdmin || tier === "partner" || tier === "premier";
    const effective: "submit" | "publish" =
      requested === "publish" && canSelfPublish ? "publish" : "submit";
    const out = await profiles.publishProfile(ctx.actor.org!.id, effective);
    res.json({ ...out, applied: effective });
  }),
);

// ---- POST /transfer-owner : change the profile owner email -----------------
// The current owner (a member of the org) or a platform admin can transfer
// ownership to another email. The new email is upserted as an unverified user
// with a claim/verify token, the org membership is moved to them, and the org
// contact email is updated. They receive an email to set their password and take
// over. After they verify, the new email controls the profile.
router.post(
  "/transfer-owner",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const { newEmail } = req.body ?? {};
    if (
      typeof newEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())
    ) {
      return res.status(400).json({ error: "Enter a valid new owner email address." });
    }
    const norm = newEmail.trim().toLowerCase();
    if (auth.email && norm === auth.email.toLowerCase()) {
      return res.status(400).json({ error: "That is already the owner email." });
    }
    const token = randomToken(32);
    const result = await db.transferOrgOwner({
      callerUserId: auth.userId!,
      callerIsAdmin: auth.isAdmin,
      newEmail: norm,
      verifyToken: token,
      verifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    // Email the new owner a claim/verify link to set their password and take over.
    const base = (PUBLIC_APP_URL || "https://divinipartners.com") + (BASE_PATH || "");
    const link = `${base}/verify-email?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: norm,
      subject: `You now own the ${result.orgName} profile on Divini Partners`,
      text:
        `You have been made the owner of the ${result.orgName} profile on Divini Partners.\n\n` +
        `Set your password and take over the account here:\n${link}\n\n` +
        `This link expires in 24 hours.`,
    }).catch(() => undefined);
    res.json({ ok: true, orgId: result.orgId, newOwnerEmail: norm, created: result.created });
  }),
);

// ---- GET /public/:slug : public co-branded profile ------------------------
// No auth: returns only published profiles, only public fields.
router.get(
  "/public/:slug",
  h(async (req, res) => {
    const profile = await profiles.getPublicProfileBySlug(req.params.slug);
    if (!profile) return res.status(404).json({ error: "profile not found" });
    res.json({ profile });
  }),
);

export default router;
