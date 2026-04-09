import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productCatalogTable = pgTable("product_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
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
