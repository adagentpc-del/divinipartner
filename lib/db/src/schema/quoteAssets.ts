import { pgTable, serial, text, integer, boolean, timestamp, date, jsonb, doublePrecision, numeric } from "drizzle-orm/pg-core";
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
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  isApprovedStandard: boolean("is_approved_standard").notNull().default(false),
  internalOnly: boolean("internal_only").notNull().default(true),
  vendorVisible: boolean("vendor_visible").notNull().default(false),
  // Source classification
  sourceType: text("source_type").notNull().default("quote"),
  processingStatus: text("processing_status").notNull().default("new"),
  confidenceFlag: text("confidence_flag"),
  // Enrichment / extracted intelligence
  extractedDisplayName: text("extracted_display_name"),
  extractedInternalName: text("extracted_internal_name"),
  extractedCategory: text("extracted_category"),
  customerFacingSummary: text("customer_facing_summary"),
  backendOpsSummary: text("backend_ops_summary"),
  dimensionsSummary: text("dimensions_summary"),
  // Measurement-aware pricing capture (April 2026 extension).
  pricingUnit: text("pricing_unit"),
  unitRate: numeric("unit_rate", { precision: 12, scale: 4 }),
  billableAreaSqm: doublePrecision("billable_area_sqm"),
  billableLinearM: doublePrecision("billable_linear_m"),
  minBillableSize: doublePrecision("min_billable_size"),
  sourceUnit: text("source_unit"),
  materialSummary: text("material_summary"),
  finishingSummary: text("finishing_summary"),
  attachmentSummary: text("attachment_summary"),
  hardwareSummary: text("hardware_summary"),
  leadTimeText: text("lead_time_text"),
  printFileRequirements: text("print_file_requirements"),
  installNotes: text("install_notes"),
  opsNotes: text("ops_notes"),
  // Review workflow
  reviewNotes: text("review_notes"),
  clarificationNeeded: text("clarification_needed"),
  missingDataFlagsJson: jsonb("missing_data_flags_json").$type<string[]>(),
  notes: text("notes"),
  uploadedBy: text("uploaded_by"),
  // Section 21: parsed billing signals (currency / VAT / international cues).
  // Populated by lib/billingSignals.ts on PDF upload. Always kept SEPARATE
  // from any approved/applied billing defaults — admin must explicitly approve
  // before these flow into partner/order/invoice records.
  fileHash: text("file_hash"),                              // sha256 of source file (dedup + cache key)
  extractedText: text("extracted_text"),                    // cached pdf-parse output, reused on rerun/UI
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
  parsedSource: text("parsed_source"),                      // 'rules' | 'ai' | 'none' | 'failed'
  parsedReviewStatus: text("parsed_review_status").default("pending"), // pending | approved | dismissed | edited
  parsedCurrency: text("parsed_currency"),                  // USD | EUR | GBP | AED | CAD | AUD | null
  parsedCurrencyConfidence: text("parsed_currency_confidence"), // high | low | ambiguous
  parsedTaxLabel: text("parsed_tax_label"),                 // VAT | Sales Tax | GST | …
  parsedTaxRate: numeric("parsed_tax_rate", { precision: 5, scale: 3 }),
  parsedTaxAmount: numeric("parsed_tax_amount", { precision: 12, scale: 2 }),
  parsedTaxInclusive: boolean("parsed_tax_inclusive"),       // null = unknown
  parsedSubtotalAmount: numeric("parsed_subtotal_amount", { precision: 12, scale: 2 }),
  parsedTotalAmount: numeric("parsed_total_amount", { precision: 12, scale: 2 }),
  parsedQuoteReference: text("parsed_quote_reference"),
  parsedSupplierName: text("parsed_supplier_name"),
  parsedPaymentTerms: text("parsed_payment_terms"),
  parsedDepositAmount: numeric("parsed_deposit_amount", { precision: 12, scale: 2 }),
  parsedBillingCountry: text("parsed_billing_country"),
  parsedIncoterm: text("parsed_incoterm"),
  parsedBillingNotes: text("parsed_billing_notes"),
  // Compact flag list shown in review UI: e.g.
  //  ['currency_detected','vat_detected','currency_ambiguous','tax_ambiguous',
  //   'overseas_cues_detected','total_without_subtotal','manual_review_needed'].
  parsedBillingFlagsJson: jsonb("parsed_billing_flags_json").$type<string[]>(),
  parsedMissingFieldsJson: jsonb("parsed_missing_fields_json").$type<string[]>(),
  parsedAiTokensInput: integer("parsed_ai_tokens_input"),
  parsedAiTokensOutput: integer("parsed_ai_tokens_output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteAssetSchema = createInsertSchema(quoteAssetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuoteAsset = z.infer<typeof insertQuoteAssetSchema>;
export type QuoteAsset = typeof quoteAssetsTable.$inferSelect;

// Many-to-many mappings (a single source can map to multiple products / packages / zones / suppliers)
export const quoteAssetMappingsTable = pgTable("quote_asset_mappings", {
  id: serial("id").primaryKey(),
  quoteAssetId: integer("quote_asset_id").notNull(),
  mappingType: text("mapping_type").notNull(), // product | package | branding_zone | supplier
  mappingId: integer("mapping_id").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type QuoteAssetMapping = typeof quoteAssetMappingsTable.$inferSelect;

// Standardized spec records per product
export const productSpecStandardsTable = pgTable("product_spec_standards", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  supplierId: integer("supplier_id"),
  brandingZoneId: integer("branding_zone_id"),
  packageId: integer("package_id"),
  title: text("title").notNull(),
  standardType: text("standard_type").notNull().default("preferred"), // preferred | alternate | legacy | zone_specific | package_specific
  isCurrent: boolean("is_current").notNull().default(false),
  isApproved: boolean("is_approved").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  dimensionsSummary: text("dimensions_summary"),
  materialSummary: text("material_summary"),
  finishingSummary: text("finishing_summary"),
  attachmentSummary: text("attachment_summary"),
  hardwareSummary: text("hardware_summary"),
  leadTimeDays: integer("lead_time_days"),
  printFileRequirements: text("print_file_requirements"),
  installNotes: text("install_notes"),
  internalOpsNotes: text("internal_ops_notes"),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  sourceQuoteAssetIdsJson: jsonb("source_quote_asset_ids_json").$type<number[]>(),
  reviewStatus: text("review_status").notNull().default("new"), // new | in_review | needs_clarification | approved | superseded | archived
  reviewNotes: text("review_notes"),
  missingDataFlagsJson: jsonb("missing_data_flags_json").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type ProductSpecStandard = typeof productSpecStandardsTable.$inferSelect;
