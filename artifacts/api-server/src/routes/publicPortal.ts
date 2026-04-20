import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, partnersTable, requestsTable, requestItemsTable, requestUploadsTable, pricingRulesTable, partnerThemesTable, partnerSectionsTable, partnerBrandingLocationsTable, productCatalogTable, partnerProductOverridesTable, citiesTable, venuesTable, eventsTable, packagesTable, packageItemsTable, ordersTable, orderItemsTable, suppliersTable } from "@workspace/db";
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
    .where(and(eq(partnerBrandingLocationsTable.partnerId, partner.id), eq(partnerBrandingLocationsTable.isActive, true), eq(partnerBrandingLocationsTable.reviewStatus, "approved")))
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

// Public ordering portal data
router.get("/public/partners/:slug/ordering", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true)));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const cities = await db.select().from(citiesTable)
    .where(and(eq(citiesTable.partnerId, partner.id), eq(citiesTable.isActive, true)))
    .orderBy(citiesTable.sortOrder, citiesTable.name);
  const venues = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.partnerId, partner.id), eq(venuesTable.isActive, true)))
    .orderBy(venuesTable.name);
  const events = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.partnerId, partner.id), eq(eventsTable.isActive, true)))
    .orderBy(eventsTable.eventStartDate);
  const packages = await db.select().from(packagesTable)
    .where(and(eq(packagesTable.partnerId, partner.id), eq(packagesTable.isActive, true)))
    .orderBy(packagesTable.tier);
  const allPkgItems = packages.length > 0 ? await db.select({
    id: packageItemsTable.id,
    packageId: packageItemsTable.packageId,
    productId: packageItemsTable.productId,
    productName: productCatalogTable.name,
    productCategory: productCatalogTable.category,
    productImageUrl: productCatalogTable.imageUrl,
    quantity: packageItemsTable.quantity,
    isOptional: packageItemsTable.isOptional,
    sortOrder: packageItemsTable.sortOrder,
  }).from(packageItemsTable).leftJoin(productCatalogTable, eq(packageItemsTable.productId, productCatalogTable.id)) : [];

  const products = await db.select().from(productCatalogTable)
    .where(eq(productCatalogTable.isActive, true))
    .orderBy(productCatalogTable.category, productCatalogTable.name);

  const packagesWithItems = packages.map(p => ({ ...p, items: allPkgItems.filter(it => it.packageId === p.id) }));

  res.json({ partner, cities, venues, events, packages: packagesWithItems, products });
});

import { z } from "zod";

const PublicOrderItemSchema = z.object({
  itemType: z.enum(["product", "package", "branding_zone", "custom"]).default("product"),
  productId: z.number().int().positive().nullable().optional(),
  packageId: z.number().int().positive().nullable().optional(),
  brandingZoneId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(500),
  quantity: z.number().int().positive().max(100000).default(1),
  unitPrice: z.string().max(40).nullable().optional(),
  fulfillmentMode: z.string().max(80).nullable().optional(),
  artworkFileUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

const PublicOrderSchema = z.object({
  eventId: z.number().int().positive().nullable().optional(),
  packageId: z.number().int().positive().nullable().optional(),
  shippingVenueId: z.number().int().positive().nullable().optional(),
  shippingAddress: z.any().nullable().optional(),
  billingAddress: z.any().nullable().optional(),
  fulfillmentMode: z.enum(["full", "graphic_only", "rental_plus_print", "client_owned_plus_print"]).default("full"),
  contactName: z.string().min(1).max(200),
  contactEmail: z.string().email().max(200),
  contactPhone: z.string().max(80).nullable().optional(),
  companyName: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  artworkFiles: z.array(z.object({ name: z.string().max(500), url: z.string().url().max(2000) })).max(50).optional(),
  totalEstimate: z.string().max(40).nullable().optional(),
  items: z.array(PublicOrderItemSchema).max(200).default([]),
}).strict();

router.post("/public/partners/:slug/orders", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true)));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const parsed = PublicOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid order payload", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const orderNumber = `PCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        orderNumber,
        partnerId: partner.id,
        eventId: data.eventId ?? null,
        packageId: data.packageId ?? null,
        portalType: "ordering",
        shippingVenueId: data.shippingVenueId ?? null,
        shippingAddressJson: data.shippingAddress ?? null,
        billingAddressJson: data.billingAddress ?? null,
        assignedSupplierId: partner.defaultSupplierId ?? null,
        fulfillmentMode: data.fulfillmentMode,
        status: "new",
        paymentStatus: "not_charged",
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        companyName: data.companyName ?? null,
        notes: data.notes ?? null,
        artworkFilesJson: data.artworkFiles ?? [],
        totalEstimate: data.totalEstimate ?? null,
      }).returning();

      if (data.items.length) {
        await tx.insert(orderItemsTable).values(data.items.map((it, idx) => ({
          orderId: order.id,
          itemType: it.itemType,
          productId: it.productId ?? null,
          packageId: it.packageId ?? null,
          brandingZoneId: it.brandingZoneId ?? null,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice ?? null,
          fulfillmentMode: it.fulfillmentMode ?? null,
          artworkFileUrl: it.artworkFileUrl ?? null,
          notes: it.notes ?? null,
          sortOrder: idx,
        })));
      }
      return order;
    });

    res.status(201).json({ id: result.id, orderNumber: result.orderNumber, message: "Order received" });
  } catch (e: any) {
    res.status(400).json({ error: "Could not create order", details: e?.message });
  }
});

export default router;
