import { pgTable, serial, text, boolean, timestamp, jsonb, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productCatalogTable = pgTable("product_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  sku: text("sku"),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  galleryImagesJson: jsonb("gallery_images_json").$type<string[]>(),
  visibleDimensions: text("visible_dimensions"),
  // Structured dimensions (kept alongside the freeform `visibleDimensions` text).
  sizeWidth: doublePrecision("size_width"),
  sizeHeight: doublePrecision("size_height"),
  sizeDepth: doublePrecision("size_depth"),
  sizeDiameter: doublePrecision("size_diameter"),
  sizeUnit: text("size_unit"), // in | ft | cm | m | mm
  sizeWidthMm: doublePrecision("size_width_mm"),
  sizeHeightMm: doublePrecision("size_height_mm"),
  sizeDepthMm: doublePrecision("size_depth_mm"),
  sizeDiameterMm: doublePrecision("size_diameter_mm"),
  // Artwork specs (separate from finished install size). All companion *_mm
  // columns are computed at write time via withMmColumns().
  artworkUnit: text("artwork_unit"), // in | ft | cm | m | mm; falls back to sizeUnit when null.
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
  backendProductionNotes: text("backend_production_notes"),
  hardwareIncluded: boolean("hardware_included").notNull().default(false),
  printOnlyAvailable: boolean("print_only_available").notNull().default(false),
  rentalEligible: boolean("rental_eligible").notNull().default(false),
  usePartnerInventoryEligible: boolean("use_partner_inventory_eligible").notNull().default(false),
  reusableHardwareCompatible: boolean("reusable_hardware_compatible").notNull().default(false),
  inventoryTracked: boolean("inventory_tracked").notNull().default(false),
  requiresAttachmentSelection: boolean("requires_attachment_selection").notNull().default(false),
  requiresMaterialSelection: boolean("requires_material_selection").notNull().default(false),
  attachmentMethod: text("attachment_method"),
  material: text("material"),
  finishing: text("finishing"),
  installNotes: text("install_notes"),
  internalOpsSummary: text("internal_ops_summary"),
  featureBadgesJson: jsonb("feature_badges_json").$type<string[]>(),
  supplierId: integer("supplier_id"),
  leadTimeDays: integer("lead_time_days"),
  isOrderable: boolean("is_orderable").notNull().default(true),
  allowsDesignRequest: boolean("allows_design_request").notNull().default(true),
  sizeOptionsJson: jsonb("size_options_json").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: text("sort_order"),
  customerFacingSummary: text("customer_facing_summary"),
  reviewStatus: text("review_status").notNull().default("approved"),
  missingDataFlagsJson: jsonb("missing_data_flags_json").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductCatalogSchema = createInsertSchema(productCatalogTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductCatalog = z.infer<typeof insertProductCatalogSchema>;
export type ProductCatalog = typeof productCatalogTable.$inferSelect;
