import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { productCatalogTable } from "./productCatalog";

export const productRequestsTable = pgTable("product_requests", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productCatalogTable.id, { onDelete: "set null" }),
  mainContactName: text("main_contact_name").notNull(),
  companyName: text("company_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  websiteUrl: text("website_url"),
  eventPageUrl: text("event_page_url"),
  eventName: text("event_name"),
  eventDate: text("event_date"),
  neededByDate: text("needed_by_date"),
  quantity: integer("quantity"),
  selectedSize: text("selected_size"),
  selectedOptionsJson: jsonb("selected_options_json").$type<Record<string, string>>(),
  designHelpNeeded: boolean("design_help_needed").notNull().default(false),
  artworkStatus: text("artwork_status"),
  designBrief: text("design_brief"),
  styleNotes: text("style_notes"),
  proofDeadline: text("proof_deadline"),
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  adminNotes: text("admin_notes"),

  estimatedPrice: numeric("estimated_price", { precision: 12, scale: 2 }),
  costNotes: text("cost_notes"),
  quoteSummary: text("quote_summary"),
  turnaroundNotes: text("turnaround_notes"),
  quoteReady: boolean("quote_ready").notNull().default(false),
  quoteStatus: text("quote_status").notNull().default("needs_review"),

  productionOwner: text("production_owner"),
  installRequired: text("install_required"),
  productionNotes: text("production_notes"),
  fulfillmentNotes: text("fulfillment_notes"),
  vendorNotes: text("vendor_notes"),
  productionDeadline: text("production_deadline"),
  priority: text("priority").notNull().default("normal"),
  recurringEvent: boolean("recurring_event").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductRequestSchema = createInsertSchema(productRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductRequest = z.infer<typeof insertProductRequestSchema>;
export type ProductRequest = typeof productRequestsTable.$inferSelect;
