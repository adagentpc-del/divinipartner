import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
