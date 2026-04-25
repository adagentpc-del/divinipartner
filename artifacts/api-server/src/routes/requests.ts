import { Router, type IRouter } from "express";
import { eq, desc, ilike, sql, and, count } from "drizzle-orm";
import { db, requestsTable, requestItemsTable, requestUploadsTable, adminNotesTable, partnersTable } from "@workspace/db";
import {
  ListRequestsQueryParams,
  GetRequestParams,
  UpdateRequestParams,
  UpdateRequestBody,
  ListRequestNotesParams,
  CreateRequestNoteParams,
  CreateRequestNoteBody,
  RegenerateAiSummaryParams,
  RegeneratePdfParams,
} from "@workspace/api-zod";
import { generateAiSummary } from "../lib/aiSummary";
import { generatePdfHtml } from "../lib/pdfGenerator";

const router: IRouter = Router();

router.get("/requests", async (req, res): Promise<void> => {
  const params = ListRequestsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const conditions: any[] = [];
  if (params.success) {
    if (params.data.partnerId !== undefined) {
      conditions.push(eq(requestsTable.partnerId, params.data.partnerId));
    }
    if (params.data.status) {
      conditions.push(eq(requestsTable.status, params.data.status));
    }
    if (params.data.search) {
      conditions.push(
        sql`(${requestsTable.eventName} ILIKE ${"%" + params.data.search + "%"} OR ${requestsTable.companyName} ILIKE ${"%" + params.data.search + "%"} OR ${requestsTable.contactName} ILIKE ${"%" + params.data.search + "%"})`,
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(requestsTable)
    .where(whereClause);

  const requests = await db
    .select({
      id: requestsTable.id,
      partnerId: requestsTable.partnerId,
      partnerName: partnersTable.companyName,
      companyName: requestsTable.companyName,
      contactName: requestsTable.contactName,
      email: requestsTable.email,
      eventName: requestsTable.eventName,
      eventDate: requestsTable.eventDate,
      status: requestsTable.status,
      estimatedScopeLevel: requestsTable.estimatedScopeLevel,
      createdAt: requestsTable.createdAt,
    })
    .from(requestsTable)
    .leftJoin(partnersTable, eq(requestsTable.partnerId, partnersTable.id))
    .where(whereClause)
    .orderBy(desc(requestsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    requests,
    total: totalResult?.count || 0,
  });
});

router.get("/requests/:id", async (req, res): Promise<void> => {
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [request] = await db
    .select({
      id: requestsTable.id,
      partnerId: requestsTable.partnerId,
      partnerName: partnersTable.companyName,
      companyName: requestsTable.companyName,
      contactName: requestsTable.contactName,
      email: requestsTable.email,
      phone: requestsTable.phone,
      eventName: requestsTable.eventName,
      eventDate: requestsTable.eventDate,
      venueName: requestsTable.venueName,
      venueAddress: requestsTable.venueAddress,
      installDatetime: requestsTable.installDatetime,
      removalDatetime: requestsTable.removalDatetime,
      postEventDisposition: requestsTable.postEventDisposition,
      industry: requestsTable.industry,
      useCase: requestsTable.useCase,
      designAssistanceRequested: requestsTable.designAssistanceRequested,
      customFabricationRequested: requestsTable.customFabricationRequested,
      immersiveRequested: requestsTable.immersiveRequested,
      promotionalItemsRequested: requestsTable.promotionalItemsRequested,
      additionalNotes: requestsTable.additionalNotes,
      status: requestsTable.status,
      aiSummary: requestsTable.aiSummary,
      internalSummary: requestsTable.internalSummary,
      estimatedScopeLevel: requestsTable.estimatedScopeLevel,
      recommendedUpsellsJson: requestsTable.recommendedUpsellsJson,
      pdfSummaryUrl: requestsTable.pdfSummaryUrl,
      createdAt: requestsTable.createdAt,
      updatedAt: requestsTable.updatedAt,
    })
    .from(requestsTable)
    .leftJoin(partnersTable, eq(requestsTable.partnerId, partnersTable.id))
    .where(eq(requestsTable.id, params.data.id));

  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const items = await db
    .select()
    .from(requestItemsTable)
    .where(eq(requestItemsTable.requestId, params.data.id));

  const uploads = await db
    .select()
    .from(requestUploadsTable)
    .where(eq(requestUploadsTable.requestId, params.data.id));

  const notes = await db
    .select()
    .from(adminNotesTable)
    .where(eq(adminNotesTable.requestId, params.data.id))
    .orderBy(desc(adminNotesTable.createdAt));

  res.json({ ...request, items, uploads, notes });
});

router.patch("/requests/:id", async (req, res): Promise<void> => {
  const params = UpdateRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(requestsTable)
    .set(parsed.data)
    .where(eq(requestsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const items = await db.select().from(requestItemsTable).where(eq(requestItemsTable.requestId, params.data.id));
  const uploads = await db.select().from(requestUploadsTable).where(eq(requestUploadsTable.requestId, params.data.id));
  const notes = await db.select().from(adminNotesTable).where(eq(adminNotesTable.requestId, params.data.id)).orderBy(desc(adminNotesTable.createdAt));
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, updated.partnerId));

  res.json({ ...updated, partnerName: partner?.companyName || "Unknown", items, uploads, notes });
});

router.get("/requests/:id/notes", async (req, res): Promise<void> => {
  const params = ListRequestNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const notes = await db
    .select()
    .from(adminNotesTable)
    .where(eq(adminNotesTable.requestId, params.data.id))
    .orderBy(desc(adminNotesTable.createdAt));

  res.json(notes);
});

router.post("/requests/:id/notes", async (req, res): Promise<void> => {
  const params = CreateRequestNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateRequestNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .insert(adminNotesTable)
    .values({ requestId: params.data.id, noteBody: parsed.data.noteBody })
    .returning();

  res.status(201).json(note);
});

router.post("/requests/:id/regenerate-ai", async (req, res): Promise<void> => {
  const params = RegenerateAiSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, params.data.id));
  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const items = await db.select().from(requestItemsTable).where(eq(requestItemsTable.requestId, params.data.id));
  const uploads = await db.select().from(requestUploadsTable).where(eq(requestUploadsTable.requestId, params.data.id));

  const { text: aiSummary, inputHash: aiSummaryInputHash, usedAi } = await generateAiSummary({
    companyName: request.companyName,
    contactName: request.contactName,
    eventName: request.eventName,
    eventDate: request.eventDate,
    venueName: request.venueName,
    venueAddress: request.venueAddress,
    items: items.map((i) => ({ category: i.category, itemName: i.itemName })),
    designAssistanceRequested: request.designAssistanceRequested,
    customFabricationRequested: request.customFabricationRequested,
    immersiveRequested: request.immersiveRequested,
    promotionalItemsRequested: request.promotionalItemsRequested,
    additionalNotes: request.additionalNotes,
    uploads: uploads.map((u) => ({ uploadType: u.uploadType, fileName: u.fileName })),
  }, {
    requestId: request.id,
    partnerId: request.partnerId,
    // Pass current row state so generateAiSummary can short-circuit when the
    // input payload hasn't changed since the last AI run — no token spend on
    // an idempotent regenerate-ai click.
    priorHash: request.aiSummaryInputHash,
    priorSummary: request.aiSummary,
  });

  const [updated] = await db
    .update(requestsTable)
    // Hash persists only when AI actually ran. A deterministic fallback
    // (usedAi=false) clears the hash so the next regenerate-ai retries
    // instead of reusing the fallback text forever.
    .set({ aiSummary, aiSummaryInputHash: usedAi ? aiSummaryInputHash : null })
    .where(eq(requestsTable.id, params.data.id))
    .returning();

  const notes = await db.select().from(adminNotesTable).where(eq(adminNotesTable.requestId, params.data.id)).orderBy(desc(adminNotesTable.createdAt));
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, updated.partnerId));

  res.json({ ...updated, partnerName: partner?.companyName || "Unknown", items, uploads, notes });
});

