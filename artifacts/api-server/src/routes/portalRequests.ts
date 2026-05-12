import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import {
  db, portalRequestsTable, productRequestsTable,
  brandingLocationRequestsTable, requestFilesTable,
  partnersTable, partnerBrandingLocationsTable, productCatalogTable
} from "@workspace/db";
import { z } from "zod";
import {
  ListPortalRequestsResponse,
  GetPortalRequestResponse,
  UpdatePortalRequestResponse,
  ListProductRequestsResponse,
  GetProductRequestResponse,
  UpdateProductRequestResponse,
  ListBrandingRequestsResponse,
  GetBrandingRequestResponse,
  UpdateBrandingRequestResponse,
  GetAllRequestsSummaryResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

const PortalRequestBody = z.object({
  requestType: z.string().min(1),
  requestCategory: z.string().optional(),
  mainContactName: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  eventPageUrl: z.string().optional(),
  eventName: z.string().optional(),
  eventDate: z.string().optional(),
  neededByDate: z.string().optional(),
  venueName: z.string().optional(),
  venueLocation: z.string().optional(),
  attendeeCount: z.string().optional(),
  description: z.string().optional(),
  designHelpNeeded: z.boolean().optional(),
  artworkStatus: z.string().optional(),
  designBrief: z.string().optional(),
  styleNotes: z.string().optional(),
  proofDeadline: z.string().optional(),
  budgetRange: z.string().optional(),
  files: z.array(z.object({
    fileUrl: z.string(),
    fileName: z.string(),
    fileType: z.string().optional(),
    label: z.string().optional(),
  })).optional(),
});

const ProductRequestBody = z.object({
  productId: z.number().optional(),
  mainContactName: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  eventPageUrl: z.string().optional(),
  eventName: z.string().optional(),
  eventDate: z.string().optional(),
  neededByDate: z.string().optional(),
  quantity: z.number().optional(),
  selectedSize: z.string().optional(),
  selectedOptionsJson: z.record(z.string(), z.string()).optional(),
  designHelpNeeded: z.boolean().optional(),
  artworkStatus: z.string().optional(),
  designBrief: z.string().optional(),
  styleNotes: z.string().optional(),
  proofDeadline: z.string().optional(),
  notes: z.string().optional(),
  files: z.array(z.object({
    fileUrl: z.string(),
    fileName: z.string(),
    fileType: z.string().optional(),
    label: z.string().optional(),
  })).optional(),
});

const BrandingLocationRequestBody = z.object({
  brandingLocationId: z.number().optional(),
  mainContactName: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  eventPageUrl: z.string().optional(),
  eventName: z.string().optional(),
  eventDate: z.string().optional(),
  neededByDate: z.string().optional(),
  designHelpNeeded: z.boolean().optional(),
  artworkStatus: z.string().optional(),
  designBrief: z.string().optional(),
  styleNotes: z.string().optional(),
  proofDeadline: z.string().optional(),
  notes: z.string().optional(),
  files: z.array(z.object({
    fileUrl: z.string(),
    fileName: z.string(),
    fileType: z.string().optional(),
    label: z.string().optional(),
  })).optional(),
});

const VALID_STATUSES = ["new", "reviewing", "quoted", "awaiting artwork", "in production", "completed", "archived"] as const;
const VALID_QUOTE_STATUSES = ["needs_review", "quoting", "quote_sent", "awaiting_approval", "approved", "declined"] as const;
const VALID_PRIORITIES = ["normal", "high", "urgent"] as const;
const VALID_INSTALL = ["yes", "no", "tbd"] as const;

const QuoteAndProductionPatch = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  adminNotes: z.string().optional(),
  estimatedPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid price").optional().nullable(),
  costNotes: z.string().optional().nullable(),
  quoteSummary: z.string().optional().nullable(),
  turnaroundNotes: z.string().optional().nullable(),
  quoteReady: z.boolean().optional(),
  quoteStatus: z.enum(VALID_QUOTE_STATUSES).optional(),
  productionOwner: z.string().optional().nullable(),
  installRequired: z.enum(VALID_INSTALL).optional().nullable(),
  productionNotes: z.string().optional().nullable(),
  fulfillmentNotes: z.string().optional().nullable(),
  vendorNotes: z.string().optional().nullable(),
  productionDeadline: z.string().optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  recurringEvent: z.boolean().optional(),
});

