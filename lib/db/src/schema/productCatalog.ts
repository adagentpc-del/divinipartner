import { pgTable, serial, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
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
  backendProductionNotes: text("backend_production_notes"),
  hardwareIncluded: boolean("hardware_included").notNull().default(false),
  printOnlyAvailable: boolean("print_only_available").notNull().default(false),
  rentalEligible: boolean("rental_eligible").notNull().default(false),
  attachmentMethod: text("attachment_method"),
  material: text("material"),
  finishing: text("finishing"),
  supplierId: integer("supplier_id"),
  leadTimeDays: integer("lead_time_days"),
  isOrderable: boolean("is_orderable").notNull().default(true),
  allowsDesignRequest: boolean("allows_design_request").notNull().default(true),
  sizeOptionsJson: jsonb("size_options_json").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: text("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductCatalogSchema = createInsertSchema(productCatalogTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductCatalog = z.infer<typeof insertProductCatalogSchema>;
export type ProductCatalog = typeof productCatalogTable.$inferSelect;
