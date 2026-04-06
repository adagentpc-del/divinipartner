import { pgTable, serial, text, doublePrecision, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  startingPrice: doublePrecision("starting_price"),
  internalCostBasis: doublePrecision("internal_cost_basis"),
  rushFeeRule: text("rush_fee_rule"),
  installFeeRule: text("install_fee_rule"),
  removalFeeRule: text("removal_fee_rule"),
  designFeeRule: text("design_fee_rule"),
  upsellTagsJson: jsonb("upsell_tags_json").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRulesTable.$inferSelect;
