import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

/**
 * Per-partner email recipient with a structured role.
 *
 * Multiple recipients can share a role (e.g. two ops emails for redundancy).
 * Roles drive which audience-specific email template the address receives:
 *   - ops              → operational order summary (replaces legacy internal forward)
 *   - finance          → billing-focused notification
 *   - partner_contact  → polished partner-facing copy
 *   - vendor           → reserved for future vendor notifications
 *   - cc               → cc'd on the ops email (no standalone send)
 *   - bcc              → bcc'd on the ops email (no standalone send)
 *
 * Inactive recipients are skipped at send time. Legacy partner-level
 * `internalForwardEmail` and `ccEmail` fields still act as fallbacks when no
 * recipients are configured for the corresponding role, so existing partners
 * keep working without any data migration.
 */
export const partnerEmailRecipientsTable = pgTable("partner_email_recipients", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  email: text("email").notNull(),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  partnerIdx: index("partner_email_recipients_partner_idx").on(t.partnerId),
  roleIdx: index("partner_email_recipients_partner_role_idx").on(t.partnerId, t.role),
}));

export const RECIPIENT_ROLES = ["ops", "finance", "partner_contact", "vendor", "cc", "bcc"] as const;
export type RecipientRole = typeof RECIPIENT_ROLES[number];

export const insertPartnerEmailRecipientSchema = createInsertSchema(partnerEmailRecipientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerEmailRecipient = z.infer<typeof insertPartnerEmailRecipientSchema>;
export type PartnerEmailRecipient = typeof partnerEmailRecipientsTable.$inferSelect;
