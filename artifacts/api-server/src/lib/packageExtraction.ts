import { db, packageExtractionsTable, packageExtractionClaimsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { emit as usageEmit } from "../services/usageTracking";
import { logger } from "./logger";

/**
 * Section 25 ext#3 — PDF package intake.
 *
 * Mirrors the well-tested `deck_extractions` lifecycle:
 *   1. Hash the file bytes; gate on a (partner_id, file_hash) atomic claim
 *      so concurrent uploads of the same file dedup instead of double-billing AI.
 *   2. Reuse-from-prior path: if a prior `parsed` extraction exists for the
 *      same partner+hash, copy its `parsedRows` and skip AI.
 *   3. Stale-claim takeover with heartbeat refresh, identical semantics to
 *      deck extraction (heartbeat refreshes startedAt every 30s; takeover
 *      requires lease > 5min old).
 *   4. PDF text extract (pdf-parse) → boilerplate strip → relevant-chunk
 *      pick → AI call (gpt-4o-mini, JSON output mode) → store rows in
 *      `parsedRows` JSONB.
 *   5. Per-row `_confidence` + global `parseWarnings` so admin can review.
 *
 * The AI prompt is package-focused: it produces grouped rows matching the
 * `PACKAGE_FIELDS` shape used by the existing `commitPackages` import path,
 * so the staged JSONB can be POSTed to commit without any field-shape
 * conversion beyond stripping internal `_*` keys.
 */

// ===== Shared cost-control limits — match deck_extractions for consistency =====
export const PDF_LIMITS = {
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  MAX_TEXT_CHARS: 60_000,
  MAX_AI_INPUT_CHARS: 8_000,
  MAX_CHUNKS: 10,                     // packages PDFs tend to be tabular; allow a few more pages
  AI_MAX_OUTPUT_TOKENS: 2500,         // grouped output can be larger than zone lists
};

const CLAIM_WAIT_MS = 60_000;
const CLAIM_POLL_MS = 1_500;
const CLAIM_STALE_MS = 5 * 60_000;
const CLAIM_HEARTBEAT_MS = 30_000;

// ----- Claim helpers (parallel structure to deckExtraction.ts) ---------------

async function tryClaim(partnerId: number, fileHash: string, extractionId: number): Promise<{ acquired: boolean; ownerExtractionId?: number }> {
  const inserted = await db.insert(packageExtractionClaimsTable)
    .values({ partnerId, fileHash, extractionId })
    .onConflictDoNothing({ target: [packageExtractionClaimsTable.partnerId, packageExtractionClaimsTable.fileHash] })
    .returning({ extractionId: packageExtractionClaimsTable.extractionId });
  if (inserted.length > 0) return { acquired: true };
  const [owner] = await db.select().from(packageExtractionClaimsTable)
    .where(and(eq(packageExtractionClaimsTable.partnerId, partnerId), eq(packageExtractionClaimsTable.fileHash, fileHash)));
  return { acquired: false, ownerExtractionId: owner?.extractionId };
}

async function releaseClaim(partnerId: number, fileHash: string, extractionId: number): Promise<void> {
  await db.delete(packageExtractionClaimsTable).where(and(
    eq(packageExtractionClaimsTable.partnerId, partnerId),
    eq(packageExtractionClaimsTable.fileHash, fileHash),
    eq(packageExtractionClaimsTable.extractionId, extractionId),
  ));
}

async function heartbeatClaim(partnerId: number, fileHash: string, extractionId: number): Promise<boolean> {
  const updated = await db.update(packageExtractionClaimsTable)
    .set({ startedAt: new Date() })
    .where(and(
      eq(packageExtractionClaimsTable.partnerId, partnerId),
      eq(packageExtractionClaimsTable.fileHash, fileHash),
      eq(packageExtractionClaimsTable.extractionId, extractionId),
    ))
    .returning({ extractionId: packageExtractionClaimsTable.extractionId });
  return updated.length > 0;
}

async function takeOverIfStale(partnerId: number, fileHash: string, ownerExtractionId: number, myExtractionId: number): Promise<boolean> {
  const cutoffMs = Date.now() - CLAIM_STALE_MS;
  const evicted = await db.delete(packageExtractionClaimsTable).where(and(
    eq(packageExtractionClaimsTable.partnerId, partnerId),
    eq(packageExtractionClaimsTable.fileHash, fileHash),
    eq(packageExtractionClaimsTable.extractionId, ownerExtractionId),
    sql`${packageExtractionClaimsTable.startedAt} < to_timestamp(${cutoffMs / 1000})`,
  )).returning({ extractionId: packageExtractionClaimsTable.extractionId });
  if (evicted.length === 0) return false;
  const claim = await tryClaim(partnerId, fileHash, myExtractionId);
  return claim.acquired;
}

async function waitForOwnerParsed(ownerExtractionId: number): Promise<boolean> {
  const deadline = Date.now() + CLAIM_WAIT_MS;
  while (Date.now() < deadline) {
    const [row] = await db.select({ status: packageExtractionsTable.status })
      .from(packageExtractionsTable).where(eq(packageExtractionsTable.id, ownerExtractionId));
    if (!row) return false;
    if (row.status === "parsed" || row.status === "needs_review") return true;
    if (row.status === "parse_failed") return false;
    await new Promise(r => setTimeout(r, CLAIM_POLL_MS));
  }
  return false;
}

async function tryReuseFromPrior(partnerId: number, fileHash: string, extractionId: number): Promise<boolean> {
  const [prior] = await db.select().from(packageExtractionsTable).where(and(
    eq(packageExtractionsTable.partnerId, partnerId),
    eq(packageExtractionsTable.fileHash, fileHash),
    sql`${packageExtractionsTable.status} IN ('parsed','needs_review','imported')`,
  )).orderBy(desc(packageExtractionsTable.processedAt)).limit(1);
  if (!prior || prior.id === extractionId) return false;
  await db.update(packageExtractionsTable).set({
    status: "duplicate_reused",
    parseSource: "reused_dedup",
    dedupedFromId: prior.id,
    totalPages: prior.totalPages,
    extractedText: prior.extractedText,
    parsedRows: prior.parsedRows,
    parseWarnings: prior.parseWarnings,
    processedAt: new Date(),
  }).where(eq(packageExtractionsTable.id, extractionId));
  await usageEmit("package_pdf.parse.reused", {
    partnerId, objectType: "package_extraction", objectId: extractionId,
    meta: { dedupedFromId: prior.id, rows: (prior.parsedRows as any[] | null)?.length || 0, fileHash },
  });
  return true;
}

export async function findPriorParsedPackageExtraction(partnerId: number, fileHash: string) {
  const rows = await db.select().from(packageExtractionsTable)
    .where(and(
      eq(packageExtractionsTable.partnerId, partnerId),
      eq(packageExtractionsTable.fileHash, fileHash),
      sql`${packageExtractionsTable.status} IN ('parsed','needs_review','imported')`,
    ))
    .orderBy(desc(packageExtractionsTable.processedAt))
    .limit(1);
  return rows[0] || null;
}

export function fingerprintBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ----- Boilerplate stripping & chunk picking ---------------------------------

function stripBoilerplate(pages: { page: number; text: string }[]): { page: number; text: string }[] {
  const lineCounts = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const ln of p.text.split(/\n/).map(l => l.trim()).filter(Boolean)) {
      if (ln.length > 80) continue;
      if (!seen.has(ln)) { seen.add(ln); lineCounts.set(ln, (lineCounts.get(ln) || 0) + 1); }
    }
  }
  const repeatThreshold = Math.max(2, Math.floor(pages.length * 0.5));
  const boilerplate = new Set(Array.from(lineCounts.entries()).filter(([_, n]) => n >= repeatThreshold).map(([l]) => l));
  return pages.map(p => ({
    page: p.page,
    text: p.text.split(/\n/).filter(l => !boilerplate.has(l.trim())).join("\n"),
  }));
}

