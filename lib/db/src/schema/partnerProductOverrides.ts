import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { productCatalogTable } from "./productCatalog";

export const partnerProductOverridesTable = pgTable("partner_product_overrides", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productCatalogTable.id, { onDelete: "cascade" }),
  customTitle: text("custom_title"),
  customDescription: text("custom_description"),
  customImageUrl: text("custom_image_url"),
  isVisible: boolean("is_visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerProductOverrideSchema = createInsertSchema(partnerProductOverridesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerProductOverride = z.infer<typeof insertPartnerProductOverrideSchema>;
export type PartnerProductOverride = typeof partnerProductOverridesTable.$inferSelect;
