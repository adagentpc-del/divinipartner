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
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as profiles from "../db/profiles.js";
import { extractProfileFromUrl, extractProfileFromDocumentText } from "../lib/extract.js";
import { extractTextFromDocument } from "../lib/extractDocument.js";
import { putObjectBytes } from "../storage.js";
import {
  validateUrlUpload,
  validateFileMeta,
  sniffMagicBytes,
  scanWithClamAV,
  extOf,
  MAX_UPLOAD_BYTES,
} from "../lib/uploadGuard.js";
import { sendEmail } from "../lib/email.js";
import { randomToken } from "../lib/session.js";
import { PUBLIC_APP_URL, BASE_PATH, LLM_PROVIDER, LLM_MODEL } from "../config.js";
import { logAction } from "../lib/audit.js";

const AI_PENDING_NOTE = "ai_suggested pending owner verification";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Multipart in memory for /extract-document; bytes are validated + scanned
// before being handed to putObjectBytes (same pattern as profile-decks-programs.ts).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

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

// ---- GET /onboarding/suggestions : pending AI suggestions for my org ------
router.get(
  "/onboarding/suggestions",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const all = await profiles.listSuggestions(ctx.actor.org!.id);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const list = status ? all.filter((s) => s.status === status) : all;
    res.json({ suggestions: list });
  }),
);

// ---- POST /extract : local-model website extraction ------------------------
// Fetches the supplied public URL server-side and uses the LOCAL LLM to extract
// suggested public-profile fields (name, description, services, tags, hours,
// capacity, starting price, packages - only what the page explicitly states).
// Each extracted field is persisted as a pending ai_profile_suggestions row
// (source: website) so it shows up alongside every other suggestion in
// GET /onboarding/suggestions and resolves the same way (accept/edit/reject via
// POST /onboarding/suggestions/:id). NOTHING is written to the live public
// profile directly. When the local model is not available or nothing could be
// extracted, returns { available: false } so the client falls back to the
// deterministic POST /onboarding/website intake.
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
    const clean = url.trim();
    const extracted = await extractProfileFromUrl(clean);
    // ai_run_audit trail (ALFY2 pack Section 08): record that an AI extraction
    // ran, its provider/model, and its outcome -- never the extracted text
    // itself, which already lives (governed by its own status lifecycle) in
    // ai_profile_suggestions.
    await logAction(
      ctx.actor,
      "ai.extract_profile",
      "organization",
      ctx.actor.org!.id,
      null,
      { source: "website", provider: LLM_PROVIDER, model: LLM_MODEL, outcome: extracted ? "ok" : "unavailable" },
      { summary: `AI profile extraction from website: ${extracted ? "succeeded" : "unavailable/failed"}` },
    ).catch(() => undefined);
    if (!extracted) {
      // Local model unavailable or extraction failed: client should fall back to
      // POST /onboarding/website (deterministic, always available).
      return res.json({ available: false, url: clean, suggestions: [] });
    }
    const suggestions = await profiles.intakeExtractedFields(ctx.actor.org!.id, "website", clean, extracted);
    res.json({ available: true, url: clean, suggestions });
  }),
);

// ---- POST /extract-document : upload a document, extract, suggest ---------
// Accepts a multipart file (field "file": .txt or .pdf). Runs the same
// validate -> magic-byte sniff -> optional ClamAV scan -> store pipeline as
// profile-extras deck uploads, records a documents row, then attempts real
// text extraction + the same local-LLM structuring used for website
// extraction. When the file type is unsupported, extraction is unavailable,
// or nothing could be extracted, falls back to the existing safe placeholder
// suggestion (intakeDocument) - the document is still recorded and on file
// either way, so this never regresses the base "record it" behavior.
router.post(
  "/extract-document",
  requireUser,
  upload.single("file"),
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const orgId = ctx.actor.org!.id;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: "attach a file" });

    const meta = validateFileMeta({
      filename: file.originalname,
      mimetype: file.mimetype,
      sizeBytes: file.size,
      allow: "documents",
    });
    if (!meta.ok) return res.status(400).json({ error: meta.reason });
    if (!sniffMagicBytes(file.buffer, extOf(file.originalname))) {
      return res.status(400).json({ error: "file contents do not match its type" });
    }

    const key = `${orgId}/profile-extract/${Date.now()}-${randomToken(4)}-${file.originalname.replace(/[^\w.\- ]+/g, "_")}`;
    const tmpPath = path.join(os.tmpdir(), `extract-scan-${crypto.randomUUID()}`);
    let scan: { clean: boolean; detail?: string };
    try {
      fs.writeFileSync(tmpPath, file.buffer);
      scan = await scanWithClamAV(tmpPath);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
    if (!scan.clean) return res.status(400).json({ error: scan.detail || "file failed virus scan" });

    await putObjectBytes(key, file.buffer, file.mimetype);
    const fileUrl = `storage://${key}`;

    // Attempt real extraction; on any failure fall through to the existing
    // safe placeholder behavior (never a hard dependency).
    let suggestions: profiles.AiSuggestion[] = [];
    let extractedAny = false;
    try {
      const text = await extractTextFromDocument(file.buffer, file.mimetype, file.originalname);
      if (text) {
        const extracted = await extractProfileFromDocumentText(text, file.originalname);
        if (extracted) {
          suggestions = await profiles.intakeExtractedFields(orgId, "document", key, extracted);
          extractedAny = suggestions.length > 0;
        }
      }
    } catch {
      // Extraction is best effort; fall through to the placeholder below.
    }

    if (!extractedAny) {
      const out = await profiles.intakeDocument(orgId, ctx.actor.user.id, {
        fileUrl,
        documentType: "extract",
      });
      suggestions = [out.suggestion];
    }

    // ai_run_audit trail (ALFY2 pack Section 08) -- same rationale as /extract.
    await logAction(
      ctx.actor,
      "ai.extract_profile",
      "organization",
      orgId,
      null,
      { source: "document", provider: LLM_PROVIDER, model: LLM_MODEL, outcome: extractedAny ? "ok" : "unavailable" },
      { summary: `AI profile extraction from document: ${extractedAny ? "succeeded" : "unavailable/failed"}` },
    ).catch(() => undefined);

    res.status(201).json({ available: extractedAny, fileUrl, suggestions });
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
