import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { productCatalogTable } from "./productCatalog";

/**
 * Partner-specific add-on selections.
 *
 * One row = one product chosen as an add-on for one partner. The full set of
 * (partnerId, productId) pairs forms that partner's add-on library, which is
 * then surfaced on event setup and in the public ordering flow.
 *
 * Events inherit this list by default. Per-event overrides live in
 * `events.addon_override_json` (mode: "inherit" | "override").
 */
export const partnerAddonsTable = pgTable("partner_addons", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productCatalogTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  partnerProductUnique: uniqueIndex("partner_addons_partner_product_uq").on(t.partnerId, t.productId),
}));

export const insertPartnerAddonSchema = createInsertSchema(partnerAddonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerAddon = z.infer<typeof insertPartnerAddonSchema>;
export type PartnerAddon = typeof partnerAddonsTable.$inferSelect;
