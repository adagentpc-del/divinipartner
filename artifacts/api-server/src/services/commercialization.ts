import {
  db, commercialAccountsTable, commercialPlansTable, brandingPackagesTable,
  accountSubscriptionsTable, accountUsageLimitsTable, partnersTable,
  eventsTable, suppliersTable, userRolesTable,
} from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";

export const FEATURE_KEYS = [
  "inventory", "analytics", "profitability_analytics", "automation",
  "quote_ingestion", "reconciliation", "billing_execution",
  "white_label", "exports", "bulk_imports", "custom_branding",
  "multi_location", "enterprise_hierarchy", "feedback_inbox",
  "post_launch_dashboard", "workflow_rules",
] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];

export const LIMIT_KEYS = ["partners", "users", "events", "suppliers", "portals", "automation_rules", "exports"] as const;
export type LimitKey = typeof LIMIT_KEYS[number];

export const DEFAULT_PLAN_PRESETS: Record<string, { features: Partial<Record<FeatureKey, boolean>>; limits: Partial<Record<LimitKey, number>> }> = {
  internal: { features: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])) as any, limits: {} },
  starter: {
    features: { inventory: false, analytics: true, profitability_analytics: false, automation: false, quote_ingestion: false, reconciliation: false, billing_execution: true, white_label: false, exports: true, bulk_imports: false, custom_branding: true, multi_location: false, enterprise_hierarchy: false, feedback_inbox: true, post_launch_dashboard: true, workflow_rules: false },
    limits: { partners: 3, users: 5, events: 25, suppliers: 5, portals: 1 },
  },
  pro: {
    features: { inventory: true, analytics: true, profitability_analytics: true, automation: true, quote_ingestion: true, reconciliation: true, billing_execution: true, white_label: false, exports: true, bulk_imports: true, custom_branding: true, multi_location: true, enterprise_hierarchy: false, feedback_inbox: true, post_launch_dashboard: true, workflow_rules: true },
    limits: { partners: 25, users: 50, events: 500, suppliers: 50, portals: 5 },
  },
  enterprise: {
    features: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])) as any,
    limits: { partners: 250, users: 500, events: 5000, suppliers: 500, portals: 25 },
  },
  white_label_premium: {
    features: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])) as any,
    limits: { partners: 100, users: 250, events: 2500, suppliers: 250, portals: 50 },
  },
};

export async function getPlan(planId: number | null) {
  if (!planId) return null;
  const [p] = await db.select().from(commercialPlansTable).where(eq(commercialPlansTable.id, planId));
  return p ?? null;
}

type EffectivePlan = {
  account: typeof commercialAccountsTable.$inferSelect;
  plan: Awaited<ReturnType<typeof getPlan>>;
};

export async function getEffectivePlan(
  accountId: number,
  _visited: Set<number> = new Set(),
): Promise<EffectivePlan | null> {
  if (_visited.has(accountId)) return null; // cycle guard
  _visited.add(accountId);
  const [acc] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, accountId));
  if (!acc) return null;
  let plan = await getPlan(acc.planId);
  if (!plan && acc.parentAccountId && acc.parentAccountId !== accountId) {
    plan = await getEffectivePlan(acc.parentAccountId, _visited).then((r: EffectivePlan | null) => r?.plan ?? null);
  }
  return { account: acc, plan };
}

export async function wouldCreateCycle(accountId: number, proposedParentId: number | null | undefined): Promise<boolean> {
  if (!proposedParentId) return false;
  if (proposedParentId === accountId) return true;
  const visited = new Set<number>();
  let cur: number | null | undefined = proposedParentId;
  while (cur) {
    if (cur === accountId) return true;
    if (visited.has(cur)) return true;
    visited.add(cur);
    const [p] = await db.select({ parentAccountId: commercialAccountsTable.parentAccountId }).from(commercialAccountsTable).where(eq(commercialAccountsTable.id, cur));
    cur = p?.parentAccountId ?? null;
  }
  return false;
}

export async function getEntitlements(accountId: number): Promise<Record<FeatureKey, boolean>> {
  const eff = await getEffectivePlan(accountId);
  const flags: Record<string, boolean> = {};
  for (const k of FEATURE_KEYS) flags[k] = false;
  if (eff?.plan?.featureFlagsJson) Object.assign(flags, eff.plan.featureFlagsJson);
  // Internal accounts always get everything
  if (eff?.account.accountType === "internal" || eff?.account.commercialStatus === "internal") {
    for (const k of FEATURE_KEYS) flags[k] = true;
  }
  return flags as Record<FeatureKey, boolean>;
}

export async function checkFeature(accountId: number, feature: FeatureKey): Promise<boolean> {
  const ent = await getEntitlements(accountId);
  return !!ent[feature];
}

