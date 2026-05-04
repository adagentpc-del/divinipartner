import { pgTable, serial, text, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const partnerThemesTable = pgTable("partner_themes", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }).unique(),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  accentColor: text("accent_color"),
  backgroundColor: text("background_color"),
  buttonColor: text("button_color"),
  textColor: text("text_color"),
  headingFont: text("heading_font"),
  bodyFont: text("body_font"),
  buttonStyle: text("button_style"),
  borderRadius: text("border_radius"),
  tonePreset: text("tone_preset"),
  themeNotes: text("theme_notes"),
  aiSuggestedJson: text("ai_suggested_json"),
  isApproved: text("is_approved").notNull().default("pending"),

  templateKey: text("template_key").notNull().default("clean_premium"),
  logoStorageKey: text("logo_storage_key"),
  logoUrl: text("logo_url"),
  logoAltText: text("logo_alt_text"),
  logoPlacement: text("logo_placement").notNull().default("navbar_left"),
  logoBackgroundTreatment: text("logo_background_treatment").notNull().default("none"),
  heroEyebrow: text("hero_eyebrow"),
  heroHeadline: text("hero_headline"),
  heroSubheadline: text("hero_subheadline"),
  heroBackgroundMode: text("hero_background_mode").notNull().default("gradient"),
  heroBackgroundStorageKey: text("hero_background_storage_key"),
  heroOverlayIntensity: real("hero_overlay_intensity").notNull().default(0.45),
  cardStyle: text("card_style").notNull().default("elevated"),
  borderRadiusStyle: text("border_radius_style").notNull().default("soft"),
  ctaLabel: text("cta_label"),
  secondaryCtaLabel: text("secondary_cta_label"),
  showPoweredByA3: boolean("show_powered_by_a3").notNull().default(true),
  customWelcomeMessage: text("custom_welcome_message"),
  isPublished: boolean("is_published").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerThemeSchema = createInsertSchema(partnerThemesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerTheme = z.infer<typeof insertPartnerThemeSchema>;
export type PartnerTheme = typeof partnerThemesTable.$inferSelect;
