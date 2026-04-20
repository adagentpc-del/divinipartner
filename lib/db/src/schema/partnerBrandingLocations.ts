import { pgTable, serial, text, integer, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
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
  sizeUnit: text("size_unit").default("inches"),
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
