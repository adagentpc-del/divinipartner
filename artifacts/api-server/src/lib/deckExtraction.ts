import { db, deckExtractionsTable, deckExtractionItemsTable, deckExtractionClaimsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { emit as usageEmit } from "../services/usageTracking";
import { getOpenAIRestConfig, getModelForTask } from "./aiModels";

/**
 * Try to claim ownership of a (partnerId, fileHash) parse. Backed by a unique
 * primary key on `deck_extraction_claims(partner_id, file_hash)` so the
 * INSERT is atomic across processes. Returns:
 *   - { acquired: true } if this caller owns the parse and may proceed.
 *   - { acquired: false, ownerExtractionId } if a sibling worker already holds
 *     the claim — caller should wait/poll then take the dedup path.
 */
async function tryClaim(partnerId: number, fileHash: string, extractionId: number): Promise<{ acquired: boolean; ownerExtractionId?: number }> {
  // ON CONFLICT DO NOTHING — atomic; returning the inserted row count tells us who won.
  const inserted = await db.insert(deckExtractionClaimsTable)
    .values({ partnerId, fileHash, extractionId })
    .onConflictDoNothing({ target: [deckExtractionClaimsTable.partnerId, deckExtractionClaimsTable.fileHash] })
    .returning({ extractionId: deckExtractionClaimsTable.extractionId });
  if (inserted.length > 0) return { acquired: true };
  const [owner] = await db.select().from(deckExtractionClaimsTable)
    .where(and(eq(deckExtractionClaimsTable.partnerId, partnerId), eq(deckExtractionClaimsTable.fileHash, fileHash)));
  return { acquired: false, ownerExtractionId: owner?.extractionId };
}

/**
 * Owner-scoped release: only deletes the claim when this extraction owns it.
 * Safe to call from a `finally` even if the caller never acquired the claim
 * (predicate just won't match).
 */
async function releaseClaim(partnerId: number, fileHash: string, extractionId: number): Promise<void> {
  await db.delete(deckExtractionClaimsTable).where(and(
    eq(deckExtractionClaimsTable.partnerId, partnerId),
    eq(deckExtractionClaimsTable.fileHash, fileHash),
    eq(deckExtractionClaimsTable.extractionId, extractionId),
  ));
}

const CLAIM_WAIT_MS = 60_000;
const CLAIM_POLL_MS = 1_500;
// Lease length — a claim older than this without a heartbeat refresh is
// considered stale and may be evicted. We refresh every CLAIM_HEARTBEAT_MS
// while the parse is running, so a worker that is still alive can never be
// evicted. CLAIM_STALE_MS must be >> CLAIM_HEARTBEAT_MS to absorb scheduling jitter.
const CLAIM_STALE_MS = 5 * 60_000;
const CLAIM_HEARTBEAT_MS = 30_000;

/** Refresh `started_at` on the owner's claim row. Returns true if the row still exists. */
async function heartbeatClaim(partnerId: number, fileHash: string, extractionId: number): Promise<boolean> {
  const updated = await db.update(deckExtractionClaimsTable)
    .set({ startedAt: new Date() })
    .where(and(
      eq(deckExtractionClaimsTable.partnerId, partnerId),
      eq(deckExtractionClaimsTable.fileHash, fileHash),
      eq(deckExtractionClaimsTable.extractionId, extractionId),
    ))
    .returning({ extractionId: deckExtractionClaimsTable.extractionId });
  return updated.length > 0;
}

/**
 * Atomic stale-claim takeover. Single DELETE conditional on owner-id AND
 * started_at older than CLAIM_STALE_MS — if the owner is still legitimately
 * working (lease fresh) the DELETE matches 0 rows and we abort. Returns
 * true only when this caller successfully evicts the stale owner AND inserts
 * its own claim.
 */
async function takeOverIfStale(partnerId: number, fileHash: string, ownerExtractionId: number, myExtractionId: number): Promise<boolean> {
  const cutoffMs = Date.now() - CLAIM_STALE_MS;
  const evicted = await db.delete(deckExtractionClaimsTable).where(and(
    eq(deckExtractionClaimsTable.partnerId, partnerId),
    eq(deckExtractionClaimsTable.fileHash, fileHash),
    eq(deckExtractionClaimsTable.extractionId, ownerExtractionId),
    sql`${deckExtractionClaimsTable.startedAt} < to_timestamp(${cutoffMs / 1000})`,
  )).returning({ extractionId: deckExtractionClaimsTable.extractionId });
  if (evicted.length === 0) return false; // owner is fresh — do not touch
  const claim = await tryClaim(partnerId, fileHash, myExtractionId);
  return claim.acquired;
}

/** Copy items from a prior `parsed` extraction into this one and mark dedup. */
async function tryReuseFromPrior(partnerId: number, fileHash: string, extractionId: number): Promise<boolean> {
  const [prior] = await db.select().from(deckExtractionsTable).where(and(
    eq(deckExtractionsTable.partnerId, partnerId),
    eq(deckExtractionsTable.fileHash, fileHash),
    eq(deckExtractionsTable.status, "parsed"),
  )).orderBy(desc(deckExtractionsTable.processedAt)).limit(1);
  if (!prior || prior.id === extractionId) return false;
  const priorItems = await db.select().from(deckExtractionItemsTable)
    .where(eq(deckExtractionItemsTable.extractionId, prior.id));
  for (const it of priorItems) {
    const { id: _id, createdAt: _c, updatedAt: _u, extractionId: _e, ...rest } = it as any;
    await db.insert(deckExtractionItemsTable).values({
      ...rest, extractionId, reviewStatus: "pending",
    });
  }
  await db.update(deckExtractionsTable).set({
    status: "duplicate_reused",
    parseSource: "reused_dedup",
    dedupedFromId: prior.id,
    totalPages: prior.totalPages,
    extractedText: prior.extractedText,
    relevantChunks: prior.relevantChunks,
    chunkCount: prior.chunkCount,
    processedAt: new Date(),
  }).where(eq(deckExtractionsTable.id, extractionId));
  await usageEmit("deck.parse.reused", {
    partnerId, objectType: "deck_extraction", objectId: extractionId,
    meta: { dedupedFromId: prior.id, items: priorItems.length, fileHash },
  });
  return true;
}

/** Wait up to CLAIM_WAIT_MS for the owner extraction to reach `parsed`. */
async function waitForOwnerParsed(ownerExtractionId: number): Promise<boolean> {
  const deadline = Date.now() + CLAIM_WAIT_MS;
  while (Date.now() < deadline) {
    const [row] = await db.select({ status: deckExtractionsTable.status })
      .from(deckExtractionsTable).where(eq(deckExtractionsTable.id, ownerExtractionId));
    if (!row) return false;
    if (row.status === "parsed") return true;
    if (row.status === "parse_failed") return false;
    await new Promise(r => setTimeout(r, CLAIM_POLL_MS));
  }
  return false;
}

interface ExtractedItem {
  locationName: string;
  category: string;
  description: string;
  dimensionsText: string | null;
  sizeWidth: number | null;
  sizeHeight: number | null;
  sizeUnit: string;
  sourcePageNumber: number;
  extractedTextSnippet: string;
  confidenceScore: number;
}

// ===== Section 20: PDF AI cost-reduction safeguards =====
export const PDF_LIMITS = {
  MAX_FILE_BYTES: 25 * 1024 * 1024,   // 25 MB hard cap before any AI work
  MAX_TEXT_CHARS: 60_000,             // total cached extracted text
  MAX_AI_INPUT_CHARS: 8_000,          // chars of chunked text per AI call (was 12_000 of full text)
  MAX_CHUNKS: 8,                      // top-N relevant pages
  AI_MAX_OUTPUT_TOKENS: 1500,         // hard cap on completion size
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Wall Graphic": ["wall", "mural", "wallscape", "wall wrap"],
  "Window Decal": ["window", "glass", "glazing"],
  "Column Wrap": ["column", "pillar", "post"],
  "Pole Banner": ["pole", "banner pole", "light pole", "street pole"],
  "Fence Banner": ["fence", "barricade", "barrier"],
  "Floor Graphic": ["floor", "ground", "walkway", "carpet"],
  "Door Graphic": ["door", "entrance", "exit", "elevator"],
  "Directional Signage": ["directional", "wayfinding", "arrow", "directory"],
  "Registration Branding": ["registration", "check-in", "lobby", "reception"],
  "Step and Repeat Zone": ["step and repeat", "step & repeat", "photo backdrop", "press wall"],
  "Sponsor Zone": ["sponsor", "logo wall", "sponsorship"],
};
const ALL_KEYWORDS = Object.values(CATEGORY_KEYWORDS).flat();

function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return "Custom / Other";
}

