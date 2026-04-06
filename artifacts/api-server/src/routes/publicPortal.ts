import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, partnersTable, requestsTable, requestItemsTable, requestUploadsTable, pricingRulesTable } from "@workspace/db";
import {
  GetPublicPartnerParams,
  SubmitPublicRequestParams,
  SubmitPublicRequestBody,
} from "@workspace/api-zod";
import { generateAiSummary, generateInternalSummary, estimateScopeLevel } from "../lib/aiSummary";
import { generateRecommendedUpsells } from "../lib/upsells";
import { generatePdfHtml } from "../lib/pdfGenerator";
import { sendRequestNotification } from "../lib/resend";

const router: IRouter = Router();

router.get("/public/partners/:slug", async (req, res): Promise<void> => {
  const params = GetPublicPartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [partner] = await db
    .select()
    .from(partnersTable)
    .where(and(eq(partnersTable.slug, params.data.slug), eq(partnersTable.isActive, true)));

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  let pricingRules: any[] = [];
  if (partner.pricingDisplayEnabled) {
    const rules = await db
      .select()
      .from(pricingRulesTable)
      .where(eq(pricingRulesTable.isActive, true));

    pricingRules = rules.map((r) => ({
      category: r.category,
      itemName: r.itemName,
      startingPrice: r.startingPrice,
      displayNote: (r.category === "Custom fabrication" || r.category === "Immersive experiences")
        ? "Quoted based on scope"
        : null,
    }));
  }

  res.json({ ...partner, pricingRules });
});

router.get("/public/pricing", async (_req, res): Promise<void> => {
  const rules = await db
    .select()
    .from(pricingRulesTable)
    .where(eq(pricingRulesTable.isActive, true));

  const publicRules = rules.map((r) => ({
    category: r.category,
    itemName: r.itemName,
    startingPrice: r.startingPrice,
    displayNote: (r.category === "Custom fabrication" || r.category === "Immersive experiences")
      ? "Quoted based on scope"
      : null,
  }));

  res.json(publicRules);
});

router.post("/public/partners/:slug/requests", async (req, res): Promise<void> => {
  const params = SubmitPublicRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitPublicRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .select()
    .from(partnersTable)
    .where(and(eq(partnersTable.slug, params.data.slug), eq(partnersTable.isActive, true)));

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  const data = parsed.data;
  const items = data.items || [];
  const uploads = data.uploads || [];

  const internalSummary = generateInternalSummary({
    companyName: data.companyName,
    contactName: data.contactName,
    email: data.email,
    phone: data.phone || null,
    eventName: data.eventName,
    eventDate: data.eventDate || null,
    venueName: data.venueName || null,
    venueAddress: data.venueAddress || null,
    installDatetime: data.installDatetime || null,
    removalDatetime: data.removalDatetime || null,
    postEventDisposition: data.postEventDisposition || null,
    items: items.map((i) => ({
      category: i.category,
      itemName: i.itemName,
      quantityNote: i.quantityNote || null,
      sizeNote: i.sizeNote || null,
    })),
    uploads: uploads.map((u) => ({ uploadType: u.uploadType, fileName: u.fileName })),
    designAssistanceRequested: data.designAssistanceRequested || false,
    customFabricationRequested: data.customFabricationRequested || false,
    immersiveRequested: data.immersiveRequested || false,
    promotionalItemsRequested: data.promotionalItemsRequested || false,
    additionalNotes: data.additionalNotes || null,
  });

  const scopeLevel = estimateScopeLevel(
    items.map((i) => ({ category: i.category })),
    {
      designAssistanceRequested: data.designAssistanceRequested || false,
      customFabricationRequested: data.customFabricationRequested || false,
      immersiveRequested: data.immersiveRequested || false,
      promotionalItemsRequested: data.promotionalItemsRequested || false,
    },
  );

  const recommendedUpsells = generateRecommendedUpsells(items.map((i) => ({ itemName: i.itemName })));

  const [request] = await db.insert(requestsTable).values({
    partnerId: partner.id,
    companyName: data.companyName,
    contactName: data.contactName,
    email: data.email,
    phone: data.phone,
    eventName: data.eventName,
    eventDate: data.eventDate,
    venueName: data.venueName,
    venueAddress: data.venueAddress,
    installDatetime: data.installDatetime,
    removalDatetime: data.removalDatetime,
    postEventDisposition: data.postEventDisposition,
    industry: data.industry,
    useCase: data.useCase,
    designAssistanceRequested: data.designAssistanceRequested || false,
    customFabricationRequested: data.customFabricationRequested || false,
    immersiveRequested: data.immersiveRequested || false,
    promotionalItemsRequested: data.promotionalItemsRequested || false,
    additionalNotes: data.additionalNotes,
    status: "New",
    internalSummary,
    estimatedScopeLevel: scopeLevel,
    recommendedUpsellsJson: recommendedUpsells,
  }).returning();

  if (items.length > 0) {
    await db.insert(requestItemsTable).values(
      items.map((i) => ({
        requestId: request.id,
        category: i.category,
        itemName: i.itemName,
        quantityNote: i.quantityNote,
        sizeNote: i.sizeNote,
      })),
    );
  }

  if (uploads.length > 0) {
    await db.insert(requestUploadsTable).values(
      uploads.map((u) => ({
        requestId: request.id,
        uploadType: u.uploadType,
        fileUrl: u.fileUrl,
        fileName: u.fileName,
        mimeType: u.mimeType,
      })),
    );
  }

  generateAiSummary({
    companyName: data.companyName,
    contactName: data.contactName,
    eventName: data.eventName,
    eventDate: data.eventDate || null,
    venueName: data.venueName || null,
    venueAddress: data.venueAddress || null,
    items: items.map((i) => ({ category: i.category, itemName: i.itemName })),
    designAssistanceRequested: data.designAssistanceRequested || false,
    customFabricationRequested: data.customFabricationRequested || false,
    immersiveRequested: data.immersiveRequested || false,
    promotionalItemsRequested: data.promotionalItemsRequested || false,
    additionalNotes: data.additionalNotes || null,
    uploads: uploads.map((u) => ({ uploadType: u.uploadType, fileName: u.fileName })),
  }).then(async (aiSummary) => {
    await db
      .update(requestsTable)
      .set({ aiSummary })
      .where(eq(requestsTable.id, request.id));
  }).catch(() => {});

  const categories = [...new Set(items.map((i) => i.category))];
  sendRequestNotification({
    partnerName: partner.companyName,
    contactName: data.contactName,
    eventName: data.eventName,
    eventDate: data.eventDate || null,
    categories,
    requestId: request.id,
  }).catch(() => {});

  res.status(201).json({
    id: request.id,
    message: "Request submitted successfully",
  });
});

export default router;
