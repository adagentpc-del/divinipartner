import { Router, type IRouter } from "express";
import { eq, desc, and, sql, inArray, ilike, gte, lte, gt } from "drizzle-orm";
import { z } from "zod";
import { randomUUID, createHmac } from "crypto";
import { getAuth } from "@clerk/express";
import {
  db,
  documentLibraryTable,
  documentCustomerAssignmentsTable,
  documentRequestsTable,
  documentEventsTable,
  partnersTable,
  DOCUMENT_TYPES,
  VISIBILITY_LEVELS,
  DOCUMENT_CATEGORIES,
  ACCESS_STATUSES,
  REQUEST_STATUSES,
  DOCUMENT_EVENT_TYPES,
} from "@workspace/db";
import { ObjectStorageService, signObjectURL, parseObjectPath } from "../lib/objectStorage";
import { requireAdmin } from "../middlewares/requireAdmin";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

function getAdminUserId(req: any): string {
  return getAuth(req)!.userId!;
}

function getDocTokenSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set for document download token generation");
  }
  return secret;
}

function generateDownloadToken(assignmentId: number, email: string): string {
  return createHmac("sha256", getDocTokenSecret())
    .update(`doc-download:${assignmentId}:${email.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32);
}

async function logDocumentEvent(data: {
  documentId?: number | null;
  requestId?: number | null;
  assignmentId?: number | null;
  partnerId?: number | null;
  customerEmail?: string | null;
  customerName?: string | null;
  eventType: string;
  eventMetadata?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  performedByUserId?: string | null;
}) {
  try {
    await db.insert(documentEventsTable).values({
      documentId: data.documentId ?? null,
      requestId: data.requestId ?? null,
      assignmentId: data.assignmentId ?? null,
      partnerId: data.partnerId ?? null,
      customerEmail: data.customerEmail ?? null,
      customerName: data.customerName ?? null,
      eventType: data.eventType,
      eventMetadata: data.eventMetadata ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      performedByUserId: data.performedByUserId ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log document event");
  }
}

function getDefaultExpiration(visibilityLevel: string): number {
  switch (visibilityLevel) {
    case "public_sales":
      return 30 * 24 * 60 * 60;
    case "customer_requestable":
      return 7 * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
}

async function generateSignedDownloadUrl(storageKey: string, ttlSec: number): Promise<string> {
  const privateDir = objectStorageService.getPrivateObjectDir();
  const fullPath = storageKey.startsWith("/") ? storageKey : `${privateDir}/${storageKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
}

async function generateSignedUploadUrl(storagePath: string): Promise<string> {
  const privateDir = objectStorageService.getPrivateObjectDir();
  const fullPath = `${privateDir}/${storagePath}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
}

// ─── Admin routes — protected by shared requireAdmin middleware ──────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin());

// ─── Admin: List all documents ───────────────────────────────────────────────
adminRouter.get("/documents", async (req, res): Promise<void> => {
  const { category, documentType, visibilityLevel, isActive, search } = req.query;

  let query = db.select().from(documentLibraryTable).$dynamic();

  const conditions: any[] = [];
  if (category && typeof category === "string") conditions.push(eq(documentLibraryTable.category, category));
  if (documentType && typeof documentType === "string") conditions.push(eq(documentLibraryTable.documentType, documentType));
  if (visibilityLevel && typeof visibilityLevel === "string") conditions.push(eq(documentLibraryTable.visibilityLevel, visibilityLevel));
  if (isActive === "true") conditions.push(eq(documentLibraryTable.isActive, true));
  if (isActive === "false") conditions.push(eq(documentLibraryTable.isActive, false));
  if (search && typeof search === "string") conditions.push(ilike(documentLibraryTable.title, `%${search}%`));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const docs = await query.orderBy(desc(documentLibraryTable.updatedAt)).limit(500);
  res.json({ documents: docs });
});

// ─── Admin: Get single document ──────────────────────────────────────────────
adminRouter.get("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.select().from(documentLibraryTable).where(eq(documentLibraryTable.id, id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ document: doc });
});

// ─── Admin: Upload document (metadata + presigned URL) ───────────────────────
const UploadDocumentBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  category: z.enum(DOCUMENT_CATEGORIES as any).default("other"),
  documentType: z.enum(DOCUMENT_TYPES as any),
  visibilityLevel: z.enum(VISIBILITY_LEVELS as any).default("internal_only"),
  versionLabel: z.string().max(50).optional(),
  expirationDate: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isCustomerDownloadable: z.boolean().default(false),
  requiresAdminApproval: z.boolean().default(true),
  autoSendWhenRequested: z.boolean().default(false),
  internalNotes: z.string().max(2000).optional().nullable(),
  originalFilename: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

adminRouter.post("/documents/upload", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);

  const parsed = UploadDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  if (!ALLOWED_MIME_TYPES.includes(data.fileMimeType)) {
    res.status(400).json({ error: `File type not allowed: ${data.fileMimeType}. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG` });
    return;
  }

  if (data.visibilityLevel === "internal_only") {
    if (data.isCustomerDownloadable) {
      res.status(400).json({ error: "Internal-only documents cannot be customer downloadable" });
      return;
    }
    if (data.autoSendWhenRequested) {
      res.status(400).json({ error: "Internal-only documents cannot be auto-sent when requested" });
      return;
    }
  }

  const docId = randomUUID().slice(0, 12);
  const sanitizedFilename = data.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `a3-documents/${data.visibilityLevel}/${data.documentType}/${docId}/${sanitizedFilename}`;

  let uploadUrl: string;
  try {
    uploadUrl = await generateSignedUploadUrl(storagePath);
  } catch (err: any) {
    logger.error({ err }, "Failed to generate document upload URL");
    res.status(500).json({ error: "Object storage is not configured or unavailable. Please set up Object Storage in the Tools panel." });
    return;
  }

  const [doc] = await db.insert(documentLibraryTable).values({
    title: data.title,
    description: data.description || null,
    category: data.category,
    documentType: data.documentType,
    visibilityLevel: data.visibilityLevel,
    storageKey: storagePath,
    originalFilename: data.originalFilename,
    fileMimeType: data.fileMimeType,
    fileSizeBytes: data.fileSizeBytes,
    versionLabel: data.versionLabel || null,
    expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
    isActive: data.isActive,
    isCustomerDownloadable: data.isCustomerDownloadable,
    requiresAdminApproval: data.requiresAdminApproval,
    autoSendWhenRequested: data.autoSendWhenRequested,
    internalNotes: data.internalNotes || null,
    uploadedByUserId: userId,
  }).returning();

  await logDocumentEvent({
    documentId: doc.id,
    eventType: "uploaded",
    performedByUserId: userId,
    eventMetadata: { filename: data.originalFilename, size: data.fileSizeBytes },
  });

  res.json({ document: doc, uploadUrl });
});

// ─── Admin: Update document metadata ─────────────────────────────────────────
const UpdateDocumentBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(DOCUMENT_CATEGORIES as any).optional(),
  documentType: z.enum(DOCUMENT_TYPES as any).optional(),
  visibilityLevel: z.enum(VISIBILITY_LEVELS as any).optional(),
  versionLabel: z.string().max(50).optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isCustomerDownloadable: z.boolean().optional(),
  requiresAdminApproval: z.boolean().optional(),
  autoSendWhenRequested: z.boolean().optional(),
  internalNotes: z.string().max(2000).optional().nullable(),
});

adminRouter.patch("/documents/:id", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db.select().from(documentLibraryTable).where(eq(documentLibraryTable.id, id));
  if (!existing) { res.status(404).json({ error: "Document not found" }); return; }

  const data = parsed.data;
  const vis = data.visibilityLevel ?? existing.visibilityLevel;
  const downloadable = data.isCustomerDownloadable ?? existing.isCustomerDownloadable;
  const autoSend = data.autoSendWhenRequested ?? existing.autoSendWhenRequested;

  if (vis === "internal_only" && downloadable) {
    res.status(400).json({ error: "Internal-only documents cannot be customer downloadable" });
    return;
  }
  if (vis === "internal_only" && autoSend) {
    res.status(400).json({ error: "Internal-only documents cannot be auto-sent when requested" });
    return;
  }

  const updateData: any = { ...data };
  if (data.expirationDate !== undefined) {
    updateData.expirationDate = data.expirationDate ? new Date(data.expirationDate) : null;
  }

  const [updated] = await db.update(documentLibraryTable).set(updateData).where(eq(documentLibraryTable.id, id)).returning();
  await logDocumentEvent({
    documentId: id,
    eventType: "updated",
    performedByUserId: userId,
    eventMetadata: { fields: Object.keys(data) },
  });

  res.json({ document: updated });
});

// ─── Admin: Replace file ─────────────────────────────────────────────────────
const ReplaceFileBody = z.object({
  originalFilename: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  versionLabel: z.string().max(50).optional(),
});

adminRouter.post("/documents/:id/replace", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReplaceFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db.select().from(documentLibraryTable).where(eq(documentLibraryTable.id, id));
  if (!existing) { res.status(404).json({ error: "Document not found" }); return; }

  const data = parsed.data;
  if (!ALLOWED_MIME_TYPES.includes(data.fileMimeType)) {
    res.status(400).json({ error: `File type not allowed: ${data.fileMimeType}` });
    return;
  }

  const docId = randomUUID().slice(0, 12);
  const sanitizedFilename = data.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `a3-documents/${existing.visibilityLevel}/${existing.documentType}/${docId}/${sanitizedFilename}`;

  let uploadUrl: string;
  try {
    uploadUrl = await generateSignedUploadUrl(storagePath);
  } catch (err: any) {
    logger.error({ err }, "Failed to generate replacement upload URL");
    res.status(500).json({ error: "Object storage unavailable" });
    return;
  }

  const [updated] = await db.update(documentLibraryTable).set({
    storageKey: storagePath,
    originalFilename: data.originalFilename,
    fileMimeType: data.fileMimeType,
    fileSizeBytes: data.fileSizeBytes,
    versionLabel: data.versionLabel || existing.versionLabel,
  }).where(eq(documentLibraryTable.id, id)).returning();

  await logDocumentEvent({
    documentId: id,
    eventType: "updated",
    performedByUserId: userId,
    eventMetadata: { action: "file_replaced", newFilename: data.originalFilename, newSize: data.fileSizeBytes },
  });

  res.json({ document: updated, uploadUrl });
});

// ─── Admin: Deactivate / Reactivate ──────────────────────────────────────────
adminRouter.post("/documents/:id/deactivate", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.update(documentLibraryTable).set({ isActive: false }).where(eq(documentLibraryTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  await logDocumentEvent({ documentId: id, eventType: "updated", performedByUserId: userId, eventMetadata: { action: "deactivated" } });
  res.json({ document: doc });
});

adminRouter.post("/documents/:id/reactivate", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.update(documentLibraryTable).set({ isActive: true }).where(eq(documentLibraryTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  await logDocumentEvent({ documentId: id, eventType: "updated", performedByUserId: userId, eventMetadata: { action: "reactivated" } });
  res.json({ document: doc });
});

// ─── Admin: Test signed download link ────────────────────────────────────────
adminRouter.post("/documents/:id/test-link", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [doc] = await db.select().from(documentLibraryTable).where(eq(documentLibraryTable.id, id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  try {
    const ttl = getDefaultExpiration(doc.visibilityLevel);
    const url = await generateSignedDownloadUrl(doc.storageKey, ttl);
    res.json({ url, expiresInSeconds: ttl });
  } catch (err: any) {
    logger.error({ err }, "Failed to generate test link");
    res.status(500).json({ error: "Failed to generate signed URL. Object storage may not be configured." });
  }
});

// ─── Admin: Document activity ────────────────────────────────────────────────
adminRouter.get("/documents/:id/activity", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const events = await db.select().from(documentEventsTable)
    .where(eq(documentEventsTable.documentId, id))
    .orderBy(desc(documentEventsTable.createdAt))
    .limit(200);
  res.json({ events });
});

// ─── Admin: All document events (Activity Log tab) ───────────────────────────
adminRouter.get("/document-events", async (req, res): Promise<void> => {
  const { eventType, documentId, customerEmail, partnerId, from, to } = req.query;
  const conditions: any[] = [];

  if (eventType && typeof eventType === "string") conditions.push(eq(documentEventsTable.eventType, eventType));
  if (documentId && typeof documentId === "string") conditions.push(eq(documentEventsTable.documentId, parseInt(documentId)));
  if (customerEmail && typeof customerEmail === "string") conditions.push(eq(documentEventsTable.customerEmail, customerEmail));
  if (partnerId && typeof partnerId === "string") conditions.push(eq(documentEventsTable.partnerId, parseInt(partnerId)));
  if (from && typeof from === "string") conditions.push(gte(documentEventsTable.createdAt, new Date(from)));
  if (to && typeof to === "string") conditions.push(lte(documentEventsTable.createdAt, new Date(to)));

  let query = db.select().from(documentEventsTable).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));

  const events = await query.orderBy(desc(documentEventsTable.createdAt)).limit(500);
  res.json({ events });
});

// ─── Admin: List document requests ───────────────────────────────────────────
adminRouter.get("/document-requests", async (req, res): Promise<void> => {
  const { status } = req.query;
  const conditions: any[] = [];
  if (status && typeof status === "string") conditions.push(eq(documentRequestsTable.status, status));

  let query = db.select().from(documentRequestsTable).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));

  const requests = await query.orderBy(desc(documentRequestsTable.createdAt)).limit(500);
  res.json({ requests });
});

// ─── Admin: Approve & send document request ──────────────────────────────────
const ApproveAndSendBody = z.object({
  documentIds: z.array(z.number()).min(1),
  note: z.string().max(2000).optional(),
  expirationHours: z.number().optional(),
});

adminRouter.post("/document-requests/:id/approve-send", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ApproveAndSendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const [request] = await db.select().from(documentRequestsTable).where(eq(documentRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const docs = await db.select().from(documentLibraryTable)
    .where(and(
      inArray(documentLibraryTable.id, parsed.data.documentIds),
      eq(documentLibraryTable.isActive, true),
    ));

  const sendableDocs = docs.filter(d => d.visibilityLevel !== "internal_only");
  if (sendableDocs.length === 0) {
    res.status(400).json({ error: "No sendable documents selected (internal-only documents cannot be sent to customers)" });
    return;
  }

  const expirationSec = parsed.data.expirationHours
    ? parsed.data.expirationHours * 3600
    : undefined;

  const assignments = [];
  const docLinks: Array<{ title: string; url: string; version?: string; expiresAt?: Date }> = [];

  for (const doc of sendableDocs) {
    const ttl = expirationSec ?? getDefaultExpiration(doc.visibilityLevel);
    const url = await generateSignedDownloadUrl(doc.storageKey, ttl);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const [assignment] = await db.insert(documentCustomerAssignmentsTable).values({
      documentId: doc.id,
      partnerId: request.partnerId,
      customerEmail: request.requesterEmail,
      customerName: request.requesterName,
      assignedByUserId: userId,
      accessStatus: "available",
      signedUrlExpiresAt: expiresAt,
    }).returning();

    assignments.push(assignment);
    docLinks.push({ title: doc.title, url, version: doc.versionLabel || undefined, expiresAt });

    await logDocumentEvent({
      documentId: doc.id,
      requestId: id,
      assignmentId: assignment.id,
      partnerId: request.partnerId,
      customerEmail: request.requesterEmail,
      customerName: request.requesterName,
      eventType: "assigned",
      performedByUserId: userId,
    });
  }

  await db.update(documentRequestsTable).set({
    status: "approved",
    reviewedByUserId: userId,
    reviewedAt: new Date(),
  }).where(eq(documentRequestsTable.id, id));

  await logDocumentEvent({
    requestId: id,
    partnerId: request.partnerId,
    customerEmail: request.requesterEmail,
    customerName: request.requesterName,
    eventType: "approved",
    performedByUserId: userId,
  });

  let emailSent = false;
  try {
    await sendDocumentEmail(request.requesterEmail, request.requesterName, docLinks, parsed.data.note);
    emailSent = true;
    await db.update(documentRequestsTable).set({ status: "sent" }).where(eq(documentRequestsTable.id, id));
    await logDocumentEvent({
      requestId: id,
      partnerId: request.partnerId,
      customerEmail: request.requesterEmail,
      customerName: request.requesterName,
      eventType: "sent",
      performedByUserId: userId,
      eventMetadata: { documentCount: sendableDocs.length },
    });
  } catch (err) {
    logger.error({ err }, "Failed to send document email after approve — request stays in 'approved' state");
  }

  res.json({ ok: true, assignmentCount: assignments.length, emailSent });
});

// ─── Admin: Deny document request ────────────────────────────────────────────
const DenyBody = z.object({
  reason: z.string().max(1000).optional(),
});

adminRouter.post("/document-requests/:id/deny", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DenyBody.safeParse(req.body);

  const [request] = await db.select().from(documentRequestsTable).where(eq(documentRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  await db.update(documentRequestsTable).set({
    status: "denied",
    reviewedByUserId: userId,
    reviewedAt: new Date(),
  }).where(eq(documentRequestsTable.id, id));

  await logDocumentEvent({
    requestId: id,
    partnerId: request.partnerId,
    customerEmail: request.requesterEmail,
    customerName: request.requesterName,
    eventType: "denied",
    performedByUserId: userId,
    eventMetadata: { reason: parsed.data?.reason },
  });

  res.json({ ok: true });
});

// ─── Admin: Send documents manually ──────────────────────────────────────────
const SendDocumentsBody = z.object({
  customerEmail: z.string().email(),
  customerName: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  partnerId: z.number().optional().nullable(),
  documentIds: z.array(z.number()).min(1),
  note: z.string().max(2000).optional(),
  expirationHours: z.number().optional(),
});

adminRouter.post("/documents/send", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);

  const parsed = SendDocumentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const docs = await db.select().from(documentLibraryTable)
    .where(and(
      inArray(documentLibraryTable.id, data.documentIds),
      eq(documentLibraryTable.isActive, true),
    ));

  const sendableDocs = docs.filter(d => d.visibilityLevel !== "internal_only");
  if (sendableDocs.length === 0) {
    res.status(400).json({ error: "No sendable documents selected (internal-only documents cannot be sent)" });
    return;
  }

  const docLinks: Array<{ title: string; url: string; version?: string; expiresAt?: Date }> = [];

  for (const doc of sendableDocs) {
    const ttl = data.expirationHours ? data.expirationHours * 3600 : getDefaultExpiration(doc.visibilityLevel);
    const url = await generateSignedDownloadUrl(doc.storageKey, ttl);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const [assignment] = await db.insert(documentCustomerAssignmentsTable).values({
      documentId: doc.id,
      partnerId: data.partnerId ?? null,
      customerEmail: data.customerEmail,
      customerName: data.customerName || null,
      assignedByUserId: userId,
      accessStatus: "available",
      signedUrlExpiresAt: expiresAt,
    }).returning();

    docLinks.push({ title: doc.title, url, version: doc.versionLabel || undefined, expiresAt });

    await logDocumentEvent({
      documentId: doc.id,
      assignmentId: assignment.id,
      partnerId: data.partnerId ?? null,
      customerEmail: data.customerEmail,
      customerName: data.customerName || null,
      eventType: "assigned",
      performedByUserId: userId,
    });
  }

  try {
    await sendDocumentEmail(data.customerEmail, data.customerName || null, docLinks, data.note);
    for (const doc of sendableDocs) {
      await logDocumentEvent({
        documentId: doc.id,
        partnerId: data.partnerId ?? null,
        customerEmail: data.customerEmail,
        customerName: data.customerName || null,
        eventType: "sent",
        performedByUserId: userId,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to send document email");
    res.status(500).json({ error: "Documents assigned but email send failed. The recipient won't receive the links by email." });
    return;
  }

  res.json({ ok: true, sentCount: sendableDocs.length });
});

// ─── Admin: Document assignment stats ────────────────────────────────────────
adminRouter.get("/document-assignments", async (req, res): Promise<void> => {
  const { documentId, customerEmail, partnerId } = req.query;
  const conditions: any[] = [];
  if (documentId) conditions.push(eq(documentCustomerAssignmentsTable.documentId, parseInt(documentId as string)));
  if (customerEmail) conditions.push(eq(documentCustomerAssignmentsTable.customerEmail, customerEmail as string));
  if (partnerId) conditions.push(eq(documentCustomerAssignmentsTable.partnerId, parseInt(partnerId as string)));

  let query = db.select().from(documentCustomerAssignmentsTable).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));

  const assignments = await query.orderBy(desc(documentCustomerAssignmentsTable.createdAt)).limit(500);
  res.json({ assignments });
});

// ─── Admin: Settings (document center config) ────────────────────────────────
adminRouter.get("/document-settings", async (req, res): Promise<void> => {
  res.json({
    settings: {
      publicSalesExpirationDays: 30,
      customerRequestableExpirationDays: 7,
      privateComplianceExpirationDays: 7,
      maxUploadSizeBytes: MAX_UPLOAD_BYTES,
      allowedFileTypes: ALLOWED_MIME_TYPES,
      customerSelfServiceEnabled: true,
    },
  });
});

router.use("/admin", adminRouter);

// ─── Customer routes (public, token-protected) ──────────────────────────────

// ─── Customer: List assigned documents ───────────────────────────────────────
router.get("/customer/documents", async (req, res): Promise<void> => {
  const email = req.query.email as string;
  if (!email) { res.status(400).json({ error: "Email parameter required" }); return; }

  const now = new Date();
  const assignments = await db.select({
    assignmentId: documentCustomerAssignmentsTable.id,
    accessStatus: documentCustomerAssignmentsTable.accessStatus,
    signedUrlExpiresAt: documentCustomerAssignmentsTable.signedUrlExpiresAt,
    assignedAt: documentCustomerAssignmentsTable.createdAt,
    documentId: documentLibraryTable.id,
    title: documentLibraryTable.title,
    description: documentLibraryTable.description,
    category: documentLibraryTable.category,
    documentType: documentLibraryTable.documentType,
    versionLabel: documentLibraryTable.versionLabel,
    expirationDate: documentLibraryTable.expirationDate,
  })
    .from(documentCustomerAssignmentsTable)
    .innerJoin(documentLibraryTable, eq(documentCustomerAssignmentsTable.documentId, documentLibraryTable.id))
    .where(and(
      eq(documentCustomerAssignmentsTable.customerEmail, email.toLowerCase().trim()),
      eq(documentCustomerAssignmentsTable.accessStatus, "available"),
      eq(documentLibraryTable.isActive, true),
      sql`${documentLibraryTable.visibilityLevel} != 'internal_only'`,
      gt(documentCustomerAssignmentsTable.signedUrlExpiresAt, now),
    ))
    .orderBy(desc(documentCustomerAssignmentsTable.createdAt));

  const withTokens = assignments.map(a => ({
    ...a,
    downloadToken: generateDownloadToken(a.assignmentId, email),
  }));

  res.json({ documents: withTokens });
});

// ─── Customer: Download assigned document ────────────────────────────────────
router.get("/customer/documents/:assignmentId/download", async (req, res): Promise<void> => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (isNaN(assignmentId)) { res.status(400).json({ error: "Invalid assignment id" }); return; }

  const token = req.query.token as string;
  if (!token) { res.status(400).json({ error: "Download token required" }); return; }

  const [assignment] = await db.select().from(documentCustomerAssignmentsTable).where(eq(documentCustomerAssignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (assignment.accessStatus !== "available") { res.status(403).json({ error: "Document access is no longer available" }); return; }

  const expectedToken = generateDownloadToken(assignmentId, assignment.customerEmail);
  if (token !== expectedToken) {
    res.status(403).json({ error: "Invalid download token" });
    return;
  }

  if (assignment.signedUrlExpiresAt && new Date(assignment.signedUrlExpiresAt) < new Date()) {
    res.status(410).json({ error: "Document access has expired. Please request the document again." });
    return;
  }

  const [doc] = await db.select().from(documentLibraryTable).where(eq(documentLibraryTable.id, assignment.documentId));
  if (!doc || !doc.isActive) { res.status(404).json({ error: "Document not found or inactive" }); return; }
  if (doc.visibilityLevel === "internal_only") { res.status(403).json({ error: "Access denied" }); return; }

  try {
    const ttl = getDefaultExpiration(doc.visibilityLevel);
    const url = await generateSignedDownloadUrl(doc.storageKey, ttl);

    await logDocumentEvent({
      documentId: doc.id,
      assignmentId: assignment.id,
      partnerId: assignment.partnerId,
      customerEmail: assignment.customerEmail,
      customerName: assignment.customerName,
      eventType: "downloaded",
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    res.json({ url });
  } catch (err: any) {
    logger.error({ err }, "Failed to generate download URL");
    res.status(500).json({ error: "Failed to generate download link" });
  }
});

// ─── Customer: Request documents ─────────────────────────────────────────────
const CustomerRequestBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  partnerId: z.number().optional().nullable(),
  requestedDocumentTypes: z.array(z.string()).min(1),
  message: z.string().max(2000).optional(),
});

router.post("/customer/document-requests", async (req, res): Promise<void> => {
  const parsed = CustomerRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;

  const [request] = await db.insert(documentRequestsTable).values({
    partnerId: data.partnerId ?? null,
    requesterName: data.name,
    requesterEmail: data.email,
    requesterCompany: data.company || null,
    requestedDocumentTypes: data.requestedDocumentTypes,
    requestMessage: data.message || null,
    status: "pending",
  }).returning();

  await logDocumentEvent({
    requestId: request.id,
    partnerId: data.partnerId ?? null,
    customerEmail: data.email,
    customerName: data.name,
    eventType: "requested",
    ipAddress: req.ip || null,
    userAgent: req.headers["user-agent"] || null,
  });

  const autoSendDocs = await db.select().from(documentLibraryTable).where(and(
    eq(documentLibraryTable.isActive, true),
    eq(documentLibraryTable.autoSendWhenRequested, true),
  ));

  const matchingAutoSend = autoSendDocs.filter(d =>
    d.visibilityLevel !== "internal_only" &&
    data.requestedDocumentTypes.includes(d.documentType)
  );

  let autoSentCount = 0;
  if (matchingAutoSend.length > 0) {
    const docLinks: Array<{ title: string; url: string; version?: string; expiresAt?: Date }> = [];

    for (const doc of matchingAutoSend) {
      const ttl = getDefaultExpiration(doc.visibilityLevel);
      const url = await generateSignedDownloadUrl(doc.storageKey, ttl);
      const expiresAt = new Date(Date.now() + ttl * 1000);

      const [assignment] = await db.insert(documentCustomerAssignmentsTable).values({
        documentId: doc.id,
        partnerId: data.partnerId ?? null,
        customerEmail: data.email,
        customerName: data.name,
        accessStatus: "available",
        signedUrlExpiresAt: expiresAt,
      }).returning();

      docLinks.push({ title: doc.title, url, version: doc.versionLabel || undefined, expiresAt });

      await logDocumentEvent({
        documentId: doc.id,
        requestId: request.id,
        assignmentId: assignment.id,
        partnerId: data.partnerId ?? null,
        customerEmail: data.email,
        customerName: data.name,
        eventType: "assigned",
        eventMetadata: { trigger: "auto_send" },
      });
    }

    let autoSendEmailSucceeded = false;
    try {
      await sendDocumentEmail(data.email, data.name, docLinks);
      autoSendEmailSucceeded = true;
      await db.update(documentRequestsTable).set({ status: "fulfilled" }).where(eq(documentRequestsTable.id, request.id));
      for (const doc of matchingAutoSend) {
        await logDocumentEvent({
          documentId: doc.id,
          requestId: request.id,
          customerEmail: data.email,
          customerName: data.name,
          eventType: "sent",
          eventMetadata: { trigger: "auto_send" },
        });
      }
    } catch (err) {
      logger.error({ err }, "Auto-send document email failed");
    }

    autoSentCount = autoSendEmailSucceeded ? matchingAutoSend.length : 0;
  }

  res.json({ ok: true, requestId: request.id, autoSentCount });
});

// ─── Email helper ────────────────────────────────────────────────────────────
async function sendDocumentEmail(
  toEmail: string,
  toName: string | null,
  docLinks: Array<{ title: string; url: string; version?: string; expiresAt?: Date }>,
  note?: string,
) {
  const { getUncachableResendClient } = await import("../lib/resend");
  const { client, fromEmail } = await getUncachableResendClient();

  const linksHtml = docLinks.map(d => {
    let label = d.title;
    if (d.version) label += ` (${d.version})`;
    const expiryNote = d.expiresAt
      ? `<span style="color:#6b7280;font-size:12px;"> — link expires ${d.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>`
      : "";
    return `<li style="margin-bottom:10px;"><a href="${d.url}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>${expiryNote}</li>`;
  }).join("");

  const greeting = toName ? `Hi ${escapeHtml(toName)},` : "Hi,";
  const noteBlock = note ? `<p style="color:#374151;font-size:14px;line-height:1.6;margin-top:16px;padding:12px 16px;background:#f3f4f6;border-radius:8px;">${escapeHtml(note)}</p>` : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:20px;font-weight:700;color:#0f172a;">A3 Visual</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Document Center</div>
      </div>
      <p style="color:#374151;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">The A3 Visual documents you requested are ready below.</p>
      <ul style="list-style:none;padding:0;margin:20px 0;">
        ${linksHtml}
      </ul>
      ${noteBlock}
      <p style="color:#6b7280;font-size:13px;line-height:1.5;margin-top:24px;">
        These links may expire for security purposes. If you need updated access, please reply to this email or request the documents again through the portal.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:11px;text-align:center;">
        A3 Visual &middot; Document Center<br />
        Thank you for your partnership.
      </p>
    </div>
  `;

  await client.emails.send({
    from: `A3 Visual <${fromEmail}>`,
    to: toEmail,
    subject: "A3 Visual — Documents Requested",
    html,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
