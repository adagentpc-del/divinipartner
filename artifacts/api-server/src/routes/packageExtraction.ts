import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db, packageExtractionsTable, partnersTable } from "@workspace/db";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { processPackageExtraction, findPriorParsedPackageExtraction } from "../lib/packageExtraction";
import { commitPackages } from "./imports";
import { logger } from "../lib/logger";
import {
  ListPackageExtractionsResponse, GetPackageExtractionResponse,
  UpdatePackageExtractionResponse, DeletePackageExtractionResponse,
  CheckPackageExtractionDuplicateResponse, RerunPackageExtractionResponse,
  CommitPackageExtractionResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

// All package-extraction endpoints require an authenticated session. This
// closes the IDOR surface: an unauthenticated caller cannot read, edit,
// commit, rerun, or delete another partner's staged extraction by guessing
// numeric ids. Matches the auth pattern used elsewhere (see partners.ts).
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}
router.use(["/package-extractions", "/partners/:partnerId/package-extractions"], requireAuth);

// In-flight statuses where the row is still being mutated by the background
// processor. Both the editor (PATCH) and the committer reject these so an admin
// can't clobber a parse that's still writing.
const IN_FLIGHT_STATUSES = new Set(["processing", "uploaded", "text_extracted", "chunked", "awaiting_ai"]);

// Strict object-storage path validator. The intake endpoint fetches this URL
// server-side via http://localhost:8080/api/storage/objects/<path>, so we must
// reject anything that could escape the object namespace (absolute URLs, dot
// segments, query/fragment strings).
function isSafeObjectStoragePath(p: string): boolean {
  if (!p || typeof p !== "string") return false;
  if (p.length > 1024) return false;
  if (/^[a-z]+:\/\//i.test(p)) return false;       // no http://, file://, etc.
  if (p.includes("?") || p.includes("#")) return false;
  if (p.includes("..")) return false;              // no parent-dir traversal
  if (p.includes("\0")) return false;
  // Object storage paths returned by /storage/uploads/request-url start with
  // "/objects/" (signed-URL flow) or "/public-objects/" (public bucket).
  return /^\/(objects|public-objects)\/[A-Za-z0-9._\-/]+$/.test(p);
}

// Internal-only fields produced by the AI prompt; stripped before commit so
// they don't get treated as unknown columns by the import validator.
const INTERNAL_KEYS = new Set(["_confidence", "_sourcePage", "_groupKey", "_warnings"]);

function stripInternalKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      if (INTERNAL_KEYS.has(k)) continue;
      out[k] = r[k];
    }
    return out;
  });
}

async function fetchSourceFile(sourceFileUrl: string): Promise<Buffer> {
  const fileUrl = sourceFileUrl;
  const internalRes = await fetch(`http://localhost:8080/api/storage/objects/${fileUrl.replace(/^\/+/, "")}`);
  if (internalRes.ok) {
    return Buffer.from(await internalRes.arrayBuffer());
  }
  const storageHost = process.env.REPLIT_OBJECT_STORAGE_URL || `https://${process.env.REPLIT_CONNECTORS_HOSTNAME}`;
  const fetchUrl = fileUrl.startsWith("/") ? `${storageHost}${fileUrl}` : `${storageHost}/${fileUrl}`;
  const externalRes = await fetch(fetchUrl);
  if (!externalRes.ok) throw new Error("Failed to fetch file from storage");
  return Buffer.from(await externalRes.arrayBuffer());
}

// ----- List & detail ---------------------------------------------------------

router.get("/partners/:partnerId/package-extractions", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }
  const rows = await db.select().from(packageExtractionsTable)
    .where(eq(packageExtractionsTable.partnerId, partnerId))
    .orderBy(desc(packageExtractionsTable.createdAt));
  sendValidated(req, res, ListPackageExtractionsResponse, rows, "Package extractions");
});

router.get("/package-extractions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(packageExtractionsTable).where(eq(packageExtractionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Extraction not found" }); return; }
  sendValidated(req, res, GetPackageExtractionResponse, row, "Package extraction");
});

