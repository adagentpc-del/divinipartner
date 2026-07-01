/**
 * Profile DECKS + PROGRAMS routes. Mount base (added at integration):
 *   /api/profile-extras
 *
 * Every profile (venue, vendor, sponsor, nonprofit) can (1) upload pitch decks /
 * marketing collateral and (2) publish custom programs / offerings that render
 * on its public profile.
 *
 * Routes (relative to the mount):
 *   GET    /decks                 list my decks (public + private)
 *   POST   /decks                 upload a deck (multipart file) OR a link
 *   PATCH  /decks/:id             rename / re-tag / change visibility / reorder
 *   DELETE /decks/:id             remove a deck
 *   GET    /decks/:id/download    stream MY deck file (org-scoped)
 *
 *   GET    /programs              list my programs
 *   POST   /programs              create a program / offering
 *   PATCH  /programs/:id          update a program
 *   DELETE /programs/:id          delete a program
 *
 *   GET    /public/:slug          public decks + active programs for a profile
 *   GET    /public/:slug/decks/:id/download   stream a PUBLIC deck file (guests)
 *
 * Deck files are stored on local disk via the existing storage helper
 * (../storage.js: writeFile + readPath), the same mechanism the native e-sign
 * route uses. Uploaded bytes are validated against the shared upload guard
 * (extension + mimetype + size + magic-byte sniff) before they touch disk.
 *
 * Zero em dashes.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as extras from "../db/profile-extras.js";
import os from "node:os";
import path from "node:path";
import { putObjectBytes, deleteObject, objectExistsAsync, streamObject } from "../storage.js";
import {
  validateFileMeta,
  validateUrlUpload,
  sniffMagicBytes,
  scanWithClamAV,
  extOf,
  MAX_UPLOAD_BYTES,
} from "../lib/uploadGuard.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Multipart in memory; bytes are validated then handed to writeFile (no temp
// files). One file per request under the field name "file".
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const router = Router();

/** Resolve the signed-in actor and require an organization (account). */
async function requireOrg(req: Request, res: Response) {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(409).json({ error: "no organization; complete registration first" });
    return null;
  }
  return { actor };
}

