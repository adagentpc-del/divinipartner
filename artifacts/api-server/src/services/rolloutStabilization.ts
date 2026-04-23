// @ts-nocheck
import {
  db, commercialAccountsTable, partnersTable, ordersTable,
  packagesTable, suppliersTable, citiesTable, venuesTable, eventsTable,
  partnerThemesTable, partnerSectionsTable, partnerBrandingLocationsTable,
  activationChecklistItemsTable, demoFollowupsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export type Blocker = {
  key: string;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  why: string;
  link?: string;
  override?: boolean;
};

const SEVERITY_RANK: Record<Blocker["severity"], number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export async function computeAccountBlockers(accountId: number): Promise<{
  account: any;
  partners: any[];
  blockers: Blocker[];
  warnings: Blocker[];
  readinessScore: number;
  goLiveReady: boolean;
}> {
  const [account] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, accountId));
  if (!account) throw new Error("account not found");

  // Strict link only: partners must be explicitly attached via commercialAccountId.
  // The previous slug-based fallback produced false positives (e.g. "hilton-wl" matched any partner whose slug contained "hilton").
  const accountPartners = await db.select().from(partnersTable).where(eq(partnersTable.commercialAccountId, account.id));

  const blockers: Blocker[] = [];
  const warnings: Blocker[] = [];

  if (!account.billingEntityName || !account.billingContactEmail) {
    blockers.push({
      key: "billing_entity",
      label: "Billing entity not configured",
      severity: "critical",
      why: "Cannot issue first invoice or handle reconciliation without a billing entity + contact.",
      link: `/admin/commercial/accounts/${account.id}`,
    });
  }
  if (!account.planId) {
    blockers.push({
      key: "no_plan",
      label: "No commercial plan assigned",
      severity: "critical",
      why: "Plan determines limits and white-label rights. Required before activation.",
      link: `/admin/commercial/accounts/${account.id}`,
    });
  }
  if (!account.accountManager) {
    warnings.push({
      key: "no_account_manager",
      label: "No internal account manager assigned",
      severity: "medium",
      why: "Without an owner, follow-ups and rollout coordination tend to slip.",
      link: `/admin/commercial/accounts/${account.id}`,
    });
  }
  if (account.accountType === "white_label" || account.whiteLabelLevel !== "none") {
    const b = account.brandingJson || {};
    if (!b.logoUrl) {
      blockers.push({
        key: "wl_logo",
        label: "White-label logo missing",
        severity: "critical",
        why: "White-label portal cannot launch without partner logo.",
        link: `/admin/commercial/accounts/${account.id}`,
      });
    }
    if (!b.primaryColor) {
      warnings.push({
        key: "wl_palette",
        label: "Brand palette incomplete",
        severity: "medium",
        why: "Buyer-facing pages will fall back to A3 palette.",
        link: `/admin/commercial/accounts/${account.id}`,
      });
    }
  }

  // Activation checklist gating
  const checklist = await db.select().from(activationChecklistItemsTable).where(eq(activationChecklistItemsTable.accountId, account.id));
  if (checklist.length === 0) {
    warnings.push({
      key: "no_checklist",
      label: "Activation checklist not seeded",
      severity: "medium",
      why: "Seed the default checklist to track go-live readiness.",
      link: `/admin/sales/activation/${account.id}`,
    });
  } else {
    const pending = checklist.filter(c => c.status !== "done" && c.status !== "skipped");
    if (pending.length > 0 && account.activationStatus === "active") {
      warnings.push({
        key: "active_with_pending_checklist",
        label: `Account is active with ${pending.length} checklist item(s) still open`,
        severity: "medium",
        why: "Active accounts should have a clean checklist or items explicitly skipped.",
        link: `/admin/sales/activation/${account.id}`,
      });
    }
  }

  // Partner-side readiness
  for (const p of accountPartners) {
    if (!p.contactName || !p.contactEmail) {
      blockers.push({
        key: `p_${p.id}_contact`,
        label: `Partner ${p.name}: primary contact missing`,
        severity: "critical",
        why: "Order routing requires a primary contact.",
        link: `/admin/partners/${p.id}/edit`,
      });
    }
    if (!p.defaultBillingExecModel) {
      blockers.push({
        key: `p_${p.id}_billing_model`,
        label: `Partner ${p.name}: no billing model selected`,
        severity: "critical",
        why: "Determines who issues invoices for this partner.",
        link: `/admin/partners/${p.id}/edit`,
      });
    }
    if (!p.logoUrl) {
      warnings.push({
        key: `p_${p.id}_logo`,
        label: `Partner ${p.name}: logo missing`,
        severity: "medium",
        why: "Partner portal visuals will look unfinished without a logo.",
        link: `/admin/partners/${p.id}/edit`,
      });
    }
    const cities = await db.select().from(citiesTable).where(eq(citiesTable.partnerId, p.id));
    const venues = await db.select().from(venuesTable).where(eq(venuesTable.partnerId, p.id));
    const events = await db.select().from(eventsTable).where(eq(eventsTable.partnerId, p.id));
    const packages = await db.select().from(packagesTable).where(eq(packagesTable.partnerId, p.id));
    const orders = await db.select().from(ordersTable).where(eq(ordersTable.partnerId, p.id));
    if (cities.length === 0) blockers.push({
      key: `p_${p.id}_cities`, label: `Partner ${p.name}: no cities configured`, severity: "critical",
      why: "Cities anchor venues and inventory.", link: `/admin/cities`,
    });
    if (venues.length === 0) blockers.push({
      key: `p_${p.id}_venues`, label: `Partner ${p.name}: no venues configured`, severity: "critical",
      why: "Required for shipping and event creation.", link: `/admin/cities`,
    });
    if (events.length === 0) warnings.push({
      key: `p_${p.id}_events`, label: `Partner ${p.name}: no events created`, severity: "medium",
      why: "First event needs to exist to drive ordering.", link: `/admin/partners/${p.id}/events`,
    });
    if (packages.length === 0) warnings.push({
      key: `p_${p.id}_packages`, label: `Partner ${p.name}: no packages defined`, severity: "medium",
      why: "Packages drive ordering tiers.", link: `/admin/partners/${p.id}/packages`,
    });
    if (orders.length === 0) warnings.push({
      key: `p_${p.id}_first_order`, label: `Partner ${p.name}: no test order placed yet`, severity: "low",
      why: "Place a test order to verify the full path before go-live.", link: `/${p.slug}`,
    });
  }

  // Suppliers presence (platform-level gating)
  const suppliers = await db.select().from(suppliersTable);
  if (suppliers.length === 0) {
    blockers.push({
      key: "no_suppliers", label: "No suppliers configured globally", severity: "critical",
      why: "Supplier routing requires at least one supplier exists.", link: "/admin/suppliers",
    });
  }

  const totalChecks = blockers.length + warnings.length + (accountPartners.length * 5) + 4;
  const failed = blockers.length + warnings.length;
  const readinessScore = Math.max(0, Math.min(100, Math.round(((totalChecks - failed) / Math.max(1, totalChecks)) * 100)));

  return {
    account,
    partners: accountPartners,
    blockers,
    warnings,
    readinessScore,
    goLiveReady: blockers.length === 0,
  };
}

