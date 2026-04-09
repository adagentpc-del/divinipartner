import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, partnersTable, requestsTable, requestItemsTable, requestUploadsTable, pricingRulesTable, partnerThemesTable, partnerSectionsTable, partnerBrandingLocationsTable, productCatalogTable, partnerProductOverridesTable } from "@workspace/db";
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

router.get("/public/partners/:slug/portal", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true)));

  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const [theme] = await db.select().from(partnerThemesTable)
    .where(eq(partnerThemesTable.partnerId, partner.id));

  const sections = await db.select().from(partnerSectionsTable)
    .where(and(eq(partnerSectionsTable.partnerId, partner.id), eq(partnerSectionsTable.isEnabled, true)))
    .orderBy(partnerSectionsTable.sortOrder);

  const brandingLocations = await db.select({
    id: partnerBrandingLocationsTable.id,
    name: partnerBrandingLocationsTable.name,
    category: partnerBrandingLocationsTable.category,
    description: partnerBrandingLocationsTable.description,
    sizeWidth: partnerBrandingLocationsTable.sizeWidth,
    sizeHeight: partnerBrandingLocationsTable.sizeHeight,
    sizeUnit: partnerBrandingLocationsTable.sizeUnit,
    previewImageUrl: partnerBrandingLocationsTable.previewImageUrl,
    templateFileUrl: partnerBrandingLocationsTable.templateFileUrl,
    artworkGuidelines: partnerBrandingLocationsTable.artworkGuidelines,
    sortOrder: partnerBrandingLocationsTable.sortOrder,
  }).from(partnerBrandingLocationsTable)
    .where(and(eq(partnerBrandingLocationsTable.partnerId, partner.id), eq(partnerBrandingLocationsTable.isActive, true)))
    .orderBy(partnerBrandingLocationsTable.sortOrder);

  const allProducts = await db.select().from(productCatalogTable)
    .where(and(eq(productCatalogTable.isActive, true), eq(productCatalogTable.isOrderable, true)));

  const overrides = await db.select().from(partnerProductOverridesTable)
    .where(eq(partnerProductOverridesTable.partnerId, partner.id));

  const overrideMap = new Map(overrides.map(o => [o.productId, o]));
  const products = allProducts.map(p => {
    const override = overrideMap.get(p.id);
    if (override && !override.isVisible) return null;
    return {
      id: p.id,
      name: override?.customTitle || p.name,
      slug: p.slug,
      category: p.category,
      description: override?.customDescription || p.description,
      imageUrl: override?.customImageUrl || p.imageUrl,
      isOrderable: p.isOrderable,
      allowsDesignRequest: p.allowsDesignRequest,
      sizeOptionsJson: p.sizeOptionsJson,
      sortOrder: override?.sortOrder ?? p.sortOrder,
    };
  }).filter(Boolean);

  let pricingRules: any[] = [];
  if (partner.pricingDisplayEnabled) {
    const rules = await db.select().from(pricingRulesTable).where(eq(pricingRulesTable.isActive, true));
    pricingRules = rules.map(r => ({
      category: r.category,
      itemName: r.itemName,
      startingPrice: r.startingPrice,
    }));
  }

  res.json({
    partner: {
      id: partner.id,
      companyName: partner.companyName,
      slug: partner.slug,
      logoUrl: partner.logoUrl,
      secondaryLogoUrl: partner.secondaryLogoUrl,
      websiteUrl: partner.websiteUrl,
      smallA3BadgeEnabled: partner.smallA3BadgeEnabled,
      introHeadline: partner.introHeadline,
      introText: partner.introText,
      thankYouText: partner.thankYouText,
      capabilitiesLink: partner.capabilitiesLink,
      partnerDeckFileUrl: partner.partnerDeckFileUrl,
      globalSizzleReelUrl: partner.globalSizzleReelUrl,
      partnerVideoUrl: partner.partnerVideoUrl,
      portalMode: partner.portalMode,
    },
    theme: theme || null,
    sections,
    products,
    brandingLocations,
    pricingRules,
  });
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
