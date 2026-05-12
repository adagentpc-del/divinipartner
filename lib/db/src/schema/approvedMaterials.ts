/**
 * Global approved materials reference table (Task #5).
 *
 * Seeded from the Setup_Lists tab of the partner asset workbook
 * (a3_partner_asset_template_filled_batch1). Used as the fallback list of
 * surface materials offered on every survey asset that doesn't have a
 * per-item override.
 */
import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvedMaterialsTable = pgTable("approved_materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"), // adhesive | fabric | rigid | wrap | other
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApprovedMaterialSchema = createInsertSchema(approvedMaterialsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertApprovedMaterial = z.infer<typeof insertApprovedMaterialSchema>;
export type ApprovedMaterial = typeof approvedMaterialsTable.$inferSelect;

/**
 * Defaults seeded into the table when first enabled. Pulled from the
 * Setup_Lists tab of the asset survey workbook so partners can launch with a
 * sensible material list out-of-the-box.
 */
export const DEFAULT_APPROVED_MATERIALS: Array<{ name: string; category: string; sortOrder: number }> = [
  { name: "Vinyl wrap", category: "wrap", sortOrder: 10 },
  { name: "Tension fabric", category: "fabric", sortOrder: 20 },
  { name: "Adhesive vinyl", category: "adhesive", sortOrder: 30 },
  { name: "Floor decal", category: "adhesive", sortOrder: 40 },
  { name: "Window cling", category: "adhesive", sortOrder: 50 },
  { name: "Foam core board", category: "rigid", sortOrder: 60 },
  { name: "PVC panel", category: "rigid", sortOrder: 70 },
  { name: "Backlit film", category: "wrap", sortOrder: 80 },
  { name: "Mesh banner", category: "fabric", sortOrder: 90 },
  { name: "Static cling", category: "adhesive", sortOrder: 100 },
];