// Pre-flight duplicate check by file hash.
router.get("/partners/:partnerId/package-extractions/check-duplicate", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  const hash = String(req.query.hash || "");
  if (isNaN(partnerId) || !hash) { res.status(400).json({ error: "partnerId and hash required" }); return; }
  const prior = await findPriorParsedPackageExtraction(partnerId, hash);
  sendValidated(req, res, CheckPackageExtractionDuplicateResponse, {
    duplicate: !!prior,
    extractionId: prior?.id || null,
    sourceFileName: prior?.sourceFileName || null,
    processedAt: prior?.processedAt || null,
    parseSource: prior?.parseSource || null,
    totalPages: prior?.totalPages || null,
    rowCount: (prior?.parsedRows as any[] | null)?.length || 0,
  }, "Package extraction duplicate check");
});

// ----- Create + kick off background processing ------------------------------

router.post("/partners/:partnerId/package-extractions", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.partnerId);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const schema = z.object({
    sourceFileUrl: z.string().min(1),
    sourceFileName: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Strict allowlist for the server-side fetch — see isSafeObjectStoragePath.
  if (!isSafeObjectStoragePath(parsed.data.sourceFileUrl)) {
    res.status(400).json({ error: "sourceFileUrl must be an object-storage path like /objects/<id>" });
    return;
  }

  const [extraction] = await db.insert(packageExtractionsTable).values({
    partnerId,
    sourceFileUrl: parsed.data.sourceFileUrl,
    sourceFileName: parsed.data.sourceFileName,
    status: "processing",
  }).returning();

  try {
    const fileBuffer = await fetchSourceFile(parsed.data.sourceFileUrl);
    // Background processing — do NOT await. Client polls GET /package-extractions/:id.
    processPackageExtraction(
      extraction.id, partnerId, partner.companyName,
      fileBuffer, parsed.data.sourceFileName,
    ).catch(err => logger.error({ err, extractionId: extraction.id }, "Background package extraction failed"));
    res.status(201).json(extraction);
  } catch (err: any) {
    await db.update(packageExtractionsTable)
      .set({ status: "parse_failed", errorMessage: err.message || "Storage fetch failed" })
      .where(eq(packageExtractionsTable.id, extraction.id));
    res.status(201).json({ ...extraction, status: "parse_failed", errorMessage: err.message });
  }
});

// ----- Edit staged rows -----------------------------------------------------

const PatchBody = z.object({
  parsedRows: z.array(z.record(z.string(), z.any())).optional(),
  parseWarnings: z.array(z.object({
    severity: z.string(),
    code: z.string(),
    message: z.string(),
  })).optional(),
  status: z.enum(["needs_review", "parsed", "archived"]).optional(),
});

router.patch("/package-extractions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Block edits while parse is mid-flight to avoid clobbering in-progress AI output.
  const [current] = await db.select({ status: packageExtractionsTable.status })
    .from(packageExtractionsTable).where(eq(packageExtractionsTable.id, id));
  if (!current) { res.status(404).json({ error: "Extraction not found" }); return; }
  if (IN_FLIGHT_STATUSES.has(current.status)) {
    res.status(409).json({ error: `Cannot edit while status is "${current.status}" — wait for parse to complete` });
    return;
  }

  const [updated] = await db.update(packageExtractionsTable)
    .set({
      ...(parsed.data.parsedRows !== undefined ? { parsedRows: parsed.data.parsedRows as any } : {}),
      ...(parsed.data.parseWarnings !== undefined ? { parseWarnings: parsed.data.parseWarnings as any } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    })
    .where(eq(packageExtractionsTable.id, id))
    .returning();
  sendValidated(req, res, UpdatePackageExtractionResponse, updated, "Package extraction update");
});

// ----- Commit through existing import pipeline ------------------------------

const CommitBody = z.object({
  mode: z.enum(["create", "update", "upsert"]).default("upsert"),
  // If client provides explicit rows we use them; else we fall back to the
  // server's stored parsedRows. Explicit rows let the UI commit unsaved edits
  // in one shot without a separate PATCH.
  rows: z.array(z.record(z.string(), z.any())).optional(),
});