export async function getStabilizationDashboard() {
  const accounts = await db.select().from(commercialAccountsTable);
  const followups = await db.select().from(demoFollowupsTable).orderBy(desc(demoFollowupsTable.createdAt));

  const recentlyActivated = accounts.filter(a => a.activationStatus === "active");
  const inActivation = accounts.filter(a => a.activationStatus === "activating");
  const stalled = accounts.filter(
    a => ["proposal_prepared", "in_review", "approved"].includes(a.activationStatus),
  );
  const paused = accounts.filter(a => a.activationStatus === "paused" || a.activationStatus === "suspended");

  // Compute lightweight blocker counts per account (not full scan; just check critical fields)
  const flaggedAccounts: Array<{ id: number; name: string; activationStatus: string; reasons: string[] }> = [];
  for (const a of accounts) {
    const reasons: string[] = [];
    if (!a.planId) reasons.push("no plan");
    if (!a.billingContactEmail) reasons.push("no billing contact");
    if (a.accountType === "white_label" && !(a.brandingJson?.logoUrl)) reasons.push("missing white-label logo");
    if (a.activationStatus === "active") {
      const open = await db.select().from(activationChecklistItemsTable).where(eq(activationChecklistItemsTable.accountId, a.id));
      const pending = open.filter(c => c.status !== "done" && c.status !== "skipped").length;
      if (pending > 0) reasons.push(`${pending} checklist item(s) open`);
    }
    if (reasons.length > 0) flaggedAccounts.push({
      id: a.id, name: a.name, activationStatus: a.activationStatus, reasons,
    });
  }

  return {
    totals: {
      accounts: accounts.length,
      active: recentlyActivated.length,
      inActivation: inActivation.length,
      stalled: stalled.length,
      paused: paused.length,
      flagged: flaggedAccounts.length,
      openFollowups: followups.filter(f => !["closed_won", "closed_lost"].includes(f.status)).length,
    },
    inActivation,
    stalled,
    flaggedAccounts,
    recentFollowups: followups.slice(0, 8),
  };
}
