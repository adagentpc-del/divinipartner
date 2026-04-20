import { pgTable, serial, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { suppliersTable } from "./suppliers";
import { productCatalogTable } from "./productCatalog";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  tier: integer("tier").notNull().default(1),
  price: numeric("price", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const packageItemsTable = pgTable("package_items", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").notNull().references(() => packagesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productCatalogTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  isOptional: boolean("is_optional").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackageItemSchema = createInsertSchema(packageItemsTable).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
export type InsertPackageItem = z.infer<typeof insertPackageItemSchema>;
export type PackageItem = typeof packageItemsTable.$inferSelect;
