import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, partnersTable, partnerAssetsTable, partnerThemesTable, partnerSectionsTable } from "@workspace/db";
import { emit } from "../services/usageTracking";
import { z } from "zod";
import {
  ListPartnersQueryParams,
  ListPartnerAssetsParams,
  CreatePartnerAssetParams,
  CreatePartnerAssetBody,
  DeletePartnerAssetParams,
} from "@workspace/api-zod";

const PartnerBody = z.object({
  companyName: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().optional().nullable(),
  secondaryLogoUrl: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  introHeadline: z.string().optional().nullable(),
  introText: z.string().optional().nullable(),
  thankYouText: z.string().optional().nullable(),
  capabilitiesLink: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  routingEmail: z.string().optional().nullable(),
  venueAddress: z.string().optional().nullable(),
  industryFocus: z.string().optional().nullable(),
  globalSizzleReelUrl: z.string().optional().nullable(),
  partnerVideoUrl: z.string().optional().nullable(),
  partnerDeckFileUrl: z.string().optional().nullable(),
  siteSurveyDeckFileUrl: z.string().optional().nullable(),
  portalMode: z.enum(["intake", "full", "ordering"]).optional().nullable(),
  partnerType: z.enum(["branding", "ordering"]).optional().nullable(),
  defaultSupplierId: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  smallA3BadgeEnabled: z.boolean().optional(),
  pricingDisplayEnabled: z.boolean().optional(),
  defaultBillingExecModel: z.string().optional().nullable(),
  billingEntityName: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  depositRequired: z.boolean().optional(),
  depositPct: z.union([z.string(), z.number()]).optional().nullable().transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    return v;
  }),
  allowPartialPayment: z.boolean().optional(),
  allowOrderOverride: z.boolean().optional(),
  defaultBillingNotes: z.string().optional().nullable(),
  billingContactName: z.string().optional().nullable(),
  billingContactEmail: z.string().optional().nullable(),
  billingContactPhone: z.string().optional().nullable(),
  internalBillingOwnerUserId: z.string().optional().nullable(),
  billingActive: z.boolean().optional(),
  unitPreference: z.enum(["imperial", "metric"]).nullable().optional(),
});

const UpdatePartnerBodySchema = PartnerBody.partial();

const router: IRouter = Router();

router.get("/partners", async (req, res): Promise<void> => {
  const params = ListPartnersQueryParams.safeParse(req.query);
  let query = db.select().from(partnersTable).orderBy(partnersTable.createdAt);

  if (params.success && params.data.active !== undefined) {
    const results = await db.select().from(partnersTable).where(eq(partnersTable.isActive, params.data.active)).orderBy(partnersTable.createdAt);
    res.json(results);
    return;
  }

  const results = await query;
  res.json(results);
});

router.post("/partners", async (req, res): Promise<void> => {
  const parsed = PartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db.insert(partnersTable).values(parsed.data).returning();
  emit("partner.created", { partnerId: partner.id, objectType: "partner", objectId: partner.id, meta: { companyName: partner.companyName } }).catch(() => {});
  res.status(201).json(partner);
});

router.get("/partners/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(partner);
});

router.patch("/partners/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdatePartnerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .update(partnersTable)
    .set(parsed.data)
    .where(eq(partnersTable.id, id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(partner);
});

router.post("/partners/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!source) { res.status(404).json({ error: "Partner not found" }); return; }

  const { id: _id, createdAt: _ca, updatedAt: _ua, ...fields } = source;
  const newSlug = `${source.slug}-copy-${Date.now().toString(36)}`;
  const [newPartner] = await db.insert(partnersTable).values({
    ...fields,
    slug: newSlug,
    companyName: `${source.companyName} (Copy)`,
    isActive: false,
  }).returning();

  const theme = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, id));
  if (theme.length > 0) {
    const { id: _tid, partnerId: _pid, createdAt: _tca, updatedAt: _tua, ...themeFields } = theme[0];
    await db.insert(partnerThemesTable).values({ ...themeFields, partnerId: newPartner.id });
  }

  const sections = await db.select().from(partnerSectionsTable).where(eq(partnerSectionsTable.partnerId, id));
  for (const section of sections) {
    const { id: _sid, partnerId: _spid, createdAt: _sca, updatedAt: _sua, ...sectionFields } = section;
    await db.insert(partnerSectionsTable).values({ ...sectionFields, partnerId: newPartner.id });
  }

  res.status(201).json(newPartner);
});

router.delete("/partners/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [partner] = await db
    .delete(partnersTable)
    .where(eq(partnersTable.id, id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/partners/:id/assets", async (req, res): Promise<void> => {
  const params = ListPartnerAssetsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const assets = await db
    .select()
    .from(partnerAssetsTable)
    .where(eq(partnerAssetsTable.partnerId, params.data.id))
    .orderBy(partnerAssetsTable.createdAt);

  res.json(assets);
});

router.post("/partners/:id/assets", async (req, res): Promise<void> => {
  const params = CreatePartnerAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreatePartnerAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [asset] = await db
    .insert(partnerAssetsTable)
    .values({ ...parsed.data, partnerId: params.data.id })
    .returning();

  res.status(201).json(asset);
});

router.delete("/partners/:id/assets/:assetId", async (req, res): Promise<void> => {
  const params = DeletePartnerAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(partnerAssetsTable)
    .where(eq(partnerAssetsTable.id, params.data.assetId));

  res.sendStatus(204);
});

export default router;
