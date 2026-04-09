import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const portalRequestsTable = pgTable("portal_requests", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  requestType: text("request_type").notNull(),
  requestCategory: text("request_category"),
  mainContactName: text("main_contact_name").notNull(),
  companyName: text("company_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  websiteUrl: text("website_url"),
  eventPageUrl: text("event_page_url"),
  eventName: text("event_name"),
  eventDate: text("event_date"),
  neededByDate: text("needed_by_date"),
  venueName: text("venue_name"),
  venueLocation: text("venue_location"),
  attendeeCount: text("attendee_count"),
  description: text("description"),
  designHelpNeeded: boolean("design_help_needed").notNull().default(false),
  artworkStatus: text("artwork_status"),
  designBrief: text("design_brief"),
  styleNotes: text("style_notes"),
  proofDeadline: text("proof_deadline"),
  budgetRange: text("budget_range"),
  status: text("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPortalRequestSchema = createInsertSchema(portalRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPortalRequest = z.infer<typeof insertPortalRequestSchema>;
export type PortalRequest = typeof portalRequestsTable.$inferSelect;
