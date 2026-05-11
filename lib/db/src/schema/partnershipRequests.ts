import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnershipRequestsTable = pgTable("partnership_requests", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  partnerType: text("partner_type"),
  portalUseCase: text("portal_use_case"),
  estimatedVolume: text("estimated_volume"),
  message: text("message"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartnershipRequestSchema = createInsertSchema(partnershipRequestsTable).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type InsertPartnershipRequest = z.infer<typeof insertPartnershipRequestSchema>;
export type PartnershipRequest = typeof partnershipRequestsTable.$inferSelect;
