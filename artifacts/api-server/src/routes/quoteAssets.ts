import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, or, isNull } from "drizzle-orm";
import {
  db,
  quoteAssetsTable,
  quoteAssetMappingsTable,
  productSpecStandardsTable,
  productCatalogTable,
  packagesTable,
  partnerBrandingLocationsTable,
  suppliersTable,
} from "@workspace/db";
import { z } from "zod";
import crypto from "crypto";
import { parseBillingSignalsFromPdf } from "../lib/billingSignals";

const SOURCE_TYPES = ["quote", "spec_sheet", "screenshot", "website_reference", "erp_export", "manual_note", "prior_job_reference"] as const;
const PROCESSING_STATUSES = ["new", "needs_review", "needs_clarification", "mapped", "approved", "superseded", "archived"] as const;
const MAPPING_TYPES = ["product", "package", "branding_zone", "supplier"] as const;

const QuoteAssetBody = z.object({
  attachableType: z.enum(["product", "package", "branding_zone", "supplier"]).optional(),
  attachableId: z.number().int().optional(),
  name: z.string().min(1).optional(),
  fileUrl: z.string().min(1).optional(),
  fileType: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  isApprovedStandard: z.boolean().optional(),
  internalOnly: z.boolean().optional(),
  vendorVisible: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  uploadedBy: z.string().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  processingStatus: z.enum(PROCESSING_STATUSES).optional(),
  confidenceFlag: z.enum(["high", "medium", "low"]).nullable().optional(),
  extractedDisplayName: z.string().nullable().optional(),
  extractedInternalName: z.string().nullable().optional(),
  extractedCategory: z.string().nullable().optional(),
  customerFacingSummary: z.string().nullable().optional(),
  backendOpsSummary: z.string().nullable().optional(),
  dimensionsSummary: z.string().nullable().optional(),
  materialSummary: z.string().nullable().optional(),
  finishingSummary: z.string().nullable().optional(),
  attachmentSummary: z.string().nullable().optional(),
  hardwareSummary: z.string().nullable().optional(),
  leadTimeText: z.string().nullable().optional(),
  printFileRequirements: z.string().nullable().optional(),
  installNotes: z.string().nullable().optional(),
  opsNotes: z.string().nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
  clarificationNeeded: z.string().nullable().optional(),
  missingDataFlagsJson: z.array(z.string()).nullable().optional(),
});

function isValidStoragePath(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.includes("..")) return false;
  if (url.startsWith("/") && !url.startsWith("/objects/")) return false;
  return true;
}

const router: IRouter = Router();

// ===== Quote Assets list with rich filters =====
router.get("/quote-assets", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (q.attachableType) conditions.push(eq(quoteAssetsTable.attachableType, q.attachableType));
  if (q.attachableId) conditions.push(eq(quoteAssetsTable.attachableId, parseInt(q.attachableId)));
  if (q.sourceType) conditions.push(eq(quoteAssetsTable.sourceType, q.sourceType));
  if (q.processingStatus) conditions.push(eq(quoteAssetsTable.processingStatus, q.processingStatus));
  if (q.supplierId) conditions.push(eq(quoteAssetsTable.supplierId, parseInt(q.supplierId)));

  const rows = conditions.length
    ? await db.select().from(quoteAssetsTable).where(and(...conditions)).orderBy(quoteAssetsTable.createdAt)
    : await db.select().from(quoteAssetsTable).orderBy(quoteAssetsTable.createdAt);

  // Decorate with mappings count
  if (rows.length === 0) { res.json([]); return; }
  const ids = rows.map(r => r.id);
  const allMappings = await db.select().from(quoteAssetMappingsTable).where(inArray(quoteAssetMappingsTable.quoteAssetId, ids));
  const byId = new Map<number, any[]>();
  for (const m of allMappings) {
    if (!byId.has(m.quoteAssetId)) byId.set(m.quoteAssetId, []);
    byId.get(m.quoteAssetId)!.push(m);
  }
  let decorated = rows.map(r => {
    const m = byId.get(r.id) || [];
    return {
      ...r,
      mappings: m,
      mappingCount: m.length,
      hasMissingData: !!(r.missingDataFlagsJson && r.missingDataFlagsJson.length > 0),
    };
  });

  if (q.mappingStatus === "mapped") decorated = decorated.filter(r => r.mappingCount > 0);
  if (q.mappingStatus === "unmapped") decorated = decorated.filter(r => r.mappingCount === 0);
  if (q.missingDataOnly === "true" || q.missingDataOnly === "1") decorated = decorated.filter(r => r.hasMissingData);
  if (q.expiredOnly === "true" || q.expiredOnly === "1") {
    const today = new Date().toISOString().slice(0, 10);
    decorated = decorated.filter(r => r.expirationDate && r.expirationDate < today);
  }
  if (q.search) {
    const s = q.search.toLowerCase();
    decorated = decorated.filter(r =>
      r.name.toLowerCase().includes(s) ||
      (r.supplierName || "").toLowerCase().includes(s) ||
      (r.extractedDisplayName || "").toLowerCase().includes(s) ||
      (r.notes || "").toLowerCase().includes(s)
    );
  }

  res.json(decorated);
});

