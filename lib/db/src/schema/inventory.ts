import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, numeric, date, index } from "drizzle-orm/pg-core";
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
  // Section 27: rentable-asset extensions.
  rentable: boolean("rentable").notNull().default(false),
  rentalPrice: numeric("rental_price", { precision: 10, scale: 2 }),
  priceBasis: text("price_basis").notNull().default("per_event"), // 'per_event' | 'per_day'
  eligibilityMode: text("eligibility_mode").notNull().default("all"), // 'all' | 'allowlist'
  eligibleEventIds: integer("eligible_event_ids").array().notNull().default([]),
  eligibleCityIds: integer("eligible_city_ids").array().notNull().default([]),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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
  // Section 27: date-windowed reservations + reason metadata.
  startDate: date("start_date"),
  endDate: date("end_date"),
  holdReason: text("hold_reason").notNull().default("event"), // 'event' | 'manual'
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  inventoryDateIdx: index("inventory_reservations_inventory_date_idx").on(table.inventoryId, table.startDate, table.endDate),
}));

// Section 27: manual blackout periods (maintenance, damage, internal hold, venue restriction…).
// These reduce availability for the [startDate, endDate] window WITHOUT writing
// to inventory.reserved (which is reserved for the rolling counter that
// reserveForItem maintains). Availability is computed at read time.
export const inventoryBlackoutsTable = pgTable("inventory_blackouts", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").notNull().references(() => inventoryTable.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  quantity: integer("quantity").notNull(), // how many units are blacked out for the window
  reason: text("reason").notNull().default("manual"), // 'manual' | 'maintenance' | 'damage' | 'internal' | 'venue' | 'pending_event'
  reasonNote: text("reason_note"),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  inventoryDateIdx: index("inventory_blackouts_inventory_date_idx").on(table.inventoryId, table.startDate, table.endDate),
}));

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;

export const insertInventoryReservationSchema = createInsertSchema(inventoryReservationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryReservation = z.infer<typeof insertInventoryReservationSchema>;
export type InventoryReservation = typeof inventoryReservationsTable.$inferSelect;

export const insertInventoryBlackoutSchema = createInsertSchema(inventoryBlackoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryBlackout = z.infer<typeof insertInventoryBlackoutSchema>;
export type InventoryBlackout = typeof inventoryBlackoutsTable.$inferSelect;
