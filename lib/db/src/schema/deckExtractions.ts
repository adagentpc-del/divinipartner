import { pgTable, serial, text, integer, boolean, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const deckExtractionsTable = pgTable("deck_extractions", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  sourceFileUrl: text("source_file_url").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  status: text("status").notNull().default("processing"),
  totalPages: integer("total_pages"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const deckExtractionItemsTable = pgTable("deck_extraction_items", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id").notNull().references(() => deckExtractionsTable.id, { onDelete: "cascade" }),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  locationName: text("location_name").notNull(),
  category: text("category").notNull().default("Custom / Other"),
  description: text("description"),
  dimensionsText: text("dimensions_text"),
  sizeWidth: doublePrecision("size_width"),
  sizeHeight: doublePrecision("size_height"),
  sizeUnit: text("size_unit").default("inches"),
  sourcePageNumber: integer("source_page_number"),
  extractedTextSnippet: text("extracted_text_snippet"),
  confidenceScore: doublePrecision("confidence_score"),
  reviewStatus: text("review_status").notNull().default("pending"),
  isHidden: boolean("is_hidden").notNull().default(false),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeckExtractionSchema = createInsertSchema(deckExtractionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeckExtraction = z.infer<typeof insertDeckExtractionSchema>;
export type DeckExtraction = typeof deckExtractionsTable.$inferSelect;

export const insertDeckExtractionItemSchema = createInsertSchema(deckExtractionItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeckExtractionItem = z.infer<typeof insertDeckExtractionItemSchema>;
export type DeckExtractionItem = typeof deckExtractionItemsTable.$inferSelect;