// ===== Ingestion stats overview =====
router.get("/quote-ingestion/stats", async (_req, res) => {
  const all = await db.select().from(quoteAssetsTable);
  const today = new Date().toISOString().slice(0, 10);
  const allMappings = await db.select().from(quoteAssetMappingsTable);
  const mappedIds = new Set(allMappings.map(m => m.quoteAssetId));
  const stats = {
    total: all.length,
    new: all.filter(r => r.processingStatus === "new").length,
    needsReview: all.filter(r => r.processingStatus === "needs_review").length,
    needsClarification: all.filter(r => r.processingStatus === "needs_clarification").length,
    mapped: all.filter(r => r.processingStatus === "mapped").length,
    approved: all.filter(r => r.processingStatus === "approved").length,
    archived: all.filter(r => r.processingStatus === "archived").length,
    expired: all.filter(r => r.expirationDate && r.expirationDate < today).length,
    missingData: all.filter(r => r.missingDataFlagsJson && r.missingDataFlagsJson.length > 0).length,
    unmapped: all.filter(r => !mappedIds.has(r.id)).length,
    bySourceType: SOURCE_TYPES.reduce((acc, t) => ({ ...acc, [t]: all.filter(r => r.sourceType === t).length }), {} as Record<string, number>),
  };
  res.json(stats);
});

router.post("/quote-assets", async (req, res): Promise<void> => {
  const parsed = QuoteAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!parsed.data.name || !parsed.data.fileUrl) { res.status(400).json({ error: "name and fileUrl required" }); return; }
  if (!isValidStoragePath(parsed.data.fileUrl)) { res.status(400).json({ error: "Invalid file URL" }); return; }
  const insertData: any = {
    ...parsed.data,
    attachableType: parsed.data.attachableType || "product",
    attachableId: parsed.data.attachableId ?? 0,
  };
  const [row] = await db.insert(quoteAssetsTable).values(insertData).returning();

  // Section 21: trigger billing-signals parse for PDF uploads in the background.
  // Does NOT block the response — admin can refresh the drawer to see results.
  // Cost-conscious: regex-first; AI fallback only if regex finds nothing.
  if (row && (/\.pdf(\?|$)/i.test(row.fileUrl) || row.fileType === "application/pdf")) {
    triggerBillingSignalsParse(row.id, row.fileUrl).catch(e => console.error("billing-signals trigger failed", e));
  }

  res.status(201).json(row);
});

/**
 * Background billing-signals parser. Fetches the file via the internal
 * storage proxy, runs deterministic + (optional) AI parse, and writes the
 * results onto the quote_asset row. Cached: a re-run that supplies the same
 * file_hash returns immediately.
 */
