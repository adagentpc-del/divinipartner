import { pgTable, serial, text, boolean, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  secondaryLogoUrl: text("secondary_logo_url"),
  websiteUrl: text("website_url"),
  smallA3BadgeEnabled: boolean("small_a3_badge_enabled").notNull().default(true),
  introHeadline: text("intro_headline"),
  introText: text("intro_text"),
  thankYouText: text("thank_you_text"),
  capabilitiesLink: text("capabilities_link"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  routingEmail: text("routing_email"),
  venueAddress: text("venue_address"),
  industryFocus: text("industry_focus"),
  useCaseOptionsJson: jsonb("use_case_options_json").$type<string[]>(),
  globalSizzleReelUrl: text("global_sizzle_reel_url"),
  partnerVideoUrl: text("partner_video_url"),
  partnerDeckFileUrl: text("partner_deck_file_url"),
  siteSurveyDeckFileUrl: text("site_survey_deck_file_url"),
  pricingDisplayEnabled: boolean("pricing_display_enabled").notNull().default(false),
  portalMode: text("portal_mode").notNull().default("intake"),
  partnerType: text("partner_type"),
  defaultSupplierId: integer("default_supplier_id"),
  pricingMode: text("pricing_mode").notNull().default("hidden"),
  billingInfoJson: jsonb("billing_info_json").$type<{ contactName?: string; email?: string; phone?: string; address?: string; taxId?: string; paymentTerms?: string }>(),
  // Billing execution config
  defaultBillingExecModel: text("default_billing_exec_model").notNull().default("a3_collected"), // a3_collected | alyssa_entity_collected | manual_invoice | split_payout | external_payment_pending
  billingEntityName: text("billing_entity_name"),
  invoiceTemplate: text("invoice_template"),
  paymentTerms: text("payment_terms"), // e.g. net_30
  depositRequired: boolean("deposit_required").notNull().default(false),
  depositPct: numeric("deposit_pct", { precision: 5, scale: 2 }),
  allowPartialPayment: boolean("allow_partial_payment").notNull().default(true),
  allowOrderOverride: boolean("allow_order_override").notNull().default(true),
  defaultBillingNotes: text("default_billing_notes"),
  billingContactName: text("billing_contact_name"),
  billingContactEmail: text("billing_contact_email"),
  billingContactPhone: text("billing_contact_phone"),
  internalBillingOwnerUserId: text("internal_billing_owner_user_id"),
  billingActive: boolean("billing_active").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  // Launch & rollout
  launchStatus: text("launch_status").notNull().default("draft"), // draft | preview | internal_only | live | paused
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  launchOverrideNote: text("launch_override_note"),
  demoFlag: boolean("demo_flag").notNull().default(false),
  setupTemplate: text("setup_template"), // social_commerce | branding_partner | inventory_backed | zone_venue
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