router.post("/package-extractions/:id/commit", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = CommitBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [extraction] = await db.select().from(packageExtractionsTable).where(eq(packageExtractionsTable.id, id));
  if (!extraction) { res.status(404).json({ error: "Extraction not found" }); return; }
  if (extraction.status === "imported") {
    res.status(409).json({ error: "Already imported. Reset by re-running the parse if you need to commit again." });
    return;
  }
  // Refuse to commit while a parse is still running — otherwise the background
  // processor can later overwrite our `imported` status with `parsed`/`needs_review`,
  // which would let the row be committed a second time.
  if (IN_FLIGHT_STATUSES.has(extraction.status)) {
    res.status(409).json({ error: `Cannot commit while status is "${extraction.status}" — wait for parse to complete` });
    return;
  }

  const sourceRows = body.data.rows ?? (extraction.parsedRows as Record<string, unknown>[] | null) ?? [];
  if (sourceRows.length === 0) { res.status(400).json({ error: "No rows to commit" }); return; }
  const cleaned = stripInternalKeys(sourceRows);

  try {
    const result = await commitPackages(cleaned, body.data.mode, { partnerId: extraction.partnerId });
    // `imported` requires that something actually landed in the DB. A run where
    // every row was skipped (0 created / 0 updated / 0 failed) leaves the row
    // editable so the admin can adjust and retry without a re-parse.
    const landed = (result.created + result.updated) > 0;
    await db.update(packageExtractionsTable).set({
      status: landed ? "imported" : "needs_review",
      committedAt: landed ? new Date() : null,
      // If client passed edited rows, persist them so the staging row reflects what was committed.
      ...(body.data.rows ? { parsedRows: sourceRows as any } : {}),
      commitResult: result as any,
    }).where(eq(packageExtractionsTable.id, id));
    sendValidated(req, res, CommitPackageExtractionResponse, result as unknown as Record<string, unknown>, "Package extraction commit");
  } catch (e: any) {
    logger.error({ err: e, extractionId: id }, "Package extraction commit failed");
    res.status(500).json({ error: e.message || "Commit failed" });
  }
});

// ----- Rerun + delete -------------------------------------------------------

router.post("/package-extractions/:id/rerun", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [extraction] = await db.select().from(packageExtractionsTable).where(eq(packageExtractionsTable.id, id));
  if (!extraction) { res.status(404).json({ error: "Extraction not found" }); return; }
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, extraction.partnerId));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  // Atomic terminal→processing flip: two concurrent rerun requests race on this
  // UPDATE; loser sees 0 rows and gets 409. Prevents duplicate AI runs.
  const TERMINAL = ["parsed", "needs_review", "duplicate_reused", "parse_failed", "imported", "archived"];
  const claimed = await db.update(packageExtractionsTable)
    .set({
      status: "processing", errorMessage: null, parseSource: null,
      dedupedFromId: null, parsedRows: null, parseWarnings: null,
      commitResult: null, committedAt: null,
    })
    .where(and(
      eq(packageExtractionsTable.id, id),
      inArray(packageExtractionsTable.status, TERMINAL),
    ))
    .returning({ id: packageExtractionsTable.id });
  if (claimed.length === 0) {
    res.status(409).json({ error: `Cannot rerun while status is "${extraction.status}"` });
    return;
  }

  try {
    const fileBuffer = await fetchSourceFile(extraction.sourceFileUrl);
    processPackageExtraction(
      id, extraction.partnerId, partner.companyName,
      fileBuffer, extraction.sourceFileName,
      { forceRerun: true },
    ).catch(err => logger.error({ err, extractionId: id }, "Background package rerun failed"));
    sendValidated(req, res, RerunPackageExtractionResponse, { ok: true, id, status: "processing" }, "Package extraction rerun");
  } catch (err: any) {
    await db.update(packageExtractionsTable)
      .set({ status: "parse_failed", errorMessage: err.message || "Storage fetch failed" })
      .where(eq(packageExtractionsTable.id, id));
    res.status(502).json({ error: err.message || "Failed to fetch source file" });
  }
});

router.delete("/package-extractions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(packageExtractionsTable).where(eq(packageExtractionsTable.id, id));
  sendValidated(req, res, DeletePackageExtractionResponse, { ok: true }, "Package extraction delete");
});

export default router;