async function triggerBillingSignalsParse(assetId: number, fileUrl: string, opts: { forceRerun?: boolean } = {}): Promise<void> {
  // Race/cost guard: atomically claim this row for parsing. If another worker
  // already holds the claim (parsedSource='in_progress'), we exit. The claim
  // is released by the final UPDATE that writes the result, or by a TTL guard
  // (older than 5 minutes) for crash recovery.
  const STALE_MS = 5 * 60 * 1000;
  const claimResult = await db.update(quoteAssetsTable)
    .set({ parsedSource: "in_progress", parsedAt: new Date() })
    .where(and(
      eq(quoteAssetsTable.id, assetId),
      // Only claim if not already in progress, OR if the in-progress claim is stale.
      // Drizzle: use SQL to express the OR cleanly.
      sql`(${quoteAssetsTable.parsedSource} IS DISTINCT FROM 'in_progress'
            OR ${quoteAssetsTable.parsedAt} < ${new Date(Date.now() - STALE_MS)})`
    ))
    .returning({ id: quoteAssetsTable.id });
  if (claimResult.length === 0) {
    console.log(`[billingSignals] skip ${assetId}: another worker holds the claim`);
    return;
  }

  // Strip the leading slash and prepend the storage proxy mount.
  // fileUrl is stored as `/objects/<key>` (per upload flow); the storage
  // route is mounted at `/api/storage`, so the final URL is
  // `http://localhost:8080/api/storage/objects/<key>`.
  const cleanPath = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  const fetchUrl = `http://localhost:8080/api/storage${cleanPath}`;
  let buf: Buffer;
  try {
    const r = await fetch(fetchUrl);
    if (!r.ok) {
      await db.update(quoteAssetsTable).set({
        parsedSource: "failed", parsedAt: new Date(),
        parsedBillingFlagsJson: ["fetch_failed", "manual_review_needed"],
      }).where(eq(quoteAssetsTable.id, assetId));
      return;
    }
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    await db.update(quoteAssetsTable).set({
      parsedSource: "failed", parsedAt: new Date(),
      parsedBillingFlagsJson: ["fetch_failed", "manual_review_needed"],
    }).where(eq(quoteAssetsTable.id, assetId));
    return;
  }
  const fileHash = crypto.createHash("sha256").update(buf).digest("hex");

  // Cross-row file_hash dedup: if ANY other row in quote_assets has a
  // successful parse for the exact same file (matched by sha256), copy its
  // parsed_* fields onto this row instead of re-parsing. Zero AI cost on
  // duplicate uploads. Skipped on forceRerun.
  if (!opts.forceRerun) {
    const dups = await db.select().from(quoteAssetsTable).where(and(
      eq(quoteAssetsTable.fileHash, fileHash),
      sql`${quoteAssetsTable.id} != ${assetId}`,
      sql`${quoteAssetsTable.parsedSource} IN ('rules','ai')`,
    )).limit(1);
    if (dups[0]) {
      const d = dups[0];
      await db.update(quoteAssetsTable).set({
        fileHash,
        extractedText: d.extractedText,
        parsedAt: new Date(),
        parsedSource: d.parsedSource,
        parsedReviewStatus: "pending",
        parsedCurrency: d.parsedCurrency,
        parsedCurrencyConfidence: d.parsedCurrencyConfidence,
        parsedTaxLabel: d.parsedTaxLabel,
        parsedTaxRate: d.parsedTaxRate,
        parsedTaxAmount: d.parsedTaxAmount,
        parsedTaxInclusive: d.parsedTaxInclusive,
        parsedSubtotalAmount: d.parsedSubtotalAmount,
        parsedTotalAmount: d.parsedTotalAmount,
        parsedQuoteReference: d.parsedQuoteReference,
        parsedSupplierName: d.parsedSupplierName,
        parsedPaymentTerms: d.parsedPaymentTerms,
        parsedDepositAmount: d.parsedDepositAmount,
        parsedBillingCountry: d.parsedBillingCountry,
        parsedIncoterm: d.parsedIncoterm,
        parsedBillingNotes: d.parsedBillingNotes,
        parsedBillingFlagsJson: [...(d.parsedBillingFlagsJson || []), "reused_dedup"],
        parsedMissingFieldsJson: d.parsedMissingFieldsJson,
        parsedAiTokensInput: 0,
        parsedAiTokensOutput: 0,
      } as any).where(eq(quoteAssetsTable.id, assetId));
      console.log(`[billingSignals] reused parse from row #${d.id} for asset ${assetId}`);
      return;
    }
  }

  // Same-row idempotency: if this row already has a successful parse for the
  // exact same file_hash (e.g. duplicate trigger for the same upload), skip.
  if (!opts.forceRerun) {
    const [existing] = await db.select().from(quoteAssetsTable).where(eq(quoteAssetsTable.id, assetId));
    if (existing?.fileHash === fileHash && existing?.parsedSource && !["in_progress", "failed"].includes(existing.parsedSource)) {
      // Restore original parsedAt by leaving as-is; nothing else to do.
      return;
    }
  }

  const result = await parseBillingSignalsFromPdf(buf);
  if (!result) {
    await db.update(quoteAssetsTable).set({
      fileHash, parsedSource: "failed", parsedAt: new Date(),
      parsedBillingFlagsJson: ["parse_failed", "manual_review_needed"],
    }).where(eq(quoteAssetsTable.id, assetId));
    return;
  }
  const s = result.signals;
  await db.update(quoteAssetsTable).set({
    fileHash,
    extractedText: result.extractedText,
    parsedAt: new Date(),
    parsedSource: s.source,
    parsedReviewStatus: "pending",
    parsedCurrency: s.currency,
    parsedCurrencyConfidence: s.currencyConfidence,
    parsedTaxLabel: s.taxLabel,
    parsedTaxRate: s.taxRate != null ? String(s.taxRate) : null,
    parsedTaxAmount: s.taxAmount != null ? String(s.taxAmount) : null,
    parsedTaxInclusive: s.taxInclusive,
    parsedSubtotalAmount: s.subtotalAmount != null ? String(s.subtotalAmount) : null,
    parsedTotalAmount: s.totalAmount != null ? String(s.totalAmount) : null,
    parsedQuoteReference: s.quoteReference,
    parsedSupplierName: s.supplierName,
    parsedPaymentTerms: s.paymentTerms,
    parsedDepositAmount: s.depositAmount != null ? String(s.depositAmount) : null,
    parsedBillingCountry: s.billingCountry,
    parsedIncoterm: s.incoterm,
    parsedBillingNotes: s.billingNotes,
    parsedBillingFlagsJson: s.flags,
    parsedMissingFieldsJson: s.missingFields,
    parsedAiTokensInput: s.aiTokensInput ?? null,
    parsedAiTokensOutput: s.aiTokensOutput ?? null,
  } as any).where(eq(quoteAssetsTable.id, assetId));
}

