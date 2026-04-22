import { pgTable, serial, text, integer, boolean, doublePrecision, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { suppliersTable } from "./suppliers";

export const partnerBrandingLocationsTable = pgTable("partner_branding_locations", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  internalCode: text("internal_code"),
  category: text("category").notNull(),
  description: text("description"),
  sizeWidth: doublePrecision("size_width"),
  sizeHeight: doublePrecision("size_height"),
  sizeDepth: doublePrecision("size_depth"),
  sizeDiameter: doublePrecision("size_diameter"),
  sizeUnit: text("size_unit").default("inches"),
  sizeWidthMm: doublePrecision("size_width_mm"),
  sizeHeightMm: doublePrecision("size_height_mm"),
  sizeDepthMm: doublePrecision("size_depth_mm"),
  sizeDiameterMm: doublePrecision("size_diameter_mm"),
  // Artwork specs for the zone (distinct from finished install size).
  artworkUnit: text("artwork_unit"),
  artworkWidth: doublePrecision("artwork_width"),
  artworkHeight: doublePrecision("artwork_height"),
  artworkWidthMm: doublePrecision("artwork_width_mm"),
  artworkHeightMm: doublePrecision("artwork_height_mm"),
  bleed: doublePrecision("bleed"),
  bleedMm: doublePrecision("bleed_mm"),
  safeArea: doublePrecision("safe_area"),
  safeAreaMm: doublePrecision("safe_area_mm"),
  visibleWidth: doublePrecision("visible_width"),
  visibleHeight: doublePrecision("visible_height"),
  visibleWidthMm: doublePrecision("visible_width_mm"),
  visibleHeightMm: doublePrecision("visible_height_mm"),
  // Measurement-aware pricing model (April 2026 extension) — same shape as product_catalog.
  pricingModel: text("pricing_model").notNull().default("fixed"),
  unitRate: numeric("unit_rate", { precision: 12, scale: 4 }),
  pricingUnit: text("pricing_unit"),
  minBillableSize: doublePrecision("min_billable_size"),
  minCharge: numeric("min_charge", { precision: 12, scale: 2 }),
  allowsCustomSize: boolean("allows_custom_size").notNull().default(false),
  sourcePageNumber: integer("source_page_number"),
  sourceFileUrl: text("source_file_url"),
  previewImageUrl: text("preview_image_url"),
  confidenceScore: doublePrecision("confidence_score"),
  defaultSupplierId: integer("default_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  productionNotesInternal: text("production_notes_internal"),
  installNotesInternal: text("install_notes_internal"),
  templateFileUrl: text("template_file_url"),
  artworkGuidelines: text("artwork_guidelines"),
  reviewStatus: text("review_status").notNull().default("needs_review"),
  isActive: boolean("is_active").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerBrandingLocationSchema = createInsertSchema(partnerBrandingLocationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerBrandingLocation = z.infer<typeof insertPartnerBrandingLocationSchema>;
export type PartnerBrandingLocation = typeof partnerBrandingLocationsTable.$inferSelect;