function isValidStoragePath(url: string): boolean {
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.includes("..") || url.startsWith("/")) return false;
  return true;
}

async function saveFiles(requestType: string, requestId: number, files: { fileUrl: string; fileName: string; fileType?: string; label?: string }[]) {
  for (const file of files) {
    if (!isValidStoragePath(file.fileUrl)) {
      throw new Error(`Invalid file URL: only object storage paths are accepted`);
    }
    await db.insert(requestFilesTable).values({
      requestType,
      requestId,
      fileUrl: file.fileUrl,
      fileName: file.fileName,
      fileType: file.fileType || null,
      label: file.label || null,
    });
  }
}

async function sendRequestNotificationEmail(partnerId: number, requestType: string, contactName: string, email: string, eventName?: string) {
  try {
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
    if (!partner) return;

    const toEmail = partner.routingEmail || partner.contactEmail || process.env.ADMIN_EMAIL || "admin@a3visual.com";

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) return;

    const configRes = await fetch(`https://${hostname}/connectors-config`);
    const configs = await configRes.json() as any[];
    const resendConfig = configs.find((c: any) => c.name === "resend");
    if (!resendConfig?.credentials?.apiKey) return;

    const resendApiKey = resendConfig.credentials.apiKey;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: "A3 Visual Portal <onboarding@resend.dev>",
        to: [toEmail],
        subject: `New ${requestType} Request from ${partner.companyName} Portal`,
        html: `<h2>New ${requestType} Request</h2>
<p><strong>Partner:</strong> ${partner.companyName}</p>
<p><strong>Contact:</strong> ${contactName} (${email})</p>
${eventName ? `<p><strong>Event:</strong> ${eventName}</p>` : ""}
<p><strong>Type:</strong> ${requestType}</p>
<p>Log in to the admin dashboard to review this request.</p>`,
      }),
    });
  } catch (e) {
    console.error("Notification email failed:", e);
  }
}

function buildPatchData(body: any): Record<string, any> {
  const updateData: Record<string, any> = {};
  const fields = [
    "status", "adminNotes", "estimatedPrice", "costNotes", "quoteSummary",
    "turnaroundNotes", "quoteReady", "quoteStatus", "productionOwner",
    "installRequired", "productionNotes", "fulfillmentNotes", "vendorNotes",
    "productionDeadline", "priority", "recurringEvent"
  ];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }
  return updateData;
}

router.post("/public/partners/:slug/portal-requests", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const parsed = PortalRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { files, ...data } = parsed.data;
  const [request] = await db.insert(portalRequestsTable).values({ ...data, partnerId: partner.id }).returning();

  try {
    if (files?.length) await saveFiles("portal", request.id, files);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Invalid file data" }); return;
  }

  sendRequestNotificationEmail(partner.id, parsed.data.requestType, parsed.data.mainContactName, parsed.data.email, parsed.data.eventName).catch(() => {});

  res.status(201).json(request);
});

router.post("/public/partners/:slug/product-requests", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const parsed = ProductRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.productId) {
    const [product] = await db.select().from(productCatalogTable)
      .where(and(eq(productCatalogTable.id, parsed.data.productId), eq(productCatalogTable.isActive, true)));
    if (!product) { res.status(400).json({ error: "Invalid product" }); return; }
  }

  const { files, ...data } = parsed.data;
  const [request] = await db.insert(productRequestsTable).values({ ...data, partnerId: partner.id }).returning();

  try {
    if (files?.length) await saveFiles("product", request.id, files);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Invalid file data" }); return;
  }

  sendRequestNotificationEmail(partner.id, "Product Order", parsed.data.mainContactName, parsed.data.email, parsed.data.eventName).catch(() => {});

  res.status(201).json(request);
});