// ===== Billing signals review actions =====
router.post("/quote-assets/:id/billing-signals/approve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(quoteAssetsTable)
    .set({ parsedReviewStatus: "approved" })
    .where(eq(quoteAssetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});
router.post("/quote-assets/:id/billing-signals/dismiss", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(quoteAssetsTable)
    .set({ parsedReviewStatus: "dismissed" })
    .where(eq(quoteAssetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});
router.post("/quote-assets/:id/billing-signals/rerun", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(quoteAssetsTable).where(eq(quoteAssetsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (!/\.pdf(\?|$)/i.test(row.fileUrl) && row.fileType !== "application/pdf") {
    res.status(400).json({ error: "Not a PDF" }); return;
  }
  triggerBillingSignalsParse(id, row.fileUrl, { forceRerun: true }).catch(e => console.error("rerun failed", e));
  res.json({ ok: true });
});

router.patch("/quote-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = QuoteAssetBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.fileUrl && !isValidStoragePath(parsed.data.fileUrl)) { res.status(400).json({ error: "Invalid file URL" }); return; }
  const [row] = await db.update(quoteAssetsTable).set(parsed.data).where(eq(quoteAssetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/quote-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(quoteAssetMappingsTable).where(eq(quoteAssetMappingsTable.quoteAssetId, id));
  await db.delete(quoteAssetsTable).where(eq(quoteAssetsTable.id, id));
  res.json({ success: true });
});

// ===== Bulk update =====
const BulkBody = z.object({
  ids: z.array(z.number().int()).min(1),
  patch: z.object({
    processingStatus: z.enum(PROCESSING_STATUSES).optional(),
    supplierId: z.number().int().nullable().optional(),
    sourceType: z.enum(SOURCE_TYPES).optional(),
    isApprovedStandard: z.boolean().optional(),
  }),
});
router.post("/quote-assets/bulk-update", async (req, res): Promise<void> => {
  const parsed = BulkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(quoteAssetsTable).set(parsed.data.patch).where(inArray(quoteAssetsTable.id, parsed.data.ids));
  res.json({ success: true, count: parsed.data.ids.length });
});

// ===== Mappings (m2m) =====
router.get("/quote-assets/:id/mappings", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(quoteAssetMappingsTable).where(eq(quoteAssetMappingsTable.quoteAssetId, id));

  // Decorate with names
  const productIds = rows.filter(r => r.mappingType === "product").map(r => r.mappingId);
  const packageIds = rows.filter(r => r.mappingType === "package").map(r => r.mappingId);
  const zoneIds = rows.filter(r => r.mappingType === "branding_zone").map(r => r.mappingId);
  const supplierIds = rows.filter(r => r.mappingType === "supplier").map(r => r.mappingId);
  const products = productIds.length ? await db.select({ id: productCatalogTable.id, name: productCatalogTable.name, displayName: productCatalogTable.displayName }).from(productCatalogTable).where(inArray(productCatalogTable.id, productIds)) : [];
  const packages = packageIds.length ? await db.select({ id: packagesTable.id, name: packagesTable.name }).from(packagesTable).where(inArray(packagesTable.id, packageIds)) : [];
  const zones = zoneIds.length ? await db.select({ id: partnerBrandingLocationsTable.id, name: partnerBrandingLocationsTable.name }).from(partnerBrandingLocationsTable).where(inArray(partnerBrandingLocationsTable.id, zoneIds)) : [];
  const suppliers = supplierIds.length ? await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable).where(inArray(suppliersTable.id, supplierIds)) : [];
  const nameOf = (type: string, id: number): string => {
    if (type === "product") { const p = products.find(x => x.id === id); return p ? (p.displayName || p.name) : `#${id}`; }
    if (type === "package") return packages.find(x => x.id === id)?.name || `#${id}`;
    if (type === "branding_zone") return zones.find(x => x.id === id)?.name || `#${id}`;
    if (type === "supplier") return suppliers.find(x => x.id === id)?.name || `#${id}`;
    return `#${id}`;
  };
  res.json(rows.map(r => ({ ...r, label: nameOf(r.mappingType, r.mappingId) })));
});

const MappingBody = z.object({
  mappingType: z.enum(MAPPING_TYPES),
  mappingId: z.number().int(),
  note: z.string().nullable().optional(),
});
router.post("/quote-assets/:id/mappings", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = MappingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Prevent dupes
  const existing = await db.select().from(quoteAssetMappingsTable).where(and(
    eq(quoteAssetMappingsTable.quoteAssetId, id),
    eq(quoteAssetMappingsTable.mappingType, parsed.data.mappingType),
    eq(quoteAssetMappingsTable.mappingId, parsed.data.mappingId),
  ));
  if (existing.length > 0) { res.json(existing[0]); return; }
  const [row] = await db.insert(quoteAssetMappingsTable).values({ quoteAssetId: id, ...parsed.data }).returning();
  // Auto-bump processingStatus from new → mapped
  await db.update(quoteAssetsTable).set({ processingStatus: "mapped" }).where(and(eq(quoteAssetsTable.id, id), eq(quoteAssetsTable.processingStatus, "new")));
  res.status(201).json(row);
});

router.delete("/quote-assets/:id/mappings/:mappingId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const mid = parseInt(req.params.mappingId);
  if (isNaN(id) || isNaN(mid)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(quoteAssetMappingsTable).where(and(eq(quoteAssetMappingsTable.id, mid), eq(quoteAssetMappingsTable.quoteAssetId, id)));
  res.json({ success: true });
});

// ===== Promote source → new product =====
const PromoteBody = z.object({
  category: z.string().min(1),
  displayName: z.string().optional(),
  internalName: z.string().optional(),
  customerFacingSummary: z.string().nullable().optional(),
  copyAsSpecStandard: z.boolean().optional(),
});
router.post("/quote-assets/:id/promote", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PromoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [src] = await db.select().from(quoteAssetsTable).where(eq(quoteAssetsTable.id, id));
  if (!src) { res.status(404).json({ error: "Source not found" }); return; }

  const baseName = parsed.data.internalName || src.extractedInternalName || src.extractedDisplayName || src.name;
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);

  try {
    const product = await db.transaction(async (tx) => {
      const [p] = await tx.insert(productCatalogTable).values({
        name: baseName,
        displayName: parsed.data.displayName || src.extractedDisplayName || baseName,
        slug,
        category: parsed.data.category || src.extractedCategory || "uncategorized",
        description: src.customerFacingSummary || null,
        customerFacingSummary: parsed.data.customerFacingSummary ?? src.customerFacingSummary ?? null,
        backendProductionNotes: src.backendOpsSummary,
        installNotes: src.installNotes,
        internalOpsSummary: src.opsNotes,
        attachmentMethod: src.attachmentSummary,
        material: src.materialSummary,
        finishing: src.finishingSummary,
        visibleDimensions: src.dimensionsSummary,
        supplierId: src.supplierId,
        leadTimeDays: null,
        reviewStatus: "in_review",
        missingDataFlagsJson: src.missingDataFlagsJson || [],
        isActive: true,
        isOrderable: false,
      } as any).returning();

      await tx.insert(quoteAssetMappingsTable).values({ quoteAssetId: id, mappingType: "product", mappingId: p.id });

      // Also set legacy attachable* so the product Sources tab continues to work
      const setPatch: any = { processingStatus: "mapped" };
      if (!src.attachableType || src.attachableId === 0) {
        setPatch.attachableType = "product";
        setPatch.attachableId = p.id;
      }
      await tx.update(quoteAssetsTable).set(setPatch).where(eq(quoteAssetsTable.id, id));

      if (parsed.data.copyAsSpecStandard !== false) {
        await tx.insert(productSpecStandardsTable).values({
          productId: p.id,
          supplierId: src.supplierId,
          title: src.name,
          standardType: "preferred",
          isCurrent: true,
          isApproved: false,
          isActive: true,
          dimensionsSummary: src.dimensionsSummary,
          materialSummary: src.materialSummary,
          finishingSummary: src.finishingSummary,
          attachmentSummary: src.attachmentSummary,
          hardwareSummary: src.hardwareSummary,
          printFileRequirements: src.printFileRequirements,
          installNotes: src.installNotes,
          internalOpsNotes: src.opsNotes,
          effectiveDate: src.effectiveDate,
          expirationDate: src.expirationDate,
          sourceQuoteAssetIdsJson: [id],
          reviewStatus: "in_review",
        });
      }
      return p;
    });
    res.status(201).json({ product, sourceId: id });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Promote failed" });
  }
});