function parseDimensions(text: string): { width: number | null; height: number | null; unit: string; raw: string | null } {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*['"x×]\s*(\d+(?:\.\d+)?)\s*(feet|ft|inches|in|"|'|cm|m|meters)?/i,
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i,
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      let unit = "inches";
      const rawUnit = (match[3] || "").toLowerCase();
      if (rawUnit.includes("ft") || rawUnit.includes("feet") || rawUnit === "'") unit = "feet";
      else if (rawUnit.includes("cm")) unit = "cm";
      else if (rawUnit.includes("m")) unit = "meters";
      return { width: w, height: h, unit, raw: match[0] };
    }
  }
  return { width: null, height: null, unit: "inches", raw: null };
}

// Deterministic boilerplate stripping: drop short header/footer lines that
// repeat across pages (page numbers, copyright, "confidential", URLs).
export function stripBoilerplate(pages: { page: number; text: string }[]): { page: number; text: string }[] {
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

// Deterministic chunk identification: keep pages that mention any branding
// keyword OR contain a dimensions pattern. Falls back to top-N by length.
export function selectRelevantChunks(pages: { page: number; text: string }[]): { page: number; text: string; reason: string }[] {
  const dimRegex = /(\d+(?:\.\d+)?)\s*['"x×]\s*(\d+(?:\.\d+)?)/i;
  const scored = pages.map(p => {
    const lower = p.text.toLowerCase();
    const kwHits = ALL_KEYWORDS.filter(k => lower.includes(k)).length;
    const hasDim = dimRegex.test(p.text);
    let reason = "";
    if (kwHits && hasDim) reason = `keywords(${kwHits})+dims`;
    else if (kwHits) reason = `keywords(${kwHits})`;
    else if (hasDim) reason = "dims";
    const score = kwHits * 3 + (hasDim ? 2 : 0);
    return { page: p.page, text: p.text, reason, score };
  });
  let relevant = scored.filter(s => s.score > 0);
  if (relevant.length === 0) {
    // No obvious branding language — fall back to longest 3 non-empty pages.
    relevant = scored.filter(s => s.text.trim().length > 200)
      .sort((a, b) => b.text.length - a.text.length).slice(0, 3)
      .map(s => ({ ...s, reason: "fallback_longest" }));
  }
  return relevant
    .sort((a, b) => b.score - a.score)
    .slice(0, PDF_LIMITS.MAX_CHUNKS)
    .map(({ page, text, reason }) => ({ page, text, reason }));
}

async function extractWithOpenAI(
  chunks: { page: number; text: string; reason: string }[],
): Promise<{ items: ExtractedItem[]; tokensIn: number; tokensOut: number; model: string } | null> {
  const cfg = getOpenAIRestConfig();
  if (!cfg) return null;
  const { baseUrl, apiKey } = cfg;

  // Compact prompt — chunks only, no full document, hard input cap.
  let payloadText = chunks.map(c => `--- Page ${c.page} (${c.reason}) ---\n${c.text}`).join("\n\n");
  if (payloadText.length > PDF_LIMITS.MAX_AI_INPUT_CHARS) {
    payloadText = payloadText.substring(0, PDF_LIMITS.MAX_AI_INPUT_CHARS);
  }

  const model = getModelForTask("deckExtraction");
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
          // Tight system prompt — no narrative, no examples, no repeated platform context.
          { role: "system", content:
            'Extract venue branding locations. Return JSON {"locations":[{locationName,category,description,dimensionsText,sizeWidth,sizeHeight,sizeUnit,sourcePageNumber,extractedTextSnippet,confidenceScore}]}. ' +
            'category one of: Wall Graphic, Window Decal, Column Wrap, Pole Banner, Fence Banner, Floor Graphic, Door Graphic, Directional Signage, Registration Branding, Step and Repeat Zone, Sponsor Zone, Custom / Other. ' +
            'sizeUnit: inches|feet|cm|meters. confidenceScore 0-1. Keep snippets <200 chars. Skip cover pages and boilerplate.' },
          { role: "user", content: payloadText },
        ],
      }),
    });
    if (!res.ok) {
      console.error("OpenAI extraction failed", await res.text());
      return null;
    }
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const locations = parsed.locations || [];
    return {
      items: locations.map((loc: any) => ({
        locationName: loc.locationName || "Unknown Location",
        category: loc.category || "Custom / Other",
        description: loc.description || "",
        dimensionsText: loc.dimensionsText || null,
        sizeWidth: loc.sizeWidth || null,
        sizeHeight: loc.sizeHeight || null,
        sizeUnit: loc.sizeUnit || "inches",
        sourcePageNumber: loc.sourcePageNumber || 1,
        extractedTextSnippet: (loc.extractedTextSnippet || "").substring(0, 200),
        confidenceScore: Math.min(1, Math.max(0, loc.confidenceScore || 0.5)),
      })),
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
      model,
    };
  } catch (err) {
    console.error("OpenAI extraction error:", err);
    return null;
  }
}

