import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

/**
 * Section 25 ext#3 — PDF package intake.
 *
 * `package_extractions` is the staging table for client vendor-package PDFs.
 * Mirrors the proven `deck_extractions` lifecycle (claim/heartbeat/dedup/AI
 * cost tracking) but stores its parse output as a `parsedRows` JSONB array
 * instead of zone-shaped item rows. Rows here are reviewed/edited in the
 * admin UI and then committed through the existing `commitPackages` path.
 */
export const packageExtractionsTable = pgTable("package_extractions", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  sourceFileUrl: text("source_file_url").notNull(),    // object-storage path (e.g. /objects/uploads/uuid)
  sourceFileName: text("source_file_name").notNull(),
  // Status: processing | uploaded | text_extracted | chunked | awaiting_ai
  //       | parsed | needs_review | duplicate_reused | parse_failed | imported | archived
  status: text("status").notNull().default("processing"),
  totalPages: integer("total_pages"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  // Cost-reduction (mirrors deck_extractions)
  fileHash: text("file_hash"),                          // sha256 hex (dedup key)
  fileSize: integer("file_size"),
  extractedText: text("extracted_text"),                // cached pdf-parse output
  parseSource: text("parse_source"),                    // ai | rules | reused_dedup
  dedupedFromId: integer("deduped_from_id"),            // self-ref to a prior parsed extraction
  aiTokensInput: integer("ai_tokens_input"),
  aiTokensOutput: integer("ai_tokens_output"),
  aiModel: text("ai_model"),
  // Staged output: array of row objects matching PACKAGE_FIELDS keys.
  // Internal-only fields are prefixed with _ (e.g. _confidence, _sourcePage,
  // _groupKey, _warnings) and stripped before the commit call.
  parsedRows: jsonb("parsed_rows").$type<Array<Record<string, unknown>>>(),
  // Global warnings across the whole document (e.g. partner-name mismatch).
  parseWarnings: jsonb("parse_warnings").$type<Array<{ severity: string; code: string; message: string }>>(),
  // Result snapshot from the most recent commit (created/updated/skipped/failed counts + errors).
  commitResult: jsonb("commit_result"),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Concurrency claim: only one parse can hold the (partner_id, file_hash) lock
// at a time. Atomic INSERT ... ON CONFLICT DO NOTHING tells us who won.
// Separate from `deck_extraction_claims` so a packages-parse and a zones-parse
// of the same PDF can run in parallel without blocking each other.
export const packageExtractionClaimsTable = pgTable("package_extraction_claims", {
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  fileHash: text("file_hash").notNull(),
  extractionId: integer("extraction_id").notNull().references(() => packageExtractionsTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: { name: "package_extraction_claims_pkey", columns: [t.partnerId, t.fileHash] } as any }));

export const insertPackageExtractionSchema = createInsertSchema(packageExtractionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPackageExtraction = z.infer<typeof insertPackageExtractionSchema>;
export type PackageExtraction = typeof packageExtractionsTable.$inferSelect;
