import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productCatalogTable } from "./productCatalog";

/**
 * Connected product families (Section 26).
 *
 * Models a "kit" where one hardware base item (e.g. an Easy Up tent frame)
 * has multiple dependent components (canopy top, side walls, backdrop, ...).
 * The family is the join point between a partner's owned hardware inventory
 * and the components that depend on it: ordering a component reserves N units
 * from the partner's inventory of the family's hardware product. When the
 * partner has no hardware left, the ordering UI auto-switches to "full unit
 * required" — the hardware product itself must be added to the order.
 *
 * Note: the per-partner inventory and reservations live in `inventoryTable` /
 * `inventoryReservationsTable`. This table is purely a relationship layer.
 */
export const productFamiliesTable = pgTable("product_families", {
  id: serial("id").primaryKey(),
  // Stable handle used in URLs / API responses. Lowercase, hyphenated.
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  // The hardware/base product whose inventory drives availability for the
  // entire family. Nullable so an admin can create a family before the
  // hardware product exists; orders can't reserve until set.
  hardwareProductId: integer("hardware_product_id")
    .references(() => productCatalogTable.id, { onDelete: "set null" }),
  // Default: do component orders require the hardware to exist for this
  // family? Almost always true; set false for families like "swag bags" where
  // components are ordered standalone.
  requiresHardwareDefault: boolean("requires_hardware_default").notNull().default(true),
  // Visual threshold: when (available / total) drops at-or-below this many
  // remaining units, the admin status card flips to "low" styling. Null →
  // fall back to the resolver's sensible default (max(2, 15% of total)).
  lowStockThreshold: integer("low_stock_threshold"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  slugIdx: uniqueIndex("product_families_slug_idx").on(table.slug),
}));

export const productFamilyMembersTable = pgTable("product_family_members", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => productFamiliesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productCatalogTable.id, { onDelete: "cascade" }),
  // 'hardware'  — the base item; one per family (the same id as hardwareProductId).
  // 'component' — depends on the hardware; reservation is taken on order.
  // 'accessory' — optional add-on; usually doesn't reserve hardware.
  role: text("role").notNull().default("component"),
  // How many hardware units one unit of this component consumes. e.g. a
  // canopy top = 1 frame; a 4-pack of side walls = 1 frame.
  requiresHardwareUnits: integer("requires_hardware_units").notNull().default(1),
  isOptional: boolean("is_optional").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  familyProductIdx: uniqueIndex("product_family_members_family_product_idx").on(table.familyId, table.productId),
}));

export const insertProductFamilySchema = createInsertSchema(productFamiliesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductFamily = z.infer<typeof insertProductFamilySchema>;
export type ProductFamily = typeof productFamiliesTable.$inferSelect;

export const insertProductFamilyMemberSchema = createInsertSchema(productFamilyMembersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductFamilyMember = z.infer<typeof insertProductFamilyMemberSchema>;
export type ProductFamilyMember = typeof productFamilyMembersTable.$inferSelect;
