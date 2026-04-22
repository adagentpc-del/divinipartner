import { pgTable, serial, text, integer, timestamp, doublePrecision, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { requestsTable } from "./requests";

export const requestItemsTable = pgTable("request_items", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  quantityNote: text("quantity_note"),
  sizeNote: text("size_note"),
  // Structured measurement-aware pricing (April 2026 extension).
  sizeWidth: doublePrecision("size_width"),
  sizeHeight: doublePrecision("size_height"),
  sizeUnit: text("size_unit"),
  sizeWidthMm: doublePrecision("size_width_mm"),
  sizeHeightMm: doublePrecision("size_height_mm"),
  pricingModel: text("pricing_model"),
  unitRate: numeric("unit_rate", { precision: 12, scale: 4 }),
  pricingUnit: text("pricing_unit"),
  calculatedAreaSqm: doublePrecision("calculated_area_sqm"),
  calculatedLinearM: doublePrecision("calculated_linear_m"),
  estimatedPrice: numeric("estimated_price", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRequestItemSchema = createInsertSchema(requestItemsTable).omit({ id: true, createdAt: true });
export type InsertRequestItem = z.infer<typeof insertRequestItemSchema>;
export type RequestItem = typeof requestItemsTable.$inferSelect;