// ===== Spec Standards (per product) =====
router.get("/products/:productId/spec-standards", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const rows = await db.select().from(productSpecStandardsTable).where(eq(productSpecStandardsTable.productId, productId)).orderBy(productSpecStandardsTable.createdAt);
  res.json(rows);
});

const SpecStandardBody = z.object({
  supplierId: z.number().int().nullable().optional(),
  brandingZoneId: z.number().int().nullable().optional(),
  packageId: z.number().int().nullable().optional(),
  title: z.string().min(1).optional(),
  standardType: z.enum(["preferred", "alternate", "legacy", "zone_specific", "package_specific"]).optional(),
  isCurrent: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dimensionsSummary: z.string().nullable().optional(),
  materialSummary: z.string().nullable().optional(),
  finishingSummary: z.string().nullable().optional(),
  attachmentSummary: z.string().nullable().optional(),
  hardwareSummary: z.string().nullable().optional(),
  leadTimeDays: z.number().int().nullable().optional(),
  printFileRequirements: z.string().nullable().optional(),
  installNotes: z.string().nullable().optional(),
  internalOpsNotes: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  sourceQuoteAssetIdsJson: z.array(z.number().int()).nullable().optional(),
  reviewStatus: z.enum(["new", "in_review", "needs_clarification", "approved", "superseded", "archived"]).optional(),
  reviewNotes: z.string().nullable().optional(),
  missingDataFlagsJson: z.array(z.string()).nullable().optional(),
});
router.post("/products/:productId/spec-standards", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const parsed = SpecStandardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!parsed.data.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(productSpecStandardsTable).values({ productId, ...parsed.data, title: parsed.data.title } as any).returning();
  res.status(201).json(row);
});