// Heuristics tuned for VENDOR PACKAGE PDFs: package/tier/bronze/silver/gold/etc,
// dimensions, prices, item-list patterns.
const PACKAGE_KEYWORDS = [
  "package", "bundle", "tier", "bronze", "silver", "gold", "platinum", "premium",
  "starter", "basic", "standard", "deluxe", "essentials", "includes", "included",
  "components", "kit", "set", "qty", "quantity",
];
const PRICE_REGEX = /(\$|usd|eur|gbp|cad|aud)\s*\d/i;
const DIM_REGEX = /(\d+(?:\.\d+)?)\s*['"x×]\s*(\d+(?:\.\d+)?)/i;

function selectRelevantChunks(pages: { page: number; text: string }[]): { page: number; text: string; reason: string }[] {
  const scored = pages.map(p => {
    const lower = p.text.toLowerCase();
    const kwHits = PACKAGE_KEYWORDS.filter(k => lower.includes(k)).length;
    const hasPrice = PRICE_REGEX.test(p.text);
    const hasDim = DIM_REGEX.test(p.text);
    let reason = "";
    if (kwHits && hasPrice) reason = `keywords(${kwHits})+price`;
    else if (kwHits && hasDim) reason = `keywords(${kwHits})+dims`;
    else if (kwHits) reason = `keywords(${kwHits})`;
    else if (hasPrice) reason = "price";
    else if (hasDim) reason = "dims";
    const score = kwHits * 3 + (hasPrice ? 2 : 0) + (hasDim ? 1 : 0);
    return { page: p.page, text: p.text, reason, score };
  });
  let relevant = scored.filter(s => s.score > 0);
  if (relevant.length === 0) {
    relevant = scored.filter(s => s.text.trim().length > 200)
      .sort((a, b) => b.text.length - a.text.length).slice(0, 4)
      .map(s => ({ ...s, reason: "fallback_longest" }));
  }
  return relevant
    .sort((a, b) => b.score - a.score)
    .slice(0, PDF_LIMITS.MAX_CHUNKS)
    .map(({ page, text, reason }) => ({ page, text, reason }));
}

// ----- AI extraction --------------------------------------------------------

interface ParsedPackageRow {
  packageName?: string;
  packageCode?: string;
  displayName?: string;
  tier?: number;
  description?: string;
  category?: string;
  supplierName?: string;
  price?: number;
  currency?: string;
  sizeWidth?: number;
  sizeHeight?: number;
  sizeDepth?: number;
  sizeDiameter?: number;
  sizeUnit?: string;
  city?: string;
  venue?: string;
  notes?: string;
  itemName?: string;
  itemSku?: string;
  itemCategory?: string;
  quantity?: number;
  itemMaterial?: string;
  itemFinishing?: string;
  itemHardwareIncluded?: boolean;
  itemPrintOnly?: boolean;
  itemRentalEligible?: boolean;
  itemPrice?: number;
  itemNotes?: string;
  // Internal:
  _confidence?: number;
  _sourcePage?: number;
  _groupKey?: string;
  _warnings?: string[];
}

async function extractWithOpenAI(
  chunks: { page: number; text: string; reason: string }[],
  partnerName: string,
): Promise<{ rows: ParsedPackageRow[]; tokensIn: number; tokensOut: number; model: string; warnings: { severity: string; code: string; message: string }[] } | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) return null;

  let payloadText = chunks.map(c => `--- Page ${c.page} (${c.reason}) ---\n${c.text}`).join("\n\n");
  if (payloadText.length > PDF_LIMITS.MAX_AI_INPUT_CHARS) {
    payloadText = payloadText.substring(0, PDF_LIMITS.MAX_AI_INPUT_CHARS);
  }

  const model = "gpt-4o-mini";
  // Tight package-focused prompt. Asks for grouped rows: each row is either a
  // package header (packageName + tier/price/etc) OR a sub-item row (itemName/
  // quantity/material). _groupKey ties them together so the UI can render
  // packages with their item lists nested.
  const system =
    `Extract vendor package data from a partner's catalog PDF for client "${partnerName}". ` +
    'Return JSON {"rows":[...], "warnings":[...]}. ' +
    'Each row corresponds to either:\n' +
    '  (a) a PACKAGE HEADER row — must set packageName; may set packageCode, displayName, tier (1-10), description, category, price, currency, sizeWidth/sizeHeight/sizeUnit (in|ft|cm|mm|m), city, venue, notes; OR\n' +
    '  (b) an ITEM row belonging to the most-recent package — set itemName (and optionally itemSku, itemCategory, quantity, itemMaterial, itemFinishing, itemHardwareIncluded, itemPrintOnly, itemRentalEligible, itemPrice, itemNotes). ' +
    'Item rows MAY leave packageName blank; the system carries it forward by position. ' +
    'CRITICAL: Group items contiguously under their parent package. Set "_groupKey" on every row to a stable id per package (e.g. "pkg-1","pkg-1","pkg-2"). ' +
    'Set "_sourcePage" to the page number where each row was found. ' +
    'Set "_confidence" 0-1 (0.9+ for clearly tabular data, 0.5-0.7 for inferred, <0.4 for guesses). ' +
    'Set "_warnings" string array on rows where quantity, unit, or price was unclear (e.g. ["unit_ambiguous","quantity_unclear"]). ' +
    'Do NOT invent data. If a field is not in the source, omit it. ' +
    'Add a top-level warning {severity:"warn"|"error", code, message} for: partner-name mismatch (pdf names a different client), suspected duplicate package, missing pricing across the doc, unparseable tables. ' +
    `If the PDF clearly references a different client (not "${partnerName}"), include {severity:"warn", code:"partner_name_mismatch", message:"PDF references <other client name>"}.`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: PDF_LIMITS.AI_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: payloadText },
        ],
      }),
    });
    if (!res.ok) {
      logger.error({ body: await res.text() }, "Package PDF AI extraction failed");
      return null;
    }
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    const rows: ParsedPackageRow[] = rawRows.map((r: any) => sanitizeRow(r));
    return {
      rows,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
      model,
      warnings: warnings.filter((w: any) => w && w.code && w.message)
        .map((w: any) => ({ severity: String(w.severity || "warn"), code: String(w.code), message: String(w.message) })),
    };
  } catch (err) {
    logger.error({ err }, "Package PDF AI extraction error");
    return null;
  }
}