router.post("/requests/:id/regenerate-pdf", async (req, res): Promise<void> => {
  const params = RegeneratePdfParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, params.data.id));
  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const items = await db.select().from(requestItemsTable).where(eq(requestItemsTable.requestId, params.data.id));
  const uploads = await db.select().from(requestUploadsTable).where(eq(requestUploadsTable.requestId, params.data.id));
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, request.partnerId));

  const pdfHtml = generatePdfHtml({
    partnerName: partner?.companyName || "Unknown",
    companyName: request.companyName,
    contactName: request.contactName,
    email: request.email,
    phone: request.phone,
    eventName: request.eventName,
    eventDate: request.eventDate,
    venueName: request.venueName,
    venueAddress: request.venueAddress,
    items: items.map((i) => ({ category: i.category, itemName: i.itemName })),
    uploads: uploads.map((u) => ({ uploadType: u.uploadType, fileName: u.fileName })),
    internalSummary: request.internalSummary,
    aiSummary: request.aiSummary,
    recommendedUpsells: (request.recommendedUpsellsJson as string[]) || [],
    createdAt: request.createdAt.toISOString(),
  });

  const pdfDataUrl = `data:text/html;base64,${Buffer.from(pdfHtml).toString("base64")}`;

  await db
    .update(requestsTable)
    .set({ pdfSummaryUrl: pdfDataUrl })
    .where(eq(requestsTable.id, params.data.id));

  res.json({ pdfUrl: pdfDataUrl });
});

export default router;
