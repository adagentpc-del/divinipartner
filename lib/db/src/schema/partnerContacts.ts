import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { partnersTable } from "./partners";

// Section 30 — role-based contacts attached to a partner profile.
// Distinct from `partner_email_recipients`: that table is purely for routing
// outbound order emails (multiple ops/finance/cc/bcc addresses). This table
// is the people directory used by humans during order handling, support, and
// artwork workflows. A contact may also be referenced from order pages.
export const PARTNER_CONTACT_ROLES = [
  "primary",
  "billing",
  "graphic_designer",
  "support",
  "onsite",
  "project",
  "other",
] as const;
export type PartnerContactRole = (typeof PARTNER_CONTACT_ROLES)[number];

export const partnerContactsTable = pgTable("partner_contacts", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("other"),
  fullName: text("full_name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  // isPrimary scopes per-role: there can be one primary billing contact and
  // one primary graphic designer at the same time. Enforced in the route layer.
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Hard-enforce one primary contact per (partner, role) at the DB level —
  // the route logic also demotes siblings, but the partial unique index
  // protects against races and any future code path that forgets.
  onePrimaryPerRole: uniqueIndex("partner_contacts_one_primary_per_role")
    .on(t.partnerId, t.role)
    .where(sql`${t.isPrimary}`),
}));