// Defensive sanitizer: clamp confidence, drop unknown keys silently. Keeps the
// JSONB clean even if the model adds noise.
function sanitizeRow(r: any): ParsedPackageRow {
  const allowed = new Set([
    "packageName","packageCode","displayName","tier","description","category","supplierName",
    "price","currency","sizeWidth","sizeHeight","sizeDepth","sizeDiameter","sizeUnit",
    "city","venue","notes","itemName","itemSku","itemCategory","quantity","itemMaterial",
    "itemFinishing","itemHardwareIncluded","itemPrintOnly","itemRentalEligible","itemPrice","itemNotes",
    "_confidence","_sourcePage","_groupKey","_warnings",
  ]);
  const out: any = {};
  for (const k of Object.keys(r || {})) {
    if (!allowed.has(k)) continue;
    out[k] = r[k];
  }
  if (out._confidence != null) out._confidence = Math.min(1, Math.max(0, Number(out._confidence) || 0));
  if (out._warnings && !Array.isArray(out._warnings)) delete out._warnings;
  return out as ParsedPackageRow;
}

// ----- Main entry point ------------------------------------------------------

export interface ProcessOptions {
  forceRerun?: boolean;
}

export async function processPackageExtraction(
  extractionId: number,
  partnerId: number,
  partnerName: string,
  fileBuffer: Buffer,
  fileName: string,
  opts: ProcessOptions = {},
): Promise<void> {
  let claimedByMe = false;
  let acquiredFileHash: string | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  try {
    // Stage 1: file size guard
    if (fileBuffer.length > PDF_LIMITS.MAX_FILE_BYTES) {
      await db.update(packageExtractionsTable).set({
        status: "parse_failed",
        errorMessage: `File exceeds ${PDF_LIMITS.MAX_FILE_BYTES} byte limit`,
        fileSize: fileBuffer.length,
      }).where(eq(packageExtractionsTable.id, extractionId));
      await usageEmit("package_pdf.parse.failed", { partnerId, objectType: "package_extraction", objectId: extractionId, meta: { reason: "oversize", bytes: fileBuffer.length } });
      return;
    }

    const fileHash = fingerprintBuffer(fileBuffer);
    await db.update(packageExtractionsTable)
      .set({ fileHash, fileSize: fileBuffer.length, status: "uploaded" })
      .where(eq(packageExtractionsTable.id, extractionId));

    // Stage 2: dedup-from-prior + atomic claim
    if (!opts.forceRerun) {
      const reused = await tryReuseFromPrior(partnerId, fileHash, extractionId);
      if (reused) return;
    }

    let claim = await tryClaim(partnerId, fileHash, extractionId);
    if (!claim.acquired) {
      const ok = claim.ownerExtractionId ? await waitForOwnerParsed(claim.ownerExtractionId) : false;
      if (ok && !opts.forceRerun) {
        const reusedAfterWait = await tryReuseFromPrior(partnerId, fileHash, extractionId);
        if (reusedAfterWait) return;
      }
      const tookOver = claim.ownerExtractionId
        ? await takeOverIfStale(partnerId, fileHash, claim.ownerExtractionId, extractionId)
        : false;
      if (!tookOver) {
        claim = await tryClaim(partnerId, fileHash, extractionId);
        if (!claim.acquired) {
          await db.update(packageExtractionsTable).set({
            status: "parse_failed",
            errorMessage: "Concurrent parse in progress; could not acquire claim",
          }).where(eq(packageExtractionsTable.id, extractionId));
          await usageEmit("package_pdf.parse.failed", { partnerId, objectType: "package_extraction", objectId: extractionId, meta: { reason: "claim_contention", fileHash } });
          return;
        }
      }
    }
    claimedByMe = true;
    acquiredFileHash = fileHash;
    heartbeatTimer = setInterval(() => {
      heartbeatClaim(partnerId, fileHash, extractionId).catch(e => logger.error({ err: e }, "package extraction heartbeat failed"));
    }, CLAIM_HEARTBEAT_MS);
    if (typeof (heartbeatTimer as any).unref === "function") (heartbeatTimer as any).unref();

    // Stage 3: PDF text extraction
    let pdfParse: any;
    try { pdfParse = (await import("pdf-parse")).default; }
    catch {
      await db.update(packageExtractionsTable)
        .set({ status: "parse_failed", errorMessage: "PDF parsing library not available" })
        .where(eq(packageExtractionsTable.id, extractionId));
      await usageEmit("package_pdf.parse.failed", { partnerId, objectType: "package_extraction", objectId: extractionId, meta: { reason: "no_pdf_lib" } });
      return;
    }

    const pdfData = await pdfParse(fileBuffer);
    const totalPages = pdfData.numpages || 1;
    const rawText = (pdfData.text || "").substring(0, PDF_LIMITS.MAX_TEXT_CHARS);
    const pageChunks = rawText.split(/\f/);
    const pageTexts: { page: number; text: string }[] = [];
    for (let i = 0; i < Math.max(pageChunks.length, totalPages); i++) {
      pageTexts.push({ page: i + 1, text: pageChunks[i] || "" });
    }

    await db.update(packageExtractionsTable)
      .set({ status: "text_extracted", totalPages, extractedText: rawText })
      .where(eq(packageExtractionsTable.id, extractionId));

    // Stage 4: chunk identification
    const cleaned = stripBoilerplate(pageTexts);
    const chunks = selectRelevantChunks(cleaned);
    await db.update(packageExtractionsTable)
      .set({ status: "chunked" })
      .where(eq(packageExtractionsTable.id, extractionId));

    // Stage 5: AI extraction
    let parsedRows: ParsedPackageRow[] = [];
    let parseWarnings: { severity: string; code: string; message: string }[] = [];
    let parseSource: "ai" | "rules" = "rules";
    let tokensIn = 0, tokensOut = 0, modelName: string | null = null;

    if (chunks.length > 0) {
      await db.update(packageExtractionsTable).set({ status: "awaiting_ai" })
        .where(eq(packageExtractionsTable.id, extractionId));
      const aiRes = await extractWithOpenAI(chunks, partnerName);
      if (aiRes && aiRes.rows.length > 0) {
        parsedRows = aiRes.rows;
        parseWarnings = aiRes.warnings;
        parseSource = "ai";
        tokensIn = aiRes.tokensIn; tokensOut = aiRes.tokensOut; modelName = aiRes.model;
      }
    }

    // Stage 6: Determine final status. If we got 0 rows OR any row has very low
    // confidence OR there are warnings, use `needs_review` so the UI surfaces
    // a yellow banner. Otherwise `parsed` = green path.
    let finalStatus: "parsed" | "needs_review" | "parse_failed";
    if (parsedRows.length === 0) {
      finalStatus = "needs_review";
      parseWarnings.push({ severity: "warn", code: "no_rows_extracted", message: "No package rows could be extracted automatically — please add manually." });
    } else {
      const hasLowConfidence = parsedRows.some(r => (r._confidence ?? 1) < 0.4);
      finalStatus = (hasLowConfidence || parseWarnings.length > 0) ? "needs_review" : "parsed";
    }

    await db.update(packageExtractionsTable).set({
      status: finalStatus,
      parsedRows: parsedRows as any,
      parseWarnings: parseWarnings as any,
      parseSource,
      processedAt: new Date(),
      aiTokensInput: tokensIn || null,
      aiTokensOutput: tokensOut || null,
      aiModel: modelName,
    }).where(eq(packageExtractionsTable.id, extractionId));

    await usageEmit(parseSource === "ai" ? "package_pdf.parse.ai" : "package_pdf.parse.rules", {
      partnerId, objectType: "package_extraction", objectId: extractionId,
      meta: { rows: parsedRows.length, chunks: chunks.length, tokensIn, tokensOut, model: modelName, fileHash, status: finalStatus },
    });
  } catch (err: any) {
    logger.error({ err }, "Package PDF extraction failed");
    await db.update(packageExtractionsTable)
      .set({ status: "parse_failed", errorMessage: err.message || "Unknown error" })
      .where(eq(packageExtractionsTable.id, extractionId));
    await usageEmit("package_pdf.parse.failed", { partnerId, objectType: "package_extraction", objectId: extractionId, meta: { error: err.message } });
  } finally {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (claimedByMe && acquiredFileHash) {
      try { await releaseClaim(partnerId, acquiredFileHash, extractionId); }
      catch (e) { logger.error({ err: e }, "package extraction releaseClaim failed"); }
    }
  }
}