function extractWithRules(textPages: { page: number; text: string }[]): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  for (const { page, text } of textPages) {
    if (!text || text.trim().length < 20) continue;
    const lines = text.split(/\n/).filter(l => l.trim().length > 3);
    const dims = parseDimensions(text);
    const category = guessCategory(text);
    // Cap at 200 chars to match `extractedTextSnippet` policy in PDF_LIMITS docs.
    const snippet = text.substring(0, 200).trim();
    const titleLine = lines.find(l => l.trim().length > 3 && l.trim().length < 80) || `Page ${page} Location`;
    items.push({
      locationName: titleLine.trim().replace(/^[•\-\*\d\.]+\s*/, ""),
      category, description: "",
      dimensionsText: dims.raw, sizeWidth: dims.width, sizeHeight: dims.height, sizeUnit: dims.unit,
      sourcePageNumber: page, extractedTextSnippet: snippet,
      confidenceScore: category !== "Custom / Other" ? 0.4 : 0.2,
    });
  }
  return items;
}

export function fingerprintBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Look for a prior `parsed` extraction for the same partner+hash. Used by the
 * upload route for a pre-flight duplicate-check, and by processDeckExtraction
 * to skip work when a duplicate is detected after upload.
 */
export async function findPriorParsedExtraction(partnerId: number, fileHash: string) {
  const rows = await db.select().from(deckExtractionsTable)
    .where(and(
      eq(deckExtractionsTable.partnerId, partnerId),
      eq(deckExtractionsTable.fileHash, fileHash),
      eq(deckExtractionsTable.status, "parsed"),
    ))
    .orderBy(desc(deckExtractionsTable.processedAt))
    .limit(1);
  return rows[0] || null;
}