/** Build the on-disk storage key for a deck upload, org-namespaced. */
function deckStorageKey(orgId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
  return `${orgId}/profile-decks/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
}

async function streamDeckFile(res: Response, deck: { storage_key: string | null; file_name: string | null; content_type: string | null }): Promise<void> {
  if (!deck.storage_key || !(await objectExistsAsync(deck.storage_key))) {
    res.status(404).json({ error: "file missing" });
    return;
  }
  res.setHeader("Content-Type", deck.content_type || "application/octet-stream");
  const name = (deck.file_name || "deck").replace(/[^\w.\-]+/g, "_");
  res.setHeader("Content-Disposition", `inline; filename="${name}"`);
  // Provider-agnostic + encryption-aware streaming (local disk or S3).
  await streamObject(deck.storage_key, res);
}

// ---- Decks: owner-facing ---------------------------------------------------

router.get(
  "/decks",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const decks = await extras.listDecks(ctx.actor.org!.id);
    res.json({ decks });
  }),
);

// Upload a deck. Accepts EITHER a multipart file (field "file") OR a fileUrl in
// the body for externally hosted collateral. Other fields: title, kind,
// visibility ('public' | 'private').
router.post(
  "/decks",
  requireUser,
  upload.single("file"),
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const orgId = ctx.actor.org!.id;
    const b = req.body ?? {};

    const title =
      typeof b.title === "string" && b.title.trim()
        ? b.title.trim().slice(0, 200)
        : null;
    const kind = typeof b.kind === "string" ? b.kind : undefined;
    const visibility = b.visibility === "private" ? "private" : "public";

    const file = (req as Request & { file?: Express.Multer.File }).file;

    if (file) {
      // Binary upload path: validate metadata + magic bytes + optional AV scan.
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

      const key = deckStorageKey(orgId, file.originalname);

      // Optional virus scan (off unless AV_SCAN_ENABLED). ClamAV needs a real
      // file, so scan the plaintext bytes via a temp file BEFORE storing. This
      // keeps the scan meaningful even when at-rest encryption is enabled (the
      // stored object would otherwise be ciphertext).
      const tmpPath = path.join(os.tmpdir(), `deck-scan-${crypto.randomUUID()}`);
      let scan: { clean: boolean; detail?: string };
      try {
        fs.writeFileSync(tmpPath, file.buffer);
        scan = await scanWithClamAV(tmpPath);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
      if (!scan.clean) {
        return res.status(400).json({ error: scan.detail || "file failed virus scan" });
      }

      // Store through the pluggable object storage layer (local disk or S3),
      // with at-rest encryption applied transparently when configured.
      await putObjectBytes(key, file.buffer, file.mimetype);

      const deck = await extras.insertDeck(orgId, ctx.actor.user.id, {
        title: title || file.originalname,
        kind,
        storageKey: key,
        fileName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        visibility,
      });
      return res.status(201).json({ deck });
    }

    // Link path: an externally hosted deck / collateral URL.
    const fileUrl = typeof b.fileUrl === "string" ? b.fileUrl.trim() : "";
    if (!fileUrl) {
      return res.status(400).json({ error: "attach a file or provide a fileUrl" });
    }
    const urlCheck = validateUrlUpload(fileUrl, { allow: "documents" });
    if (!urlCheck.ok) return res.status(400).json({ error: urlCheck.reason });
    if (!title) return res.status(400).json({ error: "title is required for a linked deck" });

    const deck = await extras.insertDeck(orgId, ctx.actor.user.id, {
      title,
      kind,
      fileUrl,
      visibility,
    });
    res.status(201).json({ deck });
  }),
);

router.patch(
  "/decks/:id",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const b = req.body ?? {};
    const deck = await extras.updateDeck(ctx.actor.org!.id, req.params.id, {
      title: typeof b.title === "string" ? b.title.trim().slice(0, 200) : undefined,
      kind: typeof b.kind === "string" ? b.kind : undefined,
      visibility: b.visibility === "public" || b.visibility === "private" ? b.visibility : undefined,
      sort: typeof b.sort === "number" ? b.sort : undefined,
    });
    if (!deck) return res.status(404).json({ error: "deck not found" });
    res.json({ deck });
  }),
);

router.delete(
  "/decks/:id",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const deck = await extras.deleteDeck(ctx.actor.org!.id, req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    // Best-effort remove the stored object; keep going if it is already gone.
    if (deck.storage_key) {
      try { await deleteObject(deck.storage_key); } catch { /* ignore */ }
    }
    res.json({ ok: true, id: deck.id });
  }),
);

// Stream MY deck file (org-scoped). Linked decks (file_url) are opened directly
// by the client, so this only serves uploaded files.
router.get(
  "/decks/:id/download",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const deck = await extras.getDeck(ctx.actor.org!.id, req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    await streamDeckFile(res, deck);
  }),
);

// ---- Programs: owner-facing ------------------------------------------------

router.get(
  "/programs",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const programs = await extras.listPrograms(ctx.actor.org!.id);
    res.json({ programs });
  }),
);

function readProgramBody(b: any) {
  return {
    title: typeof b.title === "string" ? b.title.trim().slice(0, 200) : undefined,
    summary: typeof b.summary === "string" ? b.summary : undefined,
    details: typeof b.details === "string" ? b.details : undefined,
    priceTerms: typeof b.priceTerms === "string" ? b.priceTerms : undefined,
    ctaLabel: typeof b.ctaLabel === "string" ? b.ctaLabel.slice(0, 80) : undefined,
    ctaUrl: typeof b.ctaUrl === "string" ? b.ctaUrl.trim() : undefined,
    active: typeof b.active === "boolean" ? b.active : undefined,
    sort: typeof b.sort === "number" ? b.sort : undefined,
  };
}

router.post(
  "/programs",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const p = readProgramBody(req.body ?? {});
    if (!p.title) return res.status(400).json({ error: "title is required" });
    if (p.ctaUrl) {
      // Allow http(s) CTA links only; no extension requirement.
      const c = validateUrlUpload(p.ctaUrl);
      if (!c.ok) return res.status(400).json({ error: `cta link: ${c.reason}` });
    }
    const program = await extras.insertProgram(ctx.actor.org!.id, ctx.actor.user.id, {
      title: p.title,
      summary: p.summary,
      details: p.details,
      priceTerms: p.priceTerms,
      ctaLabel: p.ctaLabel,
      ctaUrl: p.ctaUrl,
      active: p.active,
      sort: p.sort,
    });
    res.status(201).json({ program });
  }),
);

router.patch(
  "/programs/:id",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const p = readProgramBody(req.body ?? {});
    if (p.ctaUrl) {
      const c = validateUrlUpload(p.ctaUrl);
      if (!c.ok) return res.status(400).json({ error: `cta link: ${c.reason}` });
    }
    const program = await extras.updateProgram(ctx.actor.org!.id, req.params.id, p);
    if (!program) return res.status(404).json({ error: "program not found" });
    res.json({ program });
  }),
);

router.delete(
  "/programs/:id",
  requireUser,
  h(async (req, res) => {
    const ctx = await requireOrg(req, res);
    if (!ctx) return;
    const program = await extras.deleteProgram(ctx.actor.org!.id, req.params.id);
    if (!program) return res.status(404).json({ error: "program not found" });
    res.json({ ok: true, id: program.id });
  }),
);

// ---- Public reads (by slug) ------------------------------------------------
// No auth: only PUBLIC decks + ACTIVE programs of a PUBLISHED profile.

router.get(
  "/public/:slug",
  h(async (req, res) => {
    const [decks, programs] = await Promise.all([
      extras.listPublicDecks(req.params.slug),
      extras.listPublicPrograms(req.params.slug),
    ]);
    res.json({ decks, programs });
  }),
);

// Stream a PUBLIC deck file for guests. Only serves decks whose profile is
// published and whose visibility is public; linked decks have no file to stream.
router.get(
  "/public/:slug/decks/:id/download",
  h(async (req, res) => {
    const deck = await extras.getPublicDeckById(req.params.slug, req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    await streamDeckFile(res, deck);
  }),
);

export default router;
