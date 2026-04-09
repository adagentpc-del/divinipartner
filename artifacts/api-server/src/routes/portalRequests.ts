import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import {
  db, portalRequestsTable, productRequestsTable,
  brandingLocationRequestsTable, requestFilesTable,
  partnersTable, partnerBrandingLocationsTable, productCatalogTable
} from "@workspace/db";
import { z } from "zod";

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

async function saveFiles(requestType: string, requestId: number, files: { fileUrl: string; fileName: string; fileType?: string; label?: string }[]) {
  for (const file of files) {
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

router.post("/public/partners/:slug/portal-requests", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const parsed = PortalRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { files, ...data } = parsed.data;
  const [request] = await db.insert(portalRequestsTable).values({ ...data, partnerId: partner.id }).returning();

  if (files?.length) await saveFiles("portal", request.id, files);

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

  if (files?.length) await saveFiles("product", request.id, files);

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

  if (files?.length) await saveFiles("branding", request.id, files);

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
  res.json(results);
});

router.get("/portal-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(portalRequestsTable).where(eq(portalRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const files = await db.select().from(requestFilesTable)
    .where(and(eq(requestFilesTable.requestType, "portal"), eq(requestFilesTable.requestId, id)));

  res.json({ ...request, files });
});

router.patch("/portal-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, adminNotes } = req.body;
  const updateData: any = {};
  if (status) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

  const [request] = await db.update(portalRequestsTable).set(updateData).where(eq(portalRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  res.json(request);
});

router.get("/product-requests", async (req, res): Promise<void> => {
  const { partnerId, status } = req.query;
  let query = db.select().from(productRequestsTable).orderBy(desc(productRequestsTable.createdAt)).$dynamic();

  const conditions: any[] = [];
  if (partnerId) conditions.push(eq(productRequestsTable.partnerId, parseInt(partnerId as string)));
  if (status) conditions.push(eq(productRequestsTable.status, status as string));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const results = await query;
  res.json(results);
});

router.get("/product-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(productRequestsTable).where(eq(productRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const files = await db.select().from(requestFilesTable)
    .where(and(eq(requestFilesTable.requestType, "product"), eq(requestFilesTable.requestId, id)));

  res.json({ ...request, files });
});

router.patch("/product-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, adminNotes } = req.body;
  const updateData: any = {};
  if (status) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

  const [request] = await db.update(productRequestsTable).set(updateData).where(eq(productRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  res.json(request);
});

router.get("/branding-requests", async (req, res): Promise<void> => {
  const { partnerId, status } = req.query;
  let query = db.select().from(brandingLocationRequestsTable).orderBy(desc(brandingLocationRequestsTable.createdAt)).$dynamic();

  const conditions: any[] = [];
  if (partnerId) conditions.push(eq(brandingLocationRequestsTable.partnerId, parseInt(partnerId as string)));
  if (status) conditions.push(eq(brandingLocationRequestsTable.status, status as string));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const results = await query;
  res.json(results);
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

  res.json({ ...request, files, location });
});

router.patch("/branding-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, adminNotes } = req.body;
  const updateData: any = {};
  if (status) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

  const [request] = await db.update(brandingLocationRequestsTable).set(updateData).where(eq(brandingLocationRequestsTable.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  res.json(request);
});

router.get("/all-requests/summary", async (_req, res): Promise<void> => {
  const [portalCount] = await db.select({ count: sql<number>`count(*)` }).from(portalRequestsTable);
  const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(productRequestsTable);
  const [brandingCount] = await db.select({ count: sql<number>`count(*)` }).from(brandingLocationRequestsTable);

  res.json({
    portal: Number(portalCount.count),
    product: Number(productCount.count),
    branding: Number(brandingCount.count),
    total: Number(portalCount.count) + Number(productCount.count) + Number(brandingCount.count),
  });
});

export default router;