router.post("/public/partners/:slug/branding-requests", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const parsed = BrandingLocationRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.brandingLocationId) {
    const [loc] = await db.select().from(partnerBrandingLocationsTable)
      .where(and(
        eq(partnerBrandingLocationsTable.id, parsed.data.brandingLocationId),
        eq(partnerBrandingLocationsTable.partnerId, partner.id),
        eq(partnerBrandingLocationsTable.isActive, true)
      ));
    if (!loc) { res.status(400).json({ error: "Invalid branding location" }); return; }
  }

  const { files, ...data } = parsed.data;
  const [request] = await db.insert(brandingLocationRequestsTable).values({ ...data, partnerId: partner.id }).returning();

  try {
    if (files?.length) await saveFiles("branding", request.id, files);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Invalid file data" }); return;
  }

  sendRequestNotificationEmail(partner.id, "Venue Branding", parsed.data.mainContactName, parsed.data.email, parsed.data.eventName).catch(() => {});

  res.status(201).json(request);
});

router.get("/portal-requests", async (req, res): Promise<void> => {
  const { partnerId, requestType, status, search, limit, offset } = req.query;
  let query = db.select().from(portalRequestsTable).orderBy(desc(portalRequestsTable.createdAt)).$dynamic();

  const conditions: any[] = [];
  if (partnerId) conditions.push(eq(portalRequestsTable.partnerId, parseInt(partnerId as string)));
  if (requestType) conditions.push(eq(portalRequestsTable.requestType, requestType as string));
  if (status) conditions.push(eq(portalRequestsTable.status, status as string));
  if (search) conditions.push(ilike(portalRequestsTable.mainContactName, `%${search}%`));

  if (conditions.length > 0) query = query.where(and(...conditions));
  if (limit) query = query.limit(parseInt(limit as string));
  if (offset) query = query.offset(parseInt(offset as string));

  const results = await query;
  sendValidated(req, res, ListPortalRequestsResponse, results, "ListPortalRequests");
});

router.get("/portal-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(portalRequestsTable).where(eq(portalRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const files = await db.select().from(requestFilesTable)
    .where(and(eq(requestFilesTable.requestType, "portal"), eq(requestFilesTable.requestId, id)));

  sendValidated(req, res, GetPortalRequestResponse, { ...request, files }, "GetPortalRequest");
});

router.patch("/portal-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = QuoteAndProductionPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData = buildPatchData(parsed.data);
  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [request] = await db.update(portalRequestsTable).set(updateData).where(eq(portalRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  sendValidated(req, res, UpdatePortalRequestResponse, request, "UpdatePortalRequest");
});

router.get("/product-requests", async (req, res): Promise<void> => {
  const { partnerId, status } = req.query;
  let query = db.select({
    id: productRequestsTable.id,
    partnerId: productRequestsTable.partnerId,
    productId: productRequestsTable.productId,
    mainContactName: productRequestsTable.mainContactName,
    companyName: productRequestsTable.companyName,
    email: productRequestsTable.email,
    eventName: productRequestsTable.eventName,
    eventDate: productRequestsTable.eventDate,
    neededByDate: productRequestsTable.neededByDate,
    quantity: productRequestsTable.quantity,
    selectedSize: productRequestsTable.selectedSize,
    status: productRequestsTable.status,
    quoteStatus: productRequestsTable.quoteStatus,
    priority: productRequestsTable.priority,
    createdAt: productRequestsTable.createdAt,
    productName: productCatalogTable.name,
  }).from(productRequestsTable)
    .leftJoin(productCatalogTable, eq(productRequestsTable.productId, productCatalogTable.id))
    .orderBy(desc(productRequestsTable.createdAt)).$dynamic();

  const conditions: any[] = [];
  if (partnerId) conditions.push(eq(productRequestsTable.partnerId, parseInt(partnerId as string)));
  if (status) conditions.push(eq(productRequestsTable.status, status as string));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const results = await query;
  sendValidated(req, res, ListProductRequestsResponse, results, "ListProductRequests");
});

router.get("/product-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(productRequestsTable).where(eq(productRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const files = await db.select().from(requestFilesTable)
    .where(and(eq(requestFilesTable.requestType, "product"), eq(requestFilesTable.requestId, id)));

  let product = null;
  if (request.productId) {
    const [p] = await db.select({
      id: productCatalogTable.id,
      name: productCatalogTable.name,
      category: productCatalogTable.category,
      imageUrl: productCatalogTable.imageUrl,
    }).from(productCatalogTable).where(eq(productCatalogTable.id, request.productId));
    product = p || null;
  }

  sendValidated(req, res, GetProductRequestResponse, { ...request, files, product }, "GetProductRequest");
});

