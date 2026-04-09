import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
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
  headingFont: text("heading_font"),
  bodyFont: text("body_font"),
  buttonStyle: text("button_style"),
  borderRadius: text("border_radius"),
  tonePreset: text("tone_preset"),
  themeNotes: text("theme_notes"),
  aiSuggestedJson: text("ai_suggested_json"),
  isApproved: text("is_approved").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerThemeSchema = createInsertSchema(partnerThemesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerTheme = z.infer<typeof insertPartnerThemeSchema>;
export type PartnerTheme = typeof partnerThemesTable.$inferSelect;
