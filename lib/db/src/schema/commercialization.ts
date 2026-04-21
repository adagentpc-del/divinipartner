import { pgTable, serial, text, boolean, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";

export const commercialPlansTable = pgTable("commercial_plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("starter"),
  pricingModel: text("pricing_model").notNull().default("flat_monthly"),
  priceAmount: numeric("price_amount", { precision: 12, scale: 2 }),
  setupFee: numeric("setup_fee", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  includedLimitsJson: jsonb("included_limits_json").$type<Record<string, number>>().default({}),
  featureFlagsJson: jsonb("feature_flags_json").$type<Record<string, boolean>>().default({}),
  addonPricingJson: jsonb("addon_pricing_json").$type<Array<{ key: string; label: string; price?: string; note?: string }>>().default([]),
  description: text("description"),
  prospectFacingDescription: text("prospect_facing_description"),
  internalMarginNotes: text("internal_margin_notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const brandingPackagesTable = pgTable("branding_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull().default("basic"), // basic | partial | full
  allowsCustomLogo: boolean("allows_custom_logo").notNull().default(true),
  allowsCustomColors: boolean("allows_custom_colors").notNull().default(true),
  allowsCustomDomain: boolean("allows_custom_domain").notNull().default(false),
  allowsCustomEmails: boolean("allows_custom_emails").notNull().default(false),
  allowsCustomInvoiceBranding: boolean("allows_custom_invoice_branding").notNull().default(false),
  hidesPoweredBy: boolean("hides_powered_by").notNull().default(false),
  defaultBrandingJson: jsonb("default_branding_json").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commercialAccountsTable = pgTable("commercial_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  accountType: text("account_type").notNull().default("managed"), // internal | managed | white_label | reseller | enterprise
  parentAccountId: integer("parent_account_id"),
  planId: integer("plan_id"),
  brandingPackageId: integer("branding_package_id"),
  whiteLabelLevel: text("white_label_level").notNull().default("none"), // none | partial | full
  brandingJson: jsonb("branding_json").$type<{
    logoUrl?: string; brandName?: string; portalTitle?: string; primaryColor?: string; accentColor?: string;
    typography?: string; faviconUrl?: string; introCopy?: string; helpCopy?: string; emailFromName?: string;
    invoiceFooter?: string; hidePoweredBy?: boolean;
  }>().default({}),
  commercialStatus: text("commercial_status").notNull().default("trial"), // trial | active | paused | suspended | internal | beta
  startDate: timestamp("start_date", { withTimezone: true }),
  renewalDate: timestamp("renewal_date", { withTimezone: true }),
  contractTerm: text("contract_term"), // monthly | annual | multi_year | custom
  seatAllowance: integer("seat_allowance"),
  portalInstanceAllowance: integer("portal_instance_allowance"),
  billingEntityName: text("billing_entity_name"),
  billingContactName: text("billing_contact_name"),
  billingContactEmail: text("billing_contact_email"),
  accountManager: text("account_manager"),
  internalRevenueOwner: text("internal_revenue_owner"),
  monetizationNotes: text("monetization_notes"),
  activationStatus: text("activation_status").notNull().default("lead"), // lead | proposal_prepared | in_review | approved | activating | active | paused | suspended
  demoReady: boolean("demo_ready").notNull().default(false),
  // Measurement preference (imperial | metric). null = imperial default.
  unitPreference: text("unit_preference"),
  salesNotes: text("sales_notes"),
  lastDemoAt: timestamp("last_demo_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const accountSubscriptionsTable = pgTable("account_subscriptions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  planId: integer("plan_id").notNull(),
  status: text("status").notNull().default("active"), // active | trialing | paused | cancelled
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  renewalDate: timestamp("renewal_date", { withTimezone: true }),
  billingContact: text("billing_contact"),
  contractNotes: text("contract_notes"),
  invoiceStatus: text("invoice_status").notNull().default("not_billed"), // not_billed | sent | paid | overdue
  lastInvoicedAt: timestamp("last_invoiced_at", { withTimezone: true }),
  nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountUsageLimitsTable = pgTable("account_usage_limits", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  limitKey: text("limit_key").notNull(), // partners | users | events | suppliers | portals | automation_rules | exports
  allowance: integer("allowance"),
  currentUsage: integer("current_usage").notNull().default(0),
  hardLimit: boolean("hard_limit").notNull().default(false),
  warningThresholdPct: integer("warning_threshold_pct").notNull().default(80),
  lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  prospectName: text("prospect_name"),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft | in_review | sent | accepted | declined
  recommendedPlanId: integer("recommended_plan_id"),
  comparedPlanIds: jsonb("compared_plan_ids").$type<number[]>().default([]),
  packagingNotes: text("packaging_notes"),
  internalNotes: text("internal_notes"),
  prospectFacingNotes: text("prospect_facing_notes"),
  createdBy: text("created_by"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const activationChecklistItemsTable = pgTable("activation_checklist_items", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  itemKey: text("item_key").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("pending"), // pending | in_progress | done | skipped
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Proposal = typeof proposalsTable.$inferSelect;
export type ActivationChecklistItem = typeof activationChecklistItemsTable.$inferSelect;
export type CommercialPlan = typeof commercialPlansTable.$inferSelect;
export type CommercialAccount = typeof commercialAccountsTable.$inferSelect;
export type BrandingPackage = typeof brandingPackagesTable.$inferSelect;
export type AccountSubscription = typeof accountSubscriptionsTable.$inferSelect;
export type AccountUsageLimit = typeof accountUsageLimitsTable.$inferSelect;
