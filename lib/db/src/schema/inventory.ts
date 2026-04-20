import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";
import { productCatalogTable } from "./productCatalog";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productCatalogTable.id, { onDelete: "cascade" }),
  hardwareOnHand: integer("hardware_on_hand").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  damaged: integer("damaged").notNull().default(0),
  graphicOnlyAvailable: boolean("graphic_only_available").notNull().default(true),
  lowInventoryThreshold: integer("low_inventory_threshold").notNull().default(2),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  cityProductIdx: uniqueIndex("inventory_city_product_idx").on(table.cityId, table.productId),
}));

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;
