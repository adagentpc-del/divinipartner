import { pgTable, serial, text, integer, boolean, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const deckExtractionsTable = pgTable("deck_extractions", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  sourceFileUrl: text("source_file_url").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  // Status (Section 20): uploaded | text_extracted | chunked | awaiting_ai | parsed
  //                    | duplicate_reused | parse_failed | archived
  status: text("status").notNull().default("processing"),
  totalPages: integer("total_pages"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  // Cost-reduction fields (Section 20 — PDF AI cost audit)
  fileHash: text("file_hash"),                       // sha256 hex of file bytes (dedup key)
  fileSize: integer("file_size"),                    // bytes
  extractedText: text("extracted_text"),             // cached pdf-parse output (avoid re-parse)
  relevantChunks: jsonb("relevant_chunks"),          // [{page, text, reason}] sent to AI
  chunkCount: integer("chunk_count"),                // # chunks sent
  parseSource: text("parse_source"),                 // "ai" | "rules" | "reused_dedup"
  dedupedFromId: integer("deduped_from_id"),         // self-ref to a prior parsed extraction
  aiTokensInput: integer("ai_tokens_input"),         // from openai usage.prompt_tokens
  aiTokensOutput: integer("ai_tokens_output"),       // from openai usage.completion_tokens
  aiModel: text("ai_model"),
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

// Section 20: durable in-flight claim. Only one parse can hold a claim per
// (partner_id, file_hash); concurrent uploads of the same file see an existing
// claim and wait/dedup instead of double-billing AI.
export const deckExtractionClaimsTable = pgTable("deck_extraction_claims", {
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  fileHash: text("file_hash").notNull(),
  extractionId: integer("extraction_id").notNull().references(() => deckExtractionsTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: { name: "deck_extraction_claims_pkey", columns: [t.partnerId, t.fileHash] } as any }));

export const insertDeckExtractionSchema = createInsertSchema(deckExtractionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeckExtraction = z.infer<typeof insertDeckExtractionSchema>;
export type DeckExtraction = typeof deckExtractionsTable.$inferSelect;

export const insertDeckExtractionItemSchema = createInsertSchema(deckExtractionItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeckExtractionItem = z.infer<typeof insertDeckExtractionItemSchema>;
export type DeckExtractionItem = typeof deckExtractionItemsTable.$inferSelect;