export async function recomputeUsage(accountId: number) {
  // partners under this account
  const partnerRows = await db.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.commercialAccountId, accountId));
  const partnerIds = partnerRows.map(p => p.id);

  const counts: Record<string, number> = {
    partners: partnerIds.length,
    users: 0, events: 0, suppliers: 0, portals: partnerIds.length,
  };

  if (partnerIds.length > 0) {
    const [evt] = await db.select({ c: count() }).from(eventsTable).where(inArray(eventsTable.partnerId, partnerIds));
    counts.events = Number(evt?.c ?? 0);
    // Suppliers scoped via partners.defaultSupplierId
    const partners = await db.select({ defaultSupplierId: partnersTable.defaultSupplierId }).from(partnersTable).where(inArray(partnersTable.id, partnerIds));
    const supplierIds = new Set(partners.map(p => p.defaultSupplierId).filter((x): x is number => !!x));
    counts.suppliers = supplierIds.size;
    // Users scoped via userRoles.partnerId
    const [usr] = await db.select({ c: count() }).from(userRolesTable).where(inArray(userRolesTable.partnerId, partnerIds));
    counts.users = Number(usr?.c ?? 0);
  }

  const eff = await getEffectivePlan(accountId);
  const allowances = (eff?.plan?.includedLimitsJson ?? {}) as Record<string, number>;

  // Upsert each limit
  const existing = await db.select().from(accountUsageLimitsTable).where(eq(accountUsageLimitsTable.accountId, accountId));
  const byKey = new Map(existing.map(r => [r.limitKey, r]));

  for (const key of LIMIT_KEYS) {
    const usage = counts[key] ?? 0;
    const allowance = allowances[key] ?? null;
    const row = byKey.get(key);
    if (row) {
      await db.update(accountUsageLimitsTable)
        .set({ currentUsage: usage, allowance, lastComputedAt: new Date() })
        .where(eq(accountUsageLimitsTable.id, row.id));
    } else {
      await db.insert(accountUsageLimitsTable).values({ accountId, limitKey: key, currentUsage: usage, allowance, hardLimit: false });
    }
  }
  return await db.select().from(accountUsageLimitsTable).where(eq(accountUsageLimitsTable.accountId, accountId));
}

export async function getAccountWithDetail(accountId: number) {
  const [account] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, accountId));
  if (!account) return null;
  const plan = await getPlan(account.planId);
  const branding = account.brandingPackageId
    ? (await db.select().from(brandingPackagesTable).where(eq(brandingPackagesTable.id, account.brandingPackageId)))[0]
    : null;
  const entitlements = await getEntitlements(accountId);
  const usage = await db.select().from(accountUsageLimitsTable).where(eq(accountUsageLimitsTable.accountId, accountId));
  const children = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.parentAccountId, accountId));
  const subscriptions = await db.select().from(accountSubscriptionsTable).where(eq(accountSubscriptionsTable.accountId, accountId));
  const partners = await db.select().from(partnersTable).where(eq(partnersTable.commercialAccountId, accountId));
  return { account, plan, brandingPackage: branding, entitlements, usage, children, subscriptions, partners };
}

export async function listAccountsWithRollup() {
  const accounts = await db.select().from(commercialAccountsTable).orderBy(commercialAccountsTable.name);
  const plans = await db.select().from(commercialPlansTable);
  const planMap = new Map(plans.map(p => [p.id, p]));
  // partner counts
  const partnerCounts = await db.select({ accountId: partnersTable.commercialAccountId, c: count() })
    .from(partnersTable).groupBy(partnersTable.commercialAccountId);
  const pcMap = new Map(partnerCounts.map(r => [r.accountId, Number(r.c)]));
  return accounts.map(a => ({
    ...a,
    plan: a.planId ? planMap.get(a.planId) ?? null : null,
    partnerCount: pcMap.get(a.id) ?? 0,
  }));
}

export async function getDashboardSummary() {
  const accounts = await listAccountsWithRollup();
  const planMix: Record<string, number> = {};
  const statusMix: Record<string, number> = {};
  const typeMix: Record<string, number> = {};
  let nearLimit = 0;
  let trialing = 0;
  let active = 0;
  let paused = 0;
  let whiteLabel = 0;
  for (const a of accounts) {
    const planTier = a.plan?.tier ?? "unassigned";
    planMix[planTier] = (planMix[planTier] || 0) + 1;
    statusMix[a.commercialStatus] = (statusMix[a.commercialStatus] || 0) + 1;
    typeMix[a.accountType] = (typeMix[a.accountType] || 0) + 1;
    if (a.commercialStatus === "trial") trialing++;
    if (a.commercialStatus === "active") active++;
    if (a.commercialStatus === "paused" || a.commercialStatus === "suspended") paused++;
    if (a.whiteLabelLevel !== "none") whiteLabel++;
  }
  // near limit accounts (any usage row >= warningPct)
  const usageRows = await db.select().from(accountUsageLimitsTable);
  const nearAccounts = new Set<number>();
  for (const u of usageRows) {
    if (u.allowance && u.currentUsage >= Math.floor(u.allowance * (u.warningThresholdPct / 100))) {
      nearAccounts.add(u.accountId);
    }
  }
  nearLimit = nearAccounts.size;

  return {
    totals: { accounts: accounts.length, active, trialing, paused, whiteLabel, nearLimit },
    planMix, statusMix, typeMix,
    accounts,
  };
}
