import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, partnersTable, requestsTable, requestItemsTable, requestUploadsTable, pricingRulesTable, partnerThemesTable, partnerSectionsTable, partnerBrandingLocationsTable, productCatalogTable, partnerProductOverridesTable, citiesTable, venuesTable, eventsTable, packagesTable, packageItemsTable, ordersTable, orderItemsTable, suppliersTable, inventoryTable, inventoryReservationsTable, computePrice, convert, resolvePreference, withMmColumns, withWeightColumns, type LengthUnit, type PricingModel, type PricingUnit } from "@workspace/db";
const _inArray = inArray;

// Public visibility gate: a partner is reachable from the public portal only when active and
// in a publicly-shown launch state. "preview" is shown but flagged so the UI can render a banner.
const PUBLIC_LAUNCH_STATES = ["live", "preview"] as const;
const ORDERABLE_LAUNCH_STATES = ["live"] as const;
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

function safePublicTheme(theme: any): any {
  if (!theme) return null;
  if (!theme.isPublished) return { templateKey: theme.templateKey };
  const { id: _id, partnerId: _pid, themeNotes: _tn, aiSuggestedJson: _ai, isApproved: _ia, createdAt: _ca, updatedAt: _ua, ...publicFields } = theme;
  return publicFields;
}

router.get("/public/partners/:slug", async (req, res): Promise<void> => {
  const params = GetPublicPartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [partner] = await db
    .select()
    .from(partnersTable)
    .where(and(eq(partnersTable.slug, params.data.slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));

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

  const [theme] = await db.select().from(partnerThemesTable)
    .where(eq(partnerThemesTable.partnerId, partner.id));

  const safePartner = {
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
    portalMode: partner.portalMode,
    partnerType: partner.partnerType,
    pricingDisplayEnabled: partner.pricingDisplayEnabled,
    capabilitiesLink: partner.capabilitiesLink,
    partnerDeckFileUrl: partner.partnerDeckFileUrl,
    globalSizzleReelUrl: partner.globalSizzleReelUrl,
    partnerVideoUrl: partner.partnerVideoUrl,
  };

  res.json({ ...safePartner, pricingRules, theme: safePublicTheme(theme), previewMode: partner.launchStatus === "preview" });
});

router.get("/public/partners/:slug/portal", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));

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
    theme: safePublicTheme(theme),
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
    .where(and(eq(partnersTable.slug, params.data.slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  if (!ORDERABLE_LAUNCH_STATES.includes(partner.launchStatus as any)) {
    res.status(409).json({
      error: "Portal is in preview mode — submissions are disabled until it goes live.",
      launchStatus: partner.launchStatus,
    });
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
    // Resolve any product/zone refs once for measurement-aware pricing.
    const reqProductIds = items.map(i => (i as any).productId).filter((x: any): x is number => !!x);
    const reqZoneIds = items.map(i => (i as any).brandingZoneId).filter((x: any): x is number => !!x);
    const reqProducts = reqProductIds.length
      ? await db.select().from(productCatalogTable).where(_inArray(productCatalogTable.id, reqProductIds))
      : [];
    const reqZones = reqZoneIds.length
      ? await db.select().from(partnerBrandingLocationsTable).where(_inArray(partnerBrandingLocationsTable.id, reqZoneIds))
      : [];
    const reqProdById = new Map(reqProducts.map(p => [p.id, p as any]));
    const reqZoneById = new Map(reqZones.map(z => [z.id, z as any]));
    await db.insert(requestItemsTable).values(
      items.map((i: any) => {
        const w = i.width ?? null;
        const h = i.height ?? null;
        const u = (i.sizeUnit as LengthUnit | null) ?? null;
        const wMm = w != null && u ? convert(w, u, "mm") : null;
        const hMm = h != null && u ? convert(h, u, "mm") : null;
        const meta: any = i.productId ? reqProdById.get(i.productId)
          : i.brandingZoneId ? reqZoneById.get(i.brandingZoneId) : null;
        let priced: ReturnType<typeof computePrice> | null = null;
        if (meta && meta.pricingModel) {
          priced = computePrice({
            pricingModel: meta.pricingModel as PricingModel,
            unitRate: meta.unitRate,
            pricingUnit: meta.pricingUnit as PricingUnit | null,
            widthMm: wMm ?? meta.sizeWidthMm ?? null,
            heightMm: hMm ?? meta.sizeHeightMm ?? null,
            quantity: 1,
            minBillableSize: meta.minBillableSize,
            minCharge: meta.minCharge,
          });
        }
        return {
          requestId: request.id,
          category: i.category,
          itemName: i.itemName,
          quantityNote: i.quantityNote,
          sizeNote: i.sizeNote,
          sizeWidth: w,
          sizeHeight: h,
          sizeUnit: u,
          sizeWidthMm: wMm,
          sizeHeightMm: hMm,
          pricingModel: priced?.pricingModel ?? meta?.pricingModel ?? null,
          unitRate: meta?.unitRate ?? null,
          pricingUnit: priced?.pricingUnit ?? meta?.pricingUnit ?? null,
          calculatedAreaSqm: priced?.billableAreaSqm ?? null,
          calculatedLinearM: priced?.billableLinearM ?? null,
          estimatedPrice: priced?.total != null ? String(priced.total) : null,
        };
      }),
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

  // AI summary is deferred — admin triggers it explicitly from the request
  // detail page ("Generate AI Summary" button). This avoids automatic AI
  // costs on every customer submission.

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
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));
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

  const allProducts = await db.select().from(productCatalogTable)
    .where(eq(productCatalogTable.isActive, true))
    .orderBy(productCatalogTable.category, productCatalogTable.name);

  const products = allProducts.map(p => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    slug: p.slug,
    category: p.category,
    description: p.description,
    imageUrl: p.imageUrl,
    galleryImagesJson: p.galleryImagesJson,
    visibleDimensions: p.visibleDimensions,
    sizeWidth: p.sizeWidth,
    sizeHeight: p.sizeHeight,
    sizeUnit: p.sizeUnit,
    isOrderable: p.isOrderable,
    allowsDesignRequest: p.allowsDesignRequest,
    sizeOptionsJson: p.sizeOptionsJson,
    sortOrder: p.sortOrder,
    pricingModel: p.pricingModel,
    pricingUnit: p.pricingUnit,
    unitRate: p.unitRate,
    allowsCustomSize: p.allowsCustomSize,
    hardwareIncluded: p.hardwareIncluded,
    printOnlyAvailable: p.printOnlyAvailable,
    rentalEligible: p.rentalEligible,
    featureBadgesJson: p.featureBadgesJson,
  }));

  const packagesWithItems = packages.map(p => ({ ...p, items: allPkgItems.filter(it => it.packageId === p.id) }));

  // Include theme so OrderingPortal can render branded UI without a second fetch.
  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partner.id));

  // Section 35: surface effective add-ons for each event so the OrderingPortal
  // can render the partner's add-on library + per-event overrides without a
  // second fetch per event.
  const { resolveEventAddons } = await import("./addons");
  const eventAddons = await Promise.all(
    events.map(async (e) => ({ eventId: e.id, ...(await resolveEventAddons(e.id)) })),
  );

  const safeOrderingPartner = {
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
    portalMode: partner.portalMode,
    partnerType: partner.partnerType,
    pricingDisplayEnabled: partner.pricingDisplayEnabled,
  };

  res.json({ partner: safeOrderingPartner, theme: safePublicTheme(theme), cities, venues, events, packages: packagesWithItems, products, eventAddons });
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
  customWidth: z.number().positive().nullable().optional(),
  customHeight: z.number().positive().nullable().optional(),
  customSizeUnit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().optional(),
  // Task #5: link a cart line to an approved Venue Asset Survey record so A3
  // intake can render measurements/material/internal notes for that line.
  surveyAssetId: z.number().int().positive().nullable().optional(),
  selectedMaterial: z.string().max(120).nullable().optional(),
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
  artworkFiles: z.array(z.object({
    name: z.string().max(500),
    url: z.string().min(1).max(2000).refine(
      (v) => /^https?:\/\//i.test(v) || v.startsWith("/objects/") || v.startsWith("/public-objects/"),
      { message: "url must be an http(s) link or an internal object path" }
    ),
  })).max(50).optional(),
  totalEstimate: z.string().max(40).nullable().optional(),
  items: z.array(PublicOrderItemSchema).max(200).default([]),
}).strict();