router.patch("/products/:productId/spec-standards/:id", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  const id = parseInt(req.params.id);
  if (isNaN(productId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SpecStandardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(productSpecStandardsTable).set(parsed.data).where(and(eq(productSpecStandardsTable.id, id), eq(productSpecStandardsTable.productId, productId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/products/:productId/spec-standards/:id", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  const id = parseInt(req.params.id);
  if (isNaN(productId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productSpecStandardsTable).where(and(eq(productSpecStandardsTable.id, id), eq(productSpecStandardsTable.productId, productId)));
  res.json({ success: true });
});

// Set one standard as current preferred — clears flag on siblings
router.post("/products/:productId/spec-standards/:id/set-current", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  const id = parseInt(req.params.id);
  if (isNaN(productId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.transaction(async (tx) => {
    await tx.update(productSpecStandardsTable).set({ isCurrent: false }).where(eq(productSpecStandardsTable.productId, productId));
    await tx.update(productSpecStandardsTable).set({ isCurrent: true, standardType: "preferred", isApproved: true, reviewStatus: "approved" }).where(and(eq(productSpecStandardsTable.id, id), eq(productSpecStandardsTable.productId, productId)));
  });
  res.json({ success: true });
});

// ===== Catalog intelligence overview =====
router.get("/catalog-intelligence/overview", async (_req, res) => {
  const products = await db.select().from(productCatalogTable);
  const standards = await db.select().from(productSpecStandardsTable);
  const sources = await db.select().from(quoteAssetsTable);
  const today = new Date().toISOString().slice(0, 10);
  const standardsByProduct = new Map<number, typeof standards>();
  for (const s of standards) {
    if (!standardsByProduct.has(s.productId)) standardsByProduct.set(s.productId, [] as any);
    (standardsByProduct.get(s.productId) as any[]).push(s);
  }

  const productsWithMissingData = products.filter(p => p.missingDataFlagsJson && p.missingDataFlagsJson.length > 0).map(p => ({ id: p.id, name: p.displayName || p.name, flags: p.missingDataFlagsJson }));
  const productsWithoutApprovedStandard = products.filter(p => {
    const list = standardsByProduct.get(p.id) || [];
    return !list.some((s: any) => s.isApproved && s.isActive);
  }).map(p => ({ id: p.id, name: p.displayName || p.name, standardCount: (standardsByProduct.get(p.id) || []).length }));
  const productsMultiSupplier = products.map(p => {
    const list = (standardsByProduct.get(p.id) || []) as any[];
    const suppliers = new Set(list.map(s => s.supplierId).filter(Boolean));
    return { id: p.id, name: p.displayName || p.name, supplierCount: suppliers.size };
  }).filter(x => x.supplierCount > 1);
  const expiredSources = sources.filter(s => s.expirationDate && s.expirationDate < today).map(s => ({ id: s.id, name: s.name, supplierName: s.supplierName, expirationDate: s.expirationDate }));

  res.json({
    counts: {
      products: products.length,
      standards: standards.length,
      sources: sources.length,
      productsWithMissingData: productsWithMissingData.length,
      productsWithoutApprovedStandard: productsWithoutApprovedStandard.length,
      productsMultiSupplier: productsMultiSupplier.length,
      expiredSources: expiredSources.length,
    },
    productsWithMissingData,
    productsWithoutApprovedStandard,
    productsMultiSupplier,
    expiredSources,
  });
});

export default router;
