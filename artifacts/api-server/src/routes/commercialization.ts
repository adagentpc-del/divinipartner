import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import {
  db, commercialAccountsTable, commercialPlansTable, brandingPackagesTable,
  accountSubscriptionsTable, accountUsageLimitsTable, partnersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  FEATURE_KEYS, LIMIT_KEYS, DEFAULT_PLAN_PRESETS,
  getEntitlements, recomputeUsage, getAccountWithDetail,
  listAccountsWithRollup, getDashboardSummary, wouldCreateCycle,
} from "../services/commercialization";
import {
  ListCommercialPlansResponse,
  UpdateCommercialPlanResponse,
  SeedCommercialPlansResponse,
  ListCommercialBrandingPackagesResponse,
  UpdateCommercialBrandingPackageResponse,
  ListCommercialAccountsResponse,
  GetCommercialAccountResponse,
  UpdateCommercialAccountResponse,
  RecomputeCommercialAccountUsageResponse,
  LinkCommercialAccountPartnersResponse,
  GetCommercialAccountEntitlementsResponse,
  GetCommercialPartnerEntitlementsResponse,
  GetCommercialDashboardResponse,
  GetCommercialFeatureKeysResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const PriceAmount = z.union([
  z.number(),
  z.string().regex(/^-?\d+(\.\d+)?$/, "priceAmount must be a numeric string"),
]).nullable().optional();

const router = Router();

// ===== Plans =====
router.get("/commercial/plans", async (req, res) => {
  const rows = await db.select().from(commercialPlansTable).orderBy(commercialPlansTable.tier);
  sendValidated(req, res, ListCommercialPlansResponse, rows, "List commercial plans");
});

const PlanBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  tier: z.string().default("starter"),
  pricingModel: z.string().default("flat_monthly"),
  priceAmount: PriceAmount,
  currency: z.string().default("USD"),
  includedLimitsJson: z.record(z.string(), z.number()).optional(),
  featureFlagsJson: z.record(z.string(), z.boolean()).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.post("/commercial/plans", async (req, res) => {
  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data: any = { ...parsed.data };
  if (data.priceAmount != null) data.priceAmount = String(data.priceAmount);
  const [row] = await db.insert(commercialPlansTable).values(data).returning();
  res.status(201).json(row);
});

router.patch("/commercial/plans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const parsed = PlanBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data: any = { ...parsed.data };
  if (data.priceAmount != null) data.priceAmount = String(data.priceAmount);
  const [row] = await db.update(commercialPlansTable).set(data).where(eq(commercialPlansTable.id, id)).returning();
  sendValidated(req, res, UpdateCommercialPlanResponse, row, "Update commercial plan");
});

router.post("/commercial/plans/seed-defaults", async (req, res) => {
  const created: any[] = [];
  for (const [code, preset] of Object.entries(DEFAULT_PLAN_PRESETS)) {
    const existing = await db.select().from(commercialPlansTable).where(eq(commercialPlansTable.code, code));
    if (existing.length) continue;
    const [row] = await db.insert(commercialPlansTable).values({
      code, name: code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      tier: code, pricingModel: code === "internal" ? "custom" : "flat_monthly",
      priceAmount: code === "internal" ? null : code === "starter" ? "299" : code === "pro" ? "899" : code === "enterprise" ? "2499" : "3999",
      includedLimitsJson: preset.limits as any, featureFlagsJson: preset.features as any,
    }).returning();
    created.push(row);
  }
  sendValidated(req, res, SeedCommercialPlansResponse, { created }, "Seed commercial plans");
});

// ===== Branding packages =====
router.get("/commercial/branding-packages", async (req, res) => {
  const rows = await db.select().from(brandingPackagesTable).orderBy(brandingPackagesTable.level);
  sendValidated(req, res, ListCommercialBrandingPackagesResponse, rows, "List branding packages");
});

const BrandingBody = z.object({
  name: z.string().min(1),
  level: z.string().default("basic"),
  allowsCustomLogo: z.boolean().optional(),
  allowsCustomColors: z.boolean().optional(),
  allowsCustomDomain: z.boolean().optional(),
  allowsCustomEmails: z.boolean().optional(),
  allowsCustomInvoiceBranding: z.boolean().optional(),
  hidesPoweredBy: z.boolean().optional(),
  defaultBrandingJson: z.record(z.string(), z.any()).optional(),
});

router.post("/commercial/branding-packages", async (req, res) => {
  const parsed = BrandingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(brandingPackagesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/commercial/branding-packages/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = BrandingBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(brandingPackagesTable).set(parsed.data).where(eq(brandingPackagesTable.id, id)).returning();
  sendValidated(req, res, UpdateCommercialBrandingPackageResponse, row, "Update branding package");
});

// ===== Accounts =====
router.get("/commercial/accounts", async (req, res) => {
  sendValidated(req, res, ListCommercialAccountsResponse, await listAccountsWithRollup(), "List commercial accounts");
});

router.get("/commercial/accounts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const detail = await getAccountWithDetail(id);
  if (!detail) { res.status(404).json({ error: "not found" }); return; }
  sendValidated(req, res, GetCommercialAccountResponse, detail, "Get commercial account");
});

const AccountBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  accountType: z.string().default("managed"),
  parentAccountId: z.number().nullable().optional(),
  planId: z.number().nullable().optional(),
  brandingPackageId: z.number().nullable().optional(),
  whiteLabelLevel: z.string().default("none"),
  brandingJson: z.record(z.string(), z.any()).optional(),
  commercialStatus: z.string().default("trial"),
  startDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  contractTerm: z.string().nullable().optional(),
  seatAllowance: z.number().nullable().optional(),
  portalInstanceAllowance: z.number().nullable().optional(),
  billingEntityName: z.string().nullable().optional(),
  billingContactName: z.string().nullable().optional(),
  billingContactEmail: z.string().nullable().optional(),
  accountManager: z.string().nullable().optional(),
  internalRevenueOwner: z.string().nullable().optional(),
  monetizationNotes: z.string().nullable().optional(),
  activationStatus: z.string().optional(),
  demoReady: z.boolean().optional(),
  salesNotes: z.string().nullable().optional(),
  lastDemoAt: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  unitPreference: z.enum(["imperial", "metric"]).nullable().optional(),
});

function coerceDates(d: any) {
  for (const k of ["startDate", "renewalDate", "lastDemoAt"] as const) {
    if (d[k]) d[k] = new Date(d[k]);
  }
  return d;
}

router.post("/commercial/accounts", async (req, res) => {
  const parsed = AccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(commercialAccountsTable).values(coerceDates({ ...parsed.data })).returning();
  await recomputeUsage(row.id).catch(() => {});
  res.status(201).json(row);
});

router.patch("/commercial/accounts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const parsed = AccountBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.parentAccountId !== undefined && await wouldCreateCycle(id, parsed.data.parentAccountId ?? null)) {
    res.status(400).json({ error: "Parent assignment would create an account hierarchy cycle." }); return;
  }
  const [row] = await db.update(commercialAccountsTable).set(coerceDates({ ...parsed.data })).where(eq(commercialAccountsTable.id, id)).returning();
  await recomputeUsage(id).catch(() => {});
  sendValidated(req, res, UpdateCommercialAccountResponse, row, "Update commercial account");
});

router.delete("/commercial/accounts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(commercialAccountsTable).where(eq(commercialAccountsTable.id, id));
  res.status(204).end();
});

router.post("/commercial/accounts/:id/recompute-usage", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  sendValidated(req, res, RecomputeCommercialAccountUsageResponse, await recomputeUsage(id), "Recompute commercial account usage");
});

router.post("/commercial/accounts/:id/link-partners", async (req, res) => {
  const id = parseInt(req.params.id);
  const Body = z.object({ partnerIds: z.array(z.number()) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  for (const pid of parsed.data.partnerIds) {
    await db.update(partnersTable).set({ commercialAccountId: id }).where(eq(partnersTable.id, pid));
  }
  await recomputeUsage(id).catch(() => {});
  sendValidated(req, res, LinkCommercialAccountPartnersResponse, { ok: true, linked: parsed.data.partnerIds.length }, "Link commercial account partners");
});

// ===== Entitlements =====
router.get("/commercial/entitlements/account/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  sendValidated(req, res, GetCommercialAccountEntitlementsResponse, { entitlements: await getEntitlements(id), featureKeys: FEATURE_KEYS }, "Get commercial account entitlements");
});

router.get("/commercial/entitlements/partner/:id", async (req, res) => {
  const pid = parseInt(req.params.id);
  if (isNaN(pid)) { res.status(400).json({ error: "bad id" }); return; }
  const [p] = await db.select().from(partnersTable).where(eq(partnersTable.id, pid));
  if (!p) { res.status(404).json({ error: "not found" }); return; }
  if (!p.commercialAccountId) {
    sendValidated(req, res, GetCommercialPartnerEntitlementsResponse, { entitlements: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])), reason: "no_account_full_access" }, "Get commercial partner entitlements");
    return;
  }
  sendValidated(req, res, GetCommercialPartnerEntitlementsResponse, { entitlements: await getEntitlements(p.commercialAccountId), accountId: p.commercialAccountId }, "Get commercial partner entitlements");
});

// ===== Dashboard =====
router.get("/commercial/dashboard", async (req, res) => {
  sendValidated(req, res, GetCommercialDashboardResponse, await getDashboardSummary(), "Get commercial dashboard");
});

router.get("/commercial/feature-keys", (req, res) => {
  sendValidated(req, res, GetCommercialFeatureKeysResponse, { features: FEATURE_KEYS, limits: LIMIT_KEYS }, "Get commercial feature keys");
});

export default router;