router.patch("/product-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = QuoteAndProductionPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData = buildPatchData(parsed.data);
  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [request] = await db.update(productRequestsTable).set(updateData).where(eq(productRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  sendValidated(req, res, UpdateProductRequestResponse, request, "UpdateProductRequest");
});

router.get("/branding-requests", async (req, res): Promise<void> => {
  const { partnerId, status } = req.query;
  let query = db.select({
    id: brandingLocationRequestsTable.id,
    partnerId: brandingLocationRequestsTable.partnerId,
    brandingLocationId: brandingLocationRequestsTable.brandingLocationId,
    mainContactName: brandingLocationRequestsTable.mainContactName,
    companyName: brandingLocationRequestsTable.companyName,
    email: brandingLocationRequestsTable.email,
    eventName: brandingLocationRequestsTable.eventName,
    eventDate: brandingLocationRequestsTable.eventDate,
    neededByDate: brandingLocationRequestsTable.neededByDate,
    status: brandingLocationRequestsTable.status,
    quoteStatus: brandingLocationRequestsTable.quoteStatus,
    priority: brandingLocationRequestsTable.priority,
    createdAt: brandingLocationRequestsTable.createdAt,
    locationName: partnerBrandingLocationsTable.name,
  }).from(brandingLocationRequestsTable)
    .leftJoin(partnerBrandingLocationsTable, eq(brandingLocationRequestsTable.brandingLocationId, partnerBrandingLocationsTable.id))
    .orderBy(desc(brandingLocationRequestsTable.createdAt)).$dynamic();

  const conditions: any[] = [];
  if (partnerId) conditions.push(eq(brandingLocationRequestsTable.partnerId, parseInt(partnerId as string)));
  if (status) conditions.push(eq(brandingLocationRequestsTable.status, status as string));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const results = await query;
  sendValidated(req, res, ListBrandingRequestsResponse, results, "List branding requests");
});

router.get("/branding-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(brandingLocationRequestsTable).where(eq(brandingLocationRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const files = await db.select().from(requestFilesTable)
    .where(and(eq(requestFilesTable.requestType, "branding"), eq(requestFilesTable.requestId, id)));

  let location = null;
  if (request.brandingLocationId) {
    const [loc] = await db.select({
      id: partnerBrandingLocationsTable.id,
      name: partnerBrandingLocationsTable.name,
      category: partnerBrandingLocationsTable.category,
      description: partnerBrandingLocationsTable.description,
      sizeWidth: partnerBrandingLocationsTable.sizeWidth,
      sizeHeight: partnerBrandingLocationsTable.sizeHeight,
      sizeUnit: partnerBrandingLocationsTable.sizeUnit,
      previewImageUrl: partnerBrandingLocationsTable.previewImageUrl,
    }).from(partnerBrandingLocationsTable).where(eq(partnerBrandingLocationsTable.id, request.brandingLocationId));
    location = loc || null;
  }

  sendValidated(req, res, GetBrandingRequestResponse, { ...request, files, location }, "Get branding request");
});

router.patch("/branding-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = QuoteAndProductionPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData = buildPatchData(parsed.data);
  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [request] = await db.update(brandingLocationRequestsTable).set(updateData).where(eq(brandingLocationRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  sendValidated(req, res, UpdateBrandingRequestResponse, request, "Update branding request");
});

router.get("/all-requests/summary", async (req, res): Promise<void> => {
  const [portalCount] = await db.select({ count: sql<number>`count(*)` }).from(portalRequestsTable);
  const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(productRequestsTable);
  const [brandingCount] = await db.select({ count: sql<number>`count(*)` }).from(brandingLocationRequestsTable);

  sendValidated(req, res, GetAllRequestsSummaryResponse, {
    portal: Number(portalCount.count),
    product: Number(productCount.count),
    branding: Number(brandingCount.count),
    total: Number(portalCount.count) + Number(productCount.count) + Number(brandingCount.count),
  }, "All requests summary");
});

export default router;
