import { pgTable, serial, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnerOnboardingSubmissionsTable = pgTable("partner_onboarding_submissions", {
  id: serial("id").primaryKey(),

  // Company basics
  companyName: text("company_name").notNull(),
  websiteUrl: text("website_url"),
  industryFocus: text("industry_focus"),

  // Partner type & portal preference
  partnerType: text("partner_type"),
  portalMode: text("portal_mode"),
  hasTours: text("has_tours"),

  // Branding
  introHeadline: text("intro_headline"),
  introText: text("intro_text"),
  thankYouText: text("thank_you_text"),
  brandColors: text("brand_colors"),
  logoUrl: text("logo_url"),
  secondaryLogoUrl: text("secondary_logo_url"),
  brandAssetsJson: jsonb("brand_assets_json").$type<{ name: string; url: string }[]>(),

  // Contact
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  contactRole: text("contact_role"),

  // Billing
  billingContactName: text("billing_contact_name"),
  billingEmail: text("billing_email"),
  billingPhone: text("billing_phone"),
  billingAddress: text("billing_address"),
  taxId: text("tax_id"),
  paymentTerms: text("payment_terms"),
  billingNotes: text("billing_notes"),

  // Goals / freeform
  whatWeNeed: text("what_we_need"),
  timeline: text("timeline"),
  budgetRange: text("budget_range"),
  referenceUrls: text("reference_urls"),

  // Lifecycle
  status: text("status").notNull().default("new"),
  internalNotes: text("internal_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  convertedPartnerId: integer("converted_partner_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerOnboardingSubmissionSchema = createInsertSchema(partnerOnboardingSubmissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerOnboardingSubmission = z.infer<typeof insertPartnerOnboardingSubmissionSchema>;
export type PartnerOnboardingSubmission = typeof partnerOnboardingSubmissionsTable.$inferSelect;
