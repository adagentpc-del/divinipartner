import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const requestsTable = pgTable("requests", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  eventName: text("event_name").notNull(),
  eventDate: text("event_date"),
  venueName: text("venue_name"),
  venueAddress: text("venue_address"),
  installDatetime: text("install_datetime"),
  removalDatetime: text("removal_datetime"),
  postEventDisposition: text("post_event_disposition"),
  industry: text("industry"),
  useCase: text("use_case"),
  designAssistanceRequested: boolean("design_assistance_requested").notNull().default(false),
  customFabricationRequested: boolean("custom_fabrication_requested").notNull().default(false),
  immersiveRequested: boolean("immersive_requested").notNull().default(false),
  promotionalItemsRequested: boolean("promotional_items_requested").notNull().default(false),
  additionalNotes: text("additional_notes"),
  status: text("status").notNull().default("New"),
  aiSummary: text("ai_summary"),
  // Stable hash of the input payload used to produce `aiSummary`. Lets
  // /requests/:id/regenerate-ai short-circuit when the underlying request
  // data hasn't changed since the last AI run — see lib/aiSummary.ts.
  aiSummaryInputHash: text("ai_summary_input_hash"),
  internalSummary: text("internal_summary"),
  estimatedScopeLevel: text("estimated_scope_level"),
  recommendedUpsellsJson: jsonb("recommended_upsells_json").$type<string[]>(),
  pdfSummaryUrl: text("pdf_summary_url"),

  estimatedPrice: numeric("estimated_price", { precision: 12, scale: 2 }),
  quoteStatus: text("quote_status").notNull().default("needs_review"),
  quoteSummary: text("quote_summary"),
  quoteReady: boolean("quote_ready").notNull().default(false),
  productionOwner: text("production_owner"),
  priority: text("priority").notNull().default("normal"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRequestSchema = createInsertSchema(requestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type Request = typeof requestsTable.$inferSelect;
