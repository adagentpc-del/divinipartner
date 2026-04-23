import {
  db, commercialAccountsTable, commercialPlansTable,
  proposalsTable, activationChecklistItemsTable,
} from "@workspace/db";
import { eq, and, desc, asc, count, sql, inArray } from "drizzle-orm";
import { FEATURE_KEYS, LIMIT_KEYS, getEntitlements } from "./commercialization";

export const ACTIVATION_STATUSES = [
  "lead", "proposal_prepared", "in_review", "approved",
  "activating", "active", "paused", "suspended",
] as const;
export type ActivationStatus = typeof ACTIVATION_STATUSES[number];

const STATUS_ORDER: Record<ActivationStatus, number> = {
  lead: 0, proposal_prepared: 1, in_review: 2, approved: 3,
  activating: 4, active: 5, paused: 6, suspended: 7,
};

// Explicit allowed transitions per source status.
const ALLOWED_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  lead: ["proposal_prepared", "in_review"],
  proposal_prepared: ["in_review", "approved", "lead"],
  in_review: ["approved", "proposal_prepared"],
  approved: ["activating", "in_review"],
  activating: ["active", "approved", "paused", "suspended"],
  active: ["paused", "suspended"],
  paused: ["active", "activating", "suspended"],
  suspended: ["active", "activating", "paused"],
};

export const PROPOSAL_STATUSES = ["draft", "in_review", "sent", "accepted", "declined"] as const;

export const DEFAULT_CHECKLIST_TEMPLATE: Array<{ key: string; label: string }> = [
  { key: "contract_signed", label: "Commercial contract signed" },
  { key: "branding_assets_received", label: "Branding assets received (logo, palette, copy)" },
  { key: "primary_domain_configured", label: "Primary domain or subdomain configured" },
  { key: "admin_user_provisioned", label: "Primary admin user invited" },
  { key: "plan_applied", label: "Commercial plan + limits applied" },
  { key: "supplier_routing_configured", label: "Supplier routing & fulfillment defaults set" },
  { key: "billing_setup", label: "Billing entity & invoicing rules configured" },
  { key: "sample_data_loaded", label: "Sample data / starter catalog loaded" },
  { key: "demo_walkthrough_done", label: "Internal demo walkthrough completed" },
  { key: "go_live", label: "Account go-live & status flipped to active" },
];

export async function seedActivationChecklist(accountId: number): Promise<void> {
  const existing = await db.select({ key: activationChecklistItemsTable.itemKey })
    .from(activationChecklistItemsTable)
    .where(eq(activationChecklistItemsTable.accountId, accountId));
  const have = new Set(existing.map(e => e.key));
  const missing = DEFAULT_CHECKLIST_TEMPLATE
    .map((t, i) => ({ ...t, sortOrder: i }))
    .filter(t => !have.has(t.key));
  if (!missing.length) return;
  await db.insert(activationChecklistItemsTable).values(
    missing.map(m => ({
      accountId, itemKey: m.key, label: m.label, sortOrder: m.sortOrder, status: "pending",
    }))
  );
}

export async function getActivationProgress(accountId: number) {
  const items = await db.select().from(activationChecklistItemsTable)
    .where(eq(activationChecklistItemsTable.accountId, accountId))
    .orderBy(asc(activationChecklistItemsTable.sortOrder));
  const total = items.length;
  const done = items.filter(i => i.status === "done" || i.status === "skipped").length;
  const inProgress = items.filter(i => i.status === "in_progress").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { items, total, done, inProgress, pct };
}

export async function advanceActivationStatus(accountId: number, target: ActivationStatus): Promise<{ ok: true; account: any } | { ok: false; error: string }> {
  const [acc] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, accountId));
  if (!acc) return { ok: false, error: "account not found" };
  const current = (acc.activationStatus as ActivationStatus) ?? "lead";
  if (current === target) return { ok: true, account: acc };
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    return { ok: false, error: `Invalid transition: ${current} → ${target}. Allowed: ${allowed.join(", ") || "(none)"}` };
  }
  // Side effect: when moving to active, also set commercialStatus active
  const patch: any = { activationStatus: target };
  if (target === "active") patch.commercialStatus = "active";
  if (target === "paused") patch.commercialStatus = "paused";
  if (target === "suspended") patch.commercialStatus = "suspended";
  const [row] = await db.update(commercialAccountsTable).set(patch).where(eq(commercialAccountsTable.id, accountId)).returning();
  return { ok: true, account: row };
}

