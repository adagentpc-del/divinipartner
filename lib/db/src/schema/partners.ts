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
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedReason: text("archived_reason"),
  // Launch & rollout
  launchStatus: text("launch_status").notNull().default("draft"), // draft | preview | internal_only | live | paused
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  launchOverrideNote: text("launch_override_note"),
  demoFlag: boolean("demo_flag").notNull().default(false),
  setupTemplate: text("setup_template"), // social_commerce | branding_partner | inventory_backed | zone_venue
  // Measurement system preference (imperial | metric). null = inherit (default imperial).
  unitPreference: text("unit_preference"),
  // Commercialization linkage (additive — partner can stand alone or roll up under a commercial account)
  commercialAccountId: integer("commercial_account_id"),
  // Partner-level email/communications config (April 2026 communications extension).
  // These power both the customer-facing order confirmation and the internal
  // operations forward. internalForwardEmail is what receives the operational
  // copy when an order is submitted; routingEmail above is older/legacy and
  // is used as a final fallback if internalForwardEmail is empty.
  emailFromName: text("email_from_name"),
  replyToEmail: text("reply_to_email"),
  emailSenderLabel: text("email_sender_label"),
  internalForwardEmail: text("internal_forward_email"),
  ccEmail: text("cc_email"),
  // Section 29 — partner-specific design contact used as the default routing
  // target for "artwork needed" requests. Optional; falls back to the partner's
  // primary contact when unset.
  designContactName: text("design_contact_name"),
  designContactEmail: text("design_contact_email"),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  // PDF attachment toggles (April 2026 attachments extension). When true, the
  // matching audience email gets the generated branded order summary attached.
  // Customer/finance/partner_contact default OFF so we don't surprise existing
  // partners; ops defaults ON because the operational summary is the primary
  // useful artifact for the inbox-driven fulfillment workflow.
  attachPdfCustomer: boolean("attach_pdf_customer").notNull().default(false),
  attachPdfOps: boolean("attach_pdf_ops").notNull().default(true),
  attachPdfFinance: boolean("attach_pdf_finance").notNull().default(false),
  attachPdfPartnerContact: boolean("attach_pdf_partner_contact").notNull().default(false),
  // Currency & tax defaults (April 2026 international billing extension).
  // Order/event/invoice records snapshot the resolved currency + tax mode at
  // creation time so historical records remain stable even if partner defaults
  // change later. taxRate is stored as a decimal % (e.g. 20.000 for 20% VAT).
  defaultCurrency: text("default_currency").notNull().default("USD"),
  defaultTaxMode: text("default_tax_mode").notNull().default("none"), // none | sales_tax | vat | gst | custom
  defaultTaxLabel: text("default_tax_label"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 5, scale: 3 }),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  billingCountry: text("billing_country"), // ISO-2 (e.g. US, GB, AE)
  invoiceDisplayNotes: text("invoice_display_notes"),
  // Internal A3 intake fields (April 2026 — internal ops email refresh).
  // These are surfaced on the structured operational order intake email
  // (sent to Alyssa/Shawn/A3 ops) and on the order detail Internal Intake
  // panel. NetSuite customer number is the ERP customer record A3 will
  // post the order against; program manager / internal account owner /
  // support contact are the human routing pointers Shawn uses to figure
  // out who to call when a question lands. All optional — when blank, the
  // email simply omits the row instead of showing a confusing "—".
  netsuiteCustomerNumber: text("netsuite_customer_number"),
  programManagerName: text("program_manager_name"),
  programManagerEmail: text("program_manager_email"),
  internalAccountOwnerName: text("internal_account_owner_name"),
  internalAccountOwnerEmail: text("internal_account_owner_email"),
  supportContactName: text("support_contact_name"),
  supportContactEmail: text("support_contact_email"),
  // Salesperson is the A3-side commercial owner for this partner. Defaults
  // to Alyssa DelTorre (adeltorre@a3visual.com) when blank — applied in the
  // intake builder, not at column level, so the default can move without a
  // migration. Phone is optional — populated when the partner needs SMS
  // routing in addition to email.
  salespersonName: text("salesperson_name"),
  salespersonEmail: text("salesperson_email"),
  salespersonPhone: text("salesperson_phone"),
  // Task #27: partner-configurable internal reply-to address used as the
  // Reply-To on the internal PM intake packet email so replies route to a
  // partner-side internal owner (not the customer). Falls back to the
  // default A3 salesperson when blank.
  internalReplyToEmail: text("internal_reply_to_email"),
  // Section 36: default add-on display format on this partner's portal.
  // Values: "flat" | "grid" | "category_tiles" (default "grid").
  addonDisplayFormat: text("addon_display_format").notNull().default("grid"),
  // When true, flat/grid views show category subheadings; when false they're
  // a single ungrouped list. category_tiles always groups.
  addonCategoryGroupingEnabled: boolean("addon_category_grouping_enabled").notNull().default(false),
  // Auto-generated branded portal walkthrough (demo video + walkthrough feature).
  // walkthroughEnabled: master toggle for the live "Watch Walkthrough" CTA.
  // walkthroughVideoUrl/PosterUrl: optional admin override — when a real video
  // is uploaded/pasted it takes priority over the interactive experience.
  // walkthroughVideoStatus: not_generated | interactive_ready | video_ready.
  // walkthroughScript: persisted deterministic script (slides) for admin parity;
  // the live portal regenerates fresh from current portal data on each view.
  walkthroughEnabled: boolean("walkthrough_enabled").notNull().default(true),
  walkthroughVideoUrl: text("walkthrough_video_url"),
  walkthroughVideoPosterUrl: text("walkthrough_video_poster_url"),
  walkthroughVideoStatus: text("walkthrough_video_status").notNull().default("interactive_ready"),
  walkthroughScript: jsonb("walkthrough_script"),
  walkthroughGeneratedAt: timestamp("walkthrough_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
