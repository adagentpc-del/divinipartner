import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesRepsTable } from "./salesReps";

export const SALES_TEMPLATE_CATEGORIES = [
  "pole_banner_template",
  "pole_banner_spec",
  "material_spec",
  "print_template",
  "install_instructions",
  "permit_document",
  "coi_template",
  "artwork_guidelines",
  "production_standards",
] as const;
export type SalesTemplateCategory = (typeof SALES_TEMPLATE_CATEGORIES)[number];

export const salesTemplatesTable = pgTable(
  "sales_templates",
  {
    id: serial("id").primaryKey(),

    fileName: text("file_name").notNull(),
    category: text("category").notNull(),
    productType: text("product_type"),
    description: text("description"),
    fileUrl: text("file_url").notNull(),

    uploadedByRepId: integer("uploaded_by_rep_id").references(() => salesRepsTable.id, { onDelete: "set null" }),
    uploadedByName: text("uploaded_by_name"),

    // Active vs archived.
    isActive: boolean("is_active").notNull().default(true),
    // When true AND active, surfaced as a download on the relevant public intake pages.
    clientFacing: boolean("client_facing").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    categoryIdx: index("sales_templates_category_idx").on(table.category),
  }),
);

export const insertSalesTemplateSchema = createInsertSchema(salesTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesTemplate = z.infer<typeof insertSalesTemplateSchema>;
export type SalesTemplate = typeof salesTemplatesTable.$inferSelect;