export async function buildPlanComparisonMatrix(planIds: number[]) {
  if (!planIds.length) return { plans: [], features: [], limits: [] };
  const plans = await db.select().from(commercialPlansTable).where(inArray(commercialPlansTable.id, planIds));
  const features = FEATURE_KEYS.map(key => ({
    key,
    cells: plans.map(p => ({
      planId: p.id,
      enabled: !!(p.featureFlagsJson as any)?.[key],
    })),
  }));
  const limits = LIMIT_KEYS.map(key => ({
    key,
    cells: plans.map(p => ({
      planId: p.id,
      allowance: (p.includedLimitsJson as any)?.[key] ?? null,
    })),
  }));
  return { plans, features, limits };
}

export async function getSalesPipelineSummary() {
  const accounts = await db.select().from(commercialAccountsTable);
  const proposals = await db.select().from(proposalsTable);
  const byActivation: Record<string, number> = {};
  for (const a of accounts) byActivation[a.activationStatus] = (byActivation[a.activationStatus] ?? 0) + 1;
  const byProposal: Record<string, number> = {};
  for (const p of proposals) byProposal[p.status] = (byProposal[p.status] ?? 0) + 1;
  const demoReady = accounts.filter(a => a.demoReady).length;
  const whiteLabelProspects = accounts.filter(a => a.whiteLabelLevel !== "none" && a.activationStatus !== "active").length;
  const enterpriseProspects = accounts.filter(a => a.accountType === "enterprise" && a.activationStatus !== "active").length;
  // Activation queue: not-yet-active accounts in pipeline
  const queue = accounts
    .filter(a => !["active", "suspended"].includes(a.activationStatus))
    .sort((a, b) => STATUS_ORDER[a.activationStatus as ActivationStatus] - STATUS_ORDER[b.activationStatus as ActivationStatus])
    .slice(0, 20);
  return {
    totals: {
      accounts: accounts.length,
      proposals: proposals.length,
      demoReady,
      whiteLabelProspects,
      enterpriseProspects,
      activeAccounts: accounts.filter(a => a.activationStatus === "active").length,
    },
    byActivation, byProposal,
    activationQueue: queue,
    recentProposals: proposals.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 10),
    demoReadyAccounts: accounts.filter(a => a.demoReady).slice(0, 10),
  };
}

export const SHOWCASE_PRESETS = [
  {
    key: "social_commerce",
    title: "Social Commerce Portal",
    description: "Branded ordering experience for venues hosting branded events",
    targetPath: "/social-commerce-festival",
    audience: "Investor demo · Brand prospect",
    brandingPreset: "vibrant",
  },
  {
    key: "white_label_full",
    title: "Hilton Full White-Label",
    description: "Complete brand takeover, no A3 'powered by' visible",
    targetPath: "/hilton",
    audience: "White-label sales call",
    brandingPreset: "hospitality",
  },
  {
    key: "enterprise_multi_loc",
    title: "Move Miami Multi-Location",
    description: "Enterprise account with multiple operational cities and venues",
    targetPath: "/move-miami",
    audience: "Enterprise buyer demo",
    brandingPreset: "premium",
  },
  {
    key: "vendor_workspace",
    title: "Vendor Fulfillment Workspace",
    description: "Supplier-facing operational view used by partners",
    targetPath: "/admin/vendor",
    audience: "Operational demo",
    brandingPreset: "operational",
  },
  {
    key: "admin_command_center",
    title: "Admin Command Center",
    description: "Full operational portal — best for showing depth, not for prospects",
    targetPath: "/admin",
    audience: "Internal stakeholder",
    brandingPreset: "internal",
  },
];

export function listShowcasePresets() {
  return SHOWCASE_PRESETS;
}
