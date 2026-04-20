import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";
import { productCatalogTable } from "./productCatalog";
import { partnersTable } from "./partners";
import { eventsTable } from "./events";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productCatalogTable.id, { onDelete: "set null" }),
  name: text("name"),
  category: text("category"),
  assetType: text("asset_type").notNull().default("hardware"),
  storageLocation: text("storage_location"),
  totalQuantity: integer("total_quantity").notNull().default(0),
  hardwareOnHand: integer("hardware_on_hand").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  inUse: integer("in_use").notNull().default(0),
  damaged: integer("damaged").notNull().default(0),
  retired: integer("retired").notNull().default(0),
  onOrder: integer("on_order").notNull().default(0),
  reorderThreshold: integer("reorder_threshold").notNull().default(2),
  graphicOnlyAvailable: boolean("graphic_only_available").notNull().default(true),
  lowInventoryThreshold: integer("low_inventory_threshold").notNull().default(2),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  cityPartnerProductIdx: uniqueIndex("inventory_city_partner_product_idx").on(table.cityId, table.partnerId, table.productId, table.name),
}));

export const inventoryReservationsTable = pgTable("inventory_reservations", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").notNull().references(() => inventoryTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;

export const insertInventoryReservationSchema = createInsertSchema(inventoryReservationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryReservation = z.infer<typeof insertInventoryReservationSchema>;
export type InventoryReservation = typeof inventoryReservationsTable.$inferSelect;
