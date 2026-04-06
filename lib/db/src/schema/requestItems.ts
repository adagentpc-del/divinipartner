import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRequestItemSchema = createInsertSchema(requestItemsTable).omit({ id: true, createdAt: true });
export type InsertRequestItem = z.infer<typeof insertRequestItemSchema>;
export type RequestItem = typeof requestItemsTable.$inferSelect;
