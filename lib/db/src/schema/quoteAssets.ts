import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quoteAssetsTable = pgTable("quote_assets", {
  id: serial("id").primaryKey(),
  attachableType: text("attachable_type").notNull(),
  attachableId: integer("attachable_id").notNull(),
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  version: text("version"),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  isApprovedStandard: boolean("is_approved_standard").notNull().default(false),
  internalOnly: boolean("internal_only").notNull().default(true),
  vendorVisible: boolean("vendor_visible").notNull().default(false),
  notes: text("notes"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteAssetSchema = createInsertSchema(quoteAssetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuoteAsset = z.infer<typeof insertQuoteAssetSchema>;
export type QuoteAsset = typeof quoteAssetsTable.$inferSelect;