export interface ProcessOptions {
  /** Force a fresh parse even if a duplicate exists. */
  forceRerun?: boolean;
}

export async function processDeckExtraction(
  extractionId: number,
  partnerId: number,
  fileBuffer: Buffer,
  fileName: string,
  opts: ProcessOptions = {},
): Promise<void> {
  // True only after this process atomically inserts a claim row for
  // (partnerId, fileHash, extractionId). Gates the finally-block release so
  // we never delete a claim owned by another extraction.
  let claimedByMe = false;
  let acquiredFileHash: string | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  try {
    // ---- Stage 1: file metadata + safeguards (no AI) ----
    if (fileBuffer.length > PDF_LIMITS.MAX_FILE_BYTES) {
      await db.update(deckExtractionsTable).set({
        status: "parse_failed",
        errorMessage: `File exceeds ${PDF_LIMITS.MAX_FILE_BYTES} byte limit`,
        fileSize: fileBuffer.length,
      }).where(eq(deckExtractionsTable.id, extractionId));
      await usageEmit("deck.parse.failed", { partnerId, objectType: "deck_extraction", objectId: extractionId, meta: { reason: "oversize", bytes: fileBuffer.length } });
      return;
    }
    const fileHash = fingerprintBuffer(fileBuffer);
    await db.update(deckExtractionsTable)
      .set({ fileHash, fileSize: fileBuffer.length, status: "uploaded" })
      .where(eq(deckExtractionsTable.id, extractionId));

    // ---- Stage 2: dedup + concurrency-safe claim (no AI) ----
    // Cheap reuse path is skipped on forceRerun (admin explicitly wants AI to run again),
    // but BOTH normal and forceRerun paths must acquire the (partnerId,fileHash) claim
    // so that an admin rerun can never run concurrently with a parallel upload of the
    // same file (which would double-bill AI across two extractions).
    if (!opts.forceRerun) {
      const reused = await tryReuseFromPrior(partnerId, fileHash, extractionId);
      if (reused) return;
    }

    // Atomic claim: PK on (partner_id, file_hash) ensures only one worker holds it.
    let claim = await tryClaim(partnerId, fileHash, extractionId);
    if (!claim.acquired) {
      // Sibling parse is already in flight. Wait for it.
      const ok = claim.ownerExtractionId ? await waitForOwnerParsed(claim.ownerExtractionId) : false;
      if (ok && !opts.forceRerun) {
        const reusedAfterWait = await tryReuseFromPrior(partnerId, fileHash, extractionId);
        if (reusedAfterWait) return;
      }
      // Try to take over only if the claim is provably stale (heartbeat lapsed).
      // Otherwise owner is still legitimately working — we must NOT evict it.
      const tookOver = claim.ownerExtractionId
        ? await takeOverIfStale(partnerId, fileHash, claim.ownerExtractionId, extractionId)
        : false;
      if (!tookOver) {
        // One last chance: maybe owner finished and released between waitForOwnerParsed
        // and takeOverIfStale (e.g. it was cleared by finally-block). Try fresh claim.
        claim = await tryClaim(partnerId, fileHash, extractionId);
        if (!claim.acquired) {
          await db.update(deckExtractionsTable).set({
            status: "parse_failed",
            errorMessage: "Concurrent parse in progress; could not acquire claim",
          }).where(eq(deckExtractionsTable.id, extractionId));
          await usageEmit("deck.parse.failed", { partnerId, objectType: "deck_extraction", objectId: extractionId, meta: { reason: "claim_contention", fileHash } });
          return;
        }
      }
    }
    claimedByMe = true;
    acquiredFileHash = fileHash;
    // Start a heartbeat so a long-running parse (>CLAIM_STALE_MS) can never be
    // evicted by a sibling worker mistaking us for stale.
    heartbeatTimer = setInterval(() => {
      heartbeatClaim(partnerId, fileHash, extractionId).catch(e => console.error("heartbeat failed", e));
    }, CLAIM_HEARTBEAT_MS);
    if (typeof (heartbeatTimer as any).unref === "function") (heartbeatTimer as any).unref();

    // ---- Stage 3: text extraction in code ----
    let PDFParseCls: typeof import("pdf-parse").PDFParse;
    try {
      PDFParseCls = (await import("pdf-parse")).PDFParse;
    } catch {
      await db.update(deckExtractionsTable)
        .set({ status: "parse_failed", errorMessage: "PDF parsing library not available" })
        .where(eq(deckExtractionsTable.id, extractionId));
      await usageEmit("deck.parse.failed", { partnerId, objectType: "deck_extraction", objectId: extractionId, meta: { reason: "no_pdf_lib" } });
      return;
    }

    const pdfData = await new PDFParseCls({ data: fileBuffer }).getText();
    const totalPages = pdfData.total || 1;
    const rawText = (pdfData.text || "").substring(0, PDF_LIMITS.MAX_TEXT_CHARS);
    const pageChunks = rawText.split(/\f/);
    const pageTexts: { page: number; text: string }[] = [];
    for (let i = 0; i < Math.max(pageChunks.length, totalPages); i++) {
      pageTexts.push({ page: i + 1, text: pageChunks[i] || "" });
    }

    await db.update(deckExtractionsTable)
      .set({ status: "text_extracted", totalPages, extractedText: rawText })
      .where(eq(deckExtractionsTable.id, extractionId));

    // ---- Stage 4: deterministic chunk identification (no AI) ----
    const cleaned = stripBoilerplate(pageTexts);
    const chunks = selectRelevantChunks(cleaned);
    await db.update(deckExtractionsTable).set({
      status: "chunked",
      relevantChunks: chunks as any,
      chunkCount: chunks.length,
    }).where(eq(deckExtractionsTable.id, extractionId));

    // ---- Stage 5: AI only on chunks; persist tokens ----
    let extractedItems: ExtractedItem[] = [];
    let parseSource: "ai" | "rules" = "rules";
    let tokensIn = 0, tokensOut = 0, modelName: string | null = null;
    if (chunks.length > 0) {
      await db.update(deckExtractionsTable).set({ status: "awaiting_ai" })
        .where(eq(deckExtractionsTable.id, extractionId));
      const aiRes = await extractWithOpenAI(chunks);
      if (aiRes && aiRes.items.length > 0) {
        extractedItems = aiRes.items; parseSource = "ai";
        tokensIn = aiRes.tokensIn; tokensOut = aiRes.tokensOut; modelName = aiRes.model;
      }
    }
    if (extractedItems.length === 0) {
      extractedItems = extractWithRules(cleaned);
      parseSource = "rules";
    }
    if (extractedItems.length === 0) {
      for (let i = 0; i < totalPages; i++) {
        extractedItems.push({
          locationName: `Page ${i + 1} - Review Required`,
          category: "Custom / Other",
          description: "No specific branding location detected on this page. Manual review required.",
          dimensionsText: null, sizeWidth: null, sizeHeight: null, sizeUnit: "inches",
          sourcePageNumber: i + 1,
          extractedTextSnippet: (pageTexts[i]?.text || "").substring(0, 200),
          confidenceScore: 0.1,
        });
      }
    }

    for (const item of extractedItems) {
      await db.insert(deckExtractionItemsTable).values({
        extractionId, partnerId,
        locationName: item.locationName, category: item.category, description: item.description,
        dimensionsText: item.dimensionsText, sizeWidth: item.sizeWidth, sizeHeight: item.sizeHeight,
        sizeUnit: item.sizeUnit, sourcePageNumber: item.sourcePageNumber,
        extractedTextSnippet: item.extractedTextSnippet, confidenceScore: item.confidenceScore,
        reviewStatus: "pending",
      });
    }

    await db.update(deckExtractionsTable).set({
      status: "parsed",
      parseSource, processedAt: new Date(),
      aiTokensInput: tokensIn || null, aiTokensOutput: tokensOut || null, aiModel: modelName,
    }).where(eq(deckExtractionsTable.id, extractionId));

    await usageEmit(parseSource === "ai" ? "deck.parse.ai" : "deck.parse.rules", {
      partnerId, objectType: "deck_extraction", objectId: extractionId,
      meta: { items: extractedItems.length, chunks: chunks.length, tokensIn, tokensOut, model: modelName, fileHash },
    });
  } catch (err: any) {
    console.error("Deck extraction failed:", err);
    await db.update(deckExtractionsTable)
      .set({ status: "parse_failed", errorMessage: err.message || "Unknown error" })
      .where(eq(deckExtractionsTable.id, extractionId));
    await usageEmit("deck.parse.failed", { partnerId, objectType: "deck_extraction", objectId: extractionId, meta: { error: err.message } });
  } finally {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    // Owner-scoped release: only delete the claim row when this process
    // actually inserted it. Predicate also matches extractionId, so even if
    // claimedByMe were stale we couldn't evict another owner's claim.
    if (claimedByMe && acquiredFileHash) {
      try { await releaseClaim(partnerId, acquiredFileHash, extractionId); }
      catch (e) { console.error("releaseClaim failed", e); }
    }
  }
}
