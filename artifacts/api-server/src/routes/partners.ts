import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, partnersTable, partnerAssetsTable, partnerThemesTable, partnerSectionsTable } from "@workspace/db";
import { emit } from "../services/usageTracking";
import { z } from "zod";
import {
  ListPartnersQueryParams,
  ListPartnersResponse,
  GetPartnerResponse,
  UpdatePartnerResponse,
  ListPartnerAssetsParams,
  ListPartnerAssetsResponse,
  CreatePartnerAssetParams,
  CreatePartnerAssetBody,
  DeletePartnerAssetParams,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

// Top-level path segments the SPA already routes to. A partner slug equal to
// any of these would shadow the real route at `/<slug>` and silently break
// links. Keep in sync with `App.tsx` route definitions.
const RESERVED_SLUGS = new Set([
  "admin", "login", "logout", "signup", "sign-in", "sign-up",
  "onboard", "onboarding", "partner", "invoice", "api", "__clerk",
  "assets", "public", "static", "favicon.ico", "robots.txt",
]);
const slugSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase letters, digits, and hyphens (no leading hyphen)")
  .refine((s) => !RESERVED_SLUGS.has(s), { message: "That slug is reserved by the app — pick another." });

const PartnerBody = z.object({
  companyName: z.string().min(1),
  slug: slugSchema,
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
  portalMode: z.enum(["intake", "full", "ordering"]).optional().nullable().transform((v) => v ?? undefined),
  partnerType: z.enum(["branding", "ordering"]).optional().nullable(),
  defaultSupplierId: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  smallA3BadgeEnabled: z.boolean().optional(),
  pricingDisplayEnabled: z.boolean().optional(),
  defaultBillingExecModel: z.string().optional().nullable().transform((v) => v ?? undefined),
  billingEntityName: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  depositRequired: z.boolean().optional(),
  depositPct: z.union([z.string(), z.number()]).optional().nullable().transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    return String(v);
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
  // Communications / email config — kept lenient so partners can save
  // partial/draft data. Strict email validation is enforced only when an
  // actual send is attempted (e.g. test-confirmation-email route).
  emailFromName: z.string().max(120).optional().nullable(),
  replyToEmail: z.string().max(320).optional().nullable(),
  emailSenderLabel: z.string().max(120).optional().nullable(),
  internalForwardEmail: z.string().max(320).optional().nullable(),
  ccEmail: z.string().max(320).optional().nullable(),
  emailEnabled: z.boolean().optional(),
  // PDF attachment toggles (April 2026)
  attachPdfCustomer: z.boolean().optional(),
  attachPdfOps: z.boolean().optional(),
  attachPdfFinance: z.boolean().optional(),
  attachPdfPartnerContact: z.boolean().optional(),
  // Pass 7 (April 2026) — Internal A3 intake routing fields. Surfaced on
  // the polished operational order email and on the OrderDetail intake
  // panel. Lenient validation: kept optional/nullable so partials save
  // cleanly; format checks happen at send time, not save time.
  netsuiteCustomerNumber: z.string().max(64).optional().nullable(),
  programManagerName: z.string().max(160).optional().nullable(),
  programManagerEmail: z.string().max(320).optional().nullable(),
  internalAccountOwnerName: z.string().max(160).optional().nullable(),
  internalAccountOwnerEmail: z.string().max(320).optional().nullable(),
  supportContactName: z.string().max(160).optional().nullable(),
  supportContactEmail: z.string().max(320).optional().nullable(),
  // Task #27: per-partner A3 salesperson routing for PM intake packet (default Alyssa DelTorre).
  salespersonName: z.string().max(160).optional().nullable(),
  salespersonEmail: z.string().max(320).optional().nullable(),
  salespersonPhone: z.string().max(64).optional().nullable(),
  internalReplyToEmail: z.string().max(320).optional().nullable(),
  // Currency & tax defaults (April 2026 international billing extension)
  defaultCurrency: z.string().min(3).max(3).optional(),
  defaultTaxMode: z.enum(["none","sales_tax","vat","gst","custom"]).optional(),
  defaultTaxLabel: z.string().optional().nullable(),
  defaultTaxRate: z.union([z.string(), z.number()]).optional().nullable().transform(v => v == null || v === "" ? null : String(v)),
  taxInclusive: z.boolean().optional(),
  billingCountry: z.string().optional().nullable(),
  invoiceDisplayNotes: z.string().optional().nullable(),
  // Section 36: add-on display preferences
  addonDisplayFormat: z.enum(["flat", "grid", "category_tiles"]).optional(),
  addonCategoryGroupingEnabled: z.boolean().optional(),
});

const UpdatePartnerBodySchema = PartnerBody.partial();

// Lightweight admin guard for endpoints that trigger external email sends.
// Test-send routes hit Resend on demand, so we require an authenticated Clerk session
// to prevent unauthenticated abuse (spam relay, partner enumeration via email blasts).
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

const router: IRouter = Router();

router.get("/partners", async (req, res): Promise<void> => {
  const params = ListPartnersQueryParams.safeParse(req.query);
  const results =
    params.success && params.data.active !== undefined
      ? await db.select().from(partnersTable).where(eq(partnersTable.isActive, params.data.active)).orderBy(partnersTable.createdAt)
      : await db.select().from(partnersTable).orderBy(partnersTable.createdAt);
  sendValidated(req, res, ListPartnersResponse, results, "List partners");
});

router.post("/partners", async (req, res): Promise<void> => {
  const parsed = PartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Some fields are invalid. Please check the highlighted entries.",
      details: parsed.error.format(),
      issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
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

  sendValidated(req, res, GetPartnerResponse, partner, "Get partner");
});

router.patch("/partners/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Look up the existing partner first so we can tolerate legacy slugs.
  // Some production partners were created before the strict lowercase slug
  // rule (e.g. "SCF", "A3TheMoveMiami"). If the form re-submits the same
  // slug unchanged, we should not reject the update — strict validation
  // only applies when the slug is actually being changed to a new value.
  const [existing] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  // Body must be a plain JSON object — guard against arrays/primitives
  // sneaking through Express's JSON parser.
  if (req.body == null || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }
  const incoming = { ...(req.body as Record<string, unknown>) };
  if (typeof incoming.slug === "string" && incoming.slug === existing.slug) {
    delete incoming.slug;
  }

  const parsed = UpdatePartnerBodySchema.safeParse(incoming);
  if (!parsed.success) {
    res.status(400).json({
      error: "Some fields are invalid. Please check the highlighted entries.",
      details: parsed.error.format(),
      issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  // Normalize empty strings to null for all string fields so blank inputs
  // clear the column instead of storing literal "". Booleans and numerics are
  // left alone.
  const updateData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    updateData[k] = (typeof v === "string" && v.trim() === "") ? null : v;
  }

  // If nothing actually changed (e.g. only an unchanged slug was sent and got
  // stripped above), there is nothing to update — just return the existing
  // partner so the client treats this as a successful no-op save.
  if (Object.keys(updateData).length === 0) {
    sendValidated(req, res, UpdatePartnerResponse, existing, "Update partner (no-op)");
    return;
  }

  const [partner] = await db
    .update(partnersTable)
    .set(updateData as any)
    .where(eq(partnersTable.id, id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  sendValidated(req, res, UpdatePartnerResponse, partner, "Update partner");
});

// Walkthrough settings: enable/disable, custom video override, and regenerate.
// The interactive walkthrough is always generated live on the portal from
// current portal data; this endpoint persists admin choices and an optional
// snapshot of the deterministic script (sent by the client preview) so the
// admin model stays in parity. When a custom video URL is present the status
// reflects "video_ready" (the override takes priority on the live portal).
const WalkthroughBody = z.object({
  walkthroughEnabled: z.boolean().optional(),
  walkthroughVideoUrl: z.string().optional().nullable(),
  walkthroughVideoPosterUrl: z.string().optional().nullable(),
  walkthroughScript: z.record(z.string(), z.unknown()).optional().nullable(),
  regenerate: z.boolean().optional(),
});

router.patch("/partners/:id/walkthrough", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  const parsed = WalkthroughBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const norm = (v: string | null | undefined): string | null =>
    typeof v === "string" && v.trim() === "" ? null : (v ?? null);

  const updateData: Record<string, unknown> = {};

  if (parsed.data.walkthroughEnabled !== undefined) {
    updateData.walkthroughEnabled = parsed.data.walkthroughEnabled;
  }

  const nextVideoUrl =
    parsed.data.walkthroughVideoUrl !== undefined
      ? norm(parsed.data.walkthroughVideoUrl)
      : existing.walkthroughVideoUrl;
  if (parsed.data.walkthroughVideoUrl !== undefined) {
    updateData.walkthroughVideoUrl = nextVideoUrl;
  }
  if (parsed.data.walkthroughVideoPosterUrl !== undefined) {
    updateData.walkthroughVideoPosterUrl = norm(parsed.data.walkthroughVideoPosterUrl);
  }

  // Persist a regenerated script snapshot + timestamp when requested.
  if (parsed.data.regenerate || parsed.data.walkthroughScript !== undefined) {
    updateData.walkthroughScript = parsed.data.walkthroughScript ?? null;
    updateData.walkthroughGeneratedAt = new Date();
  }

  // Derive status: a custom video wins; otherwise the interactive walkthrough
  // is always available.
  updateData.walkthroughVideoStatus = nextVideoUrl ? "video_ready" : "interactive_ready";

  const [partner] = await db
    .update(partnersTable)
    .set(updateData as any)
    .where(eq(partnersTable.id, id))
    .returning();

  sendValidated(req, res, UpdatePartnerResponse, partner, "Update partner walkthrough");
});

// Test the customer-confirmation email template using a sample order shape.
// Uses the most recent order for the partner if available, otherwise renders a
// stub. Sends to the address provided in the body (admin-supplied).
router.post("/partners/:id/test-confirmation-email", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const to = (req.body?.to || "").trim();
  const parsedTo = z.string().email().safeParse(to);
  if (!parsedTo.success) { res.status(400).json({ error: "A valid 'to' email is required" }); return; }
  try {
    const { sendOrderConfirmation } = await import("../lib/email");
    const ctx = await buildSampleOrderContext(id, parsedTo.data);
    if (!ctx) { res.status(404).json({ error: "Partner not found" }); return; }
    const result = await sendOrderConfirmation(ctx);
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/partners/:id/test-internal-forward", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const overrideTo = (req.body?.to || "").trim() || null;
  if (overrideTo) {
    const parsedTo = z.string().email().safeParse(overrideTo);
    if (!parsedTo.success) { res.status(400).json({ error: "If 'to' is provided it must be a valid email" }); return; }
  }
  try {
    const { sendOpsForward } = await import("../lib/email");
    const ctx = await buildSampleOrderContext(id, "demo.customer@example.com");
    if (!ctx) { res.status(404).json({ error: "Partner not found" }); return; }
    // When an override address is provided, force the test send to that
    // address — bypassing both legacy partner.internalForwardEmail and any
    // configured ops recipients (which would otherwise hit real inboxes).
    if (overrideTo) {
      ctx.partner = { ...ctx.partner, internalForwardEmail: overrideTo, ccEmail: null };
    }
    const result = await sendOpsForward(ctx, overrideTo ? [overrideTo] : undefined);
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export async function buildSampleOrderContext(partnerId: number, customerEmail: string) {
  const { buildOrderEmailContext } = await import("../lib/email");
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) return null;
  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId));
  // Try newest order — gives the most realistic preview.
  const recent = await db.select().from((await import("@workspace/db")).ordersTable)
    .where(eq((await import("@workspace/db")).ordersTable.partnerId, partnerId))
    .orderBy((await import("drizzle-orm")).desc((await import("@workspace/db")).ordersTable.createdAt)).limit(1);
  if (recent.length > 0) {
    const ctx = await buildOrderEmailContext(recent[0].id);
    if (ctx) {
      ctx.order = { ...ctx.order, contactEmail: customerEmail };
      return ctx;
    }
  }
  // Synthetic fallback context — no items in the DB, just a preview shape.
  const now = new Date();
  return {
    partner,
    theme: theme ?? null,
    order: {
      id: 0,
      orderNumber: "DEMO-" + now.getTime().toString(36).toUpperCase(),
      partnerId: partner.id,
      eventId: null,
      packageId: null,
      portalType: "ordering",
      shippingVenueId: null,
      shippingAddressJson: null,
      billingAddressJson: null,
      assignedSupplierId: null,
      fulfillmentMode: "ship",
      status: "new",
      paymentStatus: "not_charged",
      contactName: "Sample Customer",
      contactEmail: customerEmail,
      contactPhone: "+1 555 0100",
      companyName: "Sample Co.",
      notes: "This is a preview email. No real order was created.",
      artworkFilesJson: [],
      totalEstimate: "—",
      measurementSystem: partner.unitPreference || "imperial",
      createdAt: now,
      updatedAt: now,
    } as any,
    items: [
      { id: 0, orderId: 0, itemType: "product", productId: null, packageId: null, brandingZoneId: null, name: "Sample item — branded backdrop", quantity: 1, unitPrice: "0", notes: "Preview line item", sortOrder: 0 } as any,
    ],
    event: null,
    venue: null,
  };
}

router.post("/partners/:id/duplicate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!source) { res.status(404).json({ error: "Partner not found" }); return; }

  const { id: _id, createdAt: _ca, updatedAt: _ua, ...fields } = source;
  // Normalize the source slug so duplicating a legacy uppercase partner
  // produces a valid lowercase slug that matches our current rules.
  const safeSourceSlug = source.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "partner";
  const newSlug = `${safeSourceSlug}-copy-${Date.now().toString(36)}`;
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

  sendValidated(req, res, ListPartnerAssetsResponse, assets, "List partner assets");
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
