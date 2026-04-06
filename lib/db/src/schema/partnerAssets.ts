import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const partnerAssetsTable = pgTable("partner_assets", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartnerAssetSchema = createInsertSchema(partnerAssetsTable).omit({ id: true, createdAt: true });
export type InsertPartnerAsset = z.infer<typeof insertPartnerAssetSchema>;
export type PartnerAsset = typeof partnerAssetsTable.$inferSelect;