// Section 26: public family-context lookup so the OrderingPortal can show
// "uses your existing tent frame (X of Y)" or "new frame required" hints
// without exposing the authenticated admin endpoint.
router.get("/public/partners/:slug/products/:productId/family-context", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "bad productId" }); return; }
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  const { getFamilyContextForProduct, getPartnerFamilyAvailability } = await import("../lib/familyAvailability");
  const ctx = await getFamilyContextForProduct(productId);
  if (!ctx) { res.json({ inFamily: false }); return; }
  const avail = await getPartnerFamilyAvailability(partner.id, ctx.family.id);
  res.json({
    inFamily: true,
    familyId: ctx.family.id,
    familyName: ctx.family.name,
    role: ctx.member.role,
    requiresHardwareUnits: ctx.member.requiresHardwareUnits,
    hardwareProductId: ctx.family.hardwareProductId,
    requiresHardwareDefault: ctx.family.requiresHardwareDefault,
    availability: avail[0] ?? null,
  });
});

router.post("/public/partners/:slug/orders", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db.select().from(partnersTable)
    .where(and(eq(partnersTable.slug, slug), eq(partnersTable.isActive, true), inArray(partnersTable.launchStatus, [...PUBLIC_LAUNCH_STATES])));
  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  if (!ORDERABLE_LAUNCH_STATES.includes(partner.launchStatus as any)) {
    res.status(409).json({
      error: "Portal is in preview mode — orders cannot be submitted yet.",
      launchStatus: partner.launchStatus,
    });
    return;
  }

  const parsed = PublicOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid order payload", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const orderNumber = `PCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Resolve pricing-aware metadata for line items: products + branding zones referenced.
  const productIds = data.items.map(it => it.productId).filter((x): x is number => !!x);
  const zoneIds = data.items.map(it => it.brandingZoneId).filter((x): x is number => !!x);
  const productRows = productIds.length
    ? await db.select().from(productCatalogTable).where(_inArray(productCatalogTable.id, productIds))
    : [];
  const zoneRows = zoneIds.length
    ? await db.select().from(partnerBrandingLocationsTable).where(_inArray(partnerBrandingLocationsTable.id, zoneIds))
    : [];
  const productById = new Map(productRows.map(p => [p.id, p as any]));
  const zoneById = new Map(zoneRows.map(z => [z.id, z as any]));

  function priceForLine(it: z.infer<typeof PublicOrderItemSchema>) {
    const meta: any = it.productId ? productById.get(it.productId)
      : it.brandingZoneId ? zoneById.get(it.brandingZoneId) : null;
    if (!meta || !meta.pricingModel) return null;
    let widthMm: number | null = null, heightMm: number | null = null;
    let enteredW = it.customWidth ?? null, enteredH = it.customHeight ?? null;
    let enteredU: LengthUnit | null = (it.customSizeUnit as LengthUnit | null) ?? null;
    if (enteredW != null && enteredU) widthMm = convert(enteredW, enteredU, "mm");
    if (enteredH != null && enteredU) heightMm = convert(enteredH, enteredU, "mm");
    // Fall back to product/zone native size when no custom size supplied.
    if (widthMm == null && (meta as any).sizeWidthMm) widthMm = Number((meta as any).sizeWidthMm);
    if (heightMm == null && (meta as any).sizeHeightMm) heightMm = Number((meta as any).sizeHeightMm);
    const result = computePrice({
      pricingModel: meta.pricingModel as PricingModel,
      unitRate: meta.unitRate,
      pricingUnit: meta.pricingUnit as PricingUnit | null,
      widthMm, heightMm,
      quantity: it.quantity,
      minBillableSize: meta.minBillableSize,
      minCharge: meta.minCharge,
    });
    return { result, widthMm, heightMm, enteredW, enteredH, enteredU };
  }

  // Resolve measurement system: event → venue → partner → default.
  let _event: any = null, _venue: any = null;
  if (data.eventId) {
    const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, data.eventId));
    _event = ev ?? null;
  }
  if (data.shippingVenueId) {
    const [vn] = await db.select().from(venuesTable).where(eq(venuesTable.id, data.shippingVenueId));
    _venue = vn ?? null;
  } else if (_event?.venueId) {
    const [vn] = await db.select().from(venuesTable).where(eq(venuesTable.id, _event.venueId));
    _venue = vn ?? null;
  }
  const _resolved = resolvePreference({ event: _event, venue: _venue, partner });
  const measurementSystem = _resolved.system;

  // ---- Task #5: validate any surveyAssetId references belong to THIS partner
  // and are approved + active. Without this check an attacker could submit a
  // public order on partner A referencing partner B's asset id, causing B's
  // internal data (notes, NetSuite numbers, install instructions) to surface
  // in A's internal intake email/panel.
  const submittedSurveyIds = Array.from(new Set(
    data.items.map(it => it.surveyAssetId).filter((v): v is number => typeof v === "number")
  ));
  if (submittedSurveyIds.length) {
    const { validateSurveyAssetIdsForPartner, resolveAllowedMaterialsForAsset } = await import("./surveyIntegration");
    const allowed = await validateSurveyAssetIdsForPartner(submittedSurveyIds, partner.id);
    const denied = submittedSurveyIds.filter(id => !allowed.has(id));
    if (denied.length) {
      res.status(400).json({
        code: "INVALID_SURVEY_ASSET",
        error: "One or more survey assets are not available for this partner.",
        deniedIds: denied,
      });
      return;
    }
    // Validate selectedMaterial against the resolved approved-material list
    // for each referenced asset so arbitrary strings can't enter ops intake.
    for (const it of data.items) {
      if (it.surveyAssetId == null || it.selectedMaterial == null) continue;
      const allowedMats = await resolveAllowedMaterialsForAsset(it.surveyAssetId, partner.id);
      if (!allowedMats || !allowedMats.has(it.selectedMaterial.trim().toLowerCase())) {
        res.status(400).json({
          code: "INVALID_SURVEY_MATERIAL",
          error: `"${it.selectedMaterial}" is not an approved material for the selected asset.`,
          surveyAssetId: it.surveyAssetId,
        });
        return;
      }
    }
  }

  // ---- Section 26: family-aware enforcement ---------------------------------
  // Mutates `data.items` in place to set fulfillmentMode / inventory source for
  // family components, or returns 409 when partner-owned hardware is exhausted.
  // Re-uses the same helper as the admin POST /orders so behavior is uniform.
  type ItemPlan = { inventoryId?: number | null; cityId?: number | null; fulfillmentMode?: string | null };
  const itemPlans: ItemPlan[] = data.items.map(() => ({}));
  if (data.items.length) {
    const { planFamilyReservations } = await import("../lib/familyAvailability");
    const scratch = data.items.map(it => ({
      productId: it.productId ?? null,
      quantity: it.quantity,
      inventorySourceInventoryId: null as number | null,
      inventorySourceCityId: null as number | null,
      fulfillmentMode: it.fulfillmentMode ?? null,
    }));
    const plan = await planFamilyReservations(partner.id, scratch, _event?.cityId ?? null);
    if (!plan.ok) { res.status(plan.status).json(plan.body); return; }
    scratch.forEach((s, i) => {
      itemPlans[i] = {
        inventoryId: s.inventorySourceInventoryId,
        cityId: s.inventorySourceCityId,
        fulfillmentMode: s.fulfillmentMode,
      };
    });
    // The reservation step inside the txn requires an eventId. If a family
    // component was planned but the order has no event, fail loudly rather
    // than silently dropping the reservation and leaking hardware.
    const hasPlannedReservation = itemPlans.some(p => p.inventoryId);
    if (hasPlannedReservation && !data.eventId) {
      res.status(400).json({
        code: "EVENT_REQUIRED",
        error: "An event must be selected before ordering hardware-dependent items so the reservation can be tied to it.",
      });
      return;
    }
  }

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
        measurementSystem,
      }).returning();

      if (data.items.length) {
        // Section 26: when a family-component item has a planned inventory
        // source, atomically reserve the hardware unit before inserting the
        // item row so any race against a concurrent order is caught here.
        const insertedRows: Array<any> = [];
        for (let idx = 0; idx < data.items.length; idx++) {
          const it = data.items[idx];
          const priced = priceForLine(it);
          const r = priced?.result ?? null;
          const prod: any = it.productId ? productById.get(it.productId) : null;
          const packed = prod ? withWeightColumns(withMmColumns({
            packedWidth: prod.packedWidth, packedHeight: prod.packedHeight, packedDepth: prod.packedDepth, packedSizeUnit: prod.packedSizeUnit,
            shippingWeight: prod.shippingWeight, shippingWeightUnit: prod.shippingWeightUnit,
            cartonCount: prod.cartonCount, packingMode: prod.packingMode,
            crateRequired: !!prod.crateRequired, palletRequired: !!prod.palletRequired, oversizeFlag: !!prod.oversizeFlag,
            freightClass: prod.freightClass, installKitNotes: prod.installKitNotes,
          })) : {};

          // Reserve hardware atomically when family planning assigned a row.
          let inventoryReservationId: number | null = null;
          let reservedQuantity = 0;
          let shortageQuantity = 0;
          const planned = itemPlans[idx];
          if (planned?.inventoryId && data.eventId) {
            const lockRows: any = await tx.execute(sql`SELECT id, total_quantity, reserved, in_use, damaged, retired, partner_id FROM inventory WHERE id = ${planned.inventoryId} FOR UPDATE`);
            const inv = lockRows.rows?.[0];
            if (inv && Number(inv.partner_id) === partner.id) {
              const total = Number(inv.total_quantity) || 0;
              const used = (Number(inv.reserved) || 0) + (Number(inv.in_use) || 0) + (Number(inv.damaged) || 0) + (Number(inv.retired) || 0);
              const available = Math.max(0, total - used);
              const reserveNow = Math.min(available, it.quantity);
              if (reserveNow < it.quantity) {
                // Race lost — same family helper would now return 409.
                throw Object.assign(new Error("Hardware exhausted between validation and reservation"), {
                  __familyConflict: true,
                  body: { code: "HARDWARE_REQUIRED", error: "Hardware was just claimed by another order — please retry.", available, needed: it.quantity },
                });
              }
              const [resv] = await tx.insert(inventoryReservationsTable).values({
                inventoryId: planned.inventoryId, eventId: data.eventId, quantity: reserveNow,
                status: "active", notes: `Auto-reserved by public order ${orderNumber}`,
              }).returning();
              await tx.update(inventoryTable).set({ reserved: sql`${inventoryTable.reserved} + ${reserveNow}` }).where(eq(inventoryTable.id, planned.inventoryId));
              inventoryReservationId = resv.id;
              reservedQuantity = reserveNow;
            }
          }

          insertedRows.push({
            ...packed,
            orderId: order.id,
            itemType: it.itemType,
            productId: it.productId ?? null,
            packageId: it.packageId ?? null,
            brandingZoneId: it.brandingZoneId ?? null,
            name: it.name,
            quantity: it.quantity,
            unitPrice: r?.requiresQuote
              ? null
              : (r?.unitPrice != null ? String(r.unitPrice) : (it.unitPrice ?? null)),
            fulfillmentMode: planned?.fulfillmentMode ?? it.fulfillmentMode ?? null,
            artworkFileUrl: it.artworkFileUrl ?? null,
            notes: it.notes ?? null,
            sortOrder: idx,
            enteredWidth: priced?.enteredW ?? null,
            enteredHeight: priced?.enteredH ?? null,
            enteredSizeUnit: priced?.enteredU ?? null,
            enteredWidthMm: priced?.widthMm ?? null,
            enteredHeightMm: priced?.heightMm ?? null,
            billableAreaSqm: r?.billableAreaSqm ?? null,
            billableLinearM: r?.billableLinearM ?? null,
            pricingModel: r?.pricingModel ?? null,
            pricingUnit: r?.pricingUnit ?? null,
            calculationBasis: r?.basis ?? null,
            inventorySourceInventoryId: planned?.inventoryId ?? null,
            inventoryReservationId,
            reservedQuantity,
            shortageQuantity,
            surveyAssetId: it.surveyAssetId ?? null,
            selectedMaterial: it.selectedMaterial ?? null,
          });
        }
        await tx.insert(orderItemsTable).values(insertedRows);
      }
      return order;
    });

    // Fire-and-forget customer confirmation + internal forward emails. Order
    // submission must never fail because of email issues — we surface a partial
    // success state in the response so the UI can show "order received but
    // email needs attention".
    // Per-role status surfaced to the client so the UI can show exactly which
    // audiences were notified and which need attention. "forward" is kept for
    // backwards compatibility with older clients reading the old shape.
    let emailStatus: {
      confirmation: boolean;
      ops: boolean;
      finance: boolean;
      partnerContact: boolean;
      vendor: boolean;
      forward: boolean;
      warnings: string[];
    } = { confirmation: false, ops: false, finance: false, partnerContact: false, vendor: false, forward: false, warnings: [] };
    try {
      const { sendOrderEmails } = await import("../lib/email");
      const sent = await sendOrderEmails(result.id);
      emailStatus.confirmation = sent.confirmation.ok;
      emailStatus.ops = sent.ops.ok;
      emailStatus.finance = sent.finance.ok;
      emailStatus.partnerContact = sent.partnerContact.ok;
      emailStatus.vendor = sent.vendor.ok;
      emailStatus.forward = sent.ops.ok;
      // Only surface a warning if the role had a recipient configured and the
      // send still failed. "no_*_recipient" is an expected steady-state for
      // partners that don't use a given role.
      const noteIfNeeded = (label: string, r: { ok: boolean; error?: string }) => {
        if (r.ok) return;
        if (r.error && r.error.startsWith("no_") && r.error.endsWith("_recipient")) return;
        emailStatus.warnings.push(`${label}: ${r.error || "unknown_error"}`);
      };
      if (!sent.confirmation.ok && sent.confirmation.error !== "no_customer_email") {
        emailStatus.warnings.push(`confirmation: ${sent.confirmation.error}`);
      }
      noteIfNeeded("ops", sent.ops);
      noteIfNeeded("finance", sent.finance);
      noteIfNeeded("partner_contact", sent.partnerContact);
      noteIfNeeded("vendor", sent.vendor);
    } catch (emailErr: any) {
      emailStatus.warnings.push(`email_pipeline: ${emailErr?.message || String(emailErr)}`);
    }

    res.status(201).json({
      id: result.id,
      orderNumber: result.orderNumber,
      message: "Order received",
      email: emailStatus,
    });
  } catch (e: any) {
    if (e?.__familyConflict && e.body) { res.status(409).json(e.body); return; }
    res.status(400).json({ error: "Could not create order", details: e?.message });
  }
});

export default router;
