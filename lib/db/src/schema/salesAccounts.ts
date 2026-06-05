import { pgTable, serial, text, integer, jsonb, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesRepsTable } from "./salesReps";

export const SALES_ACCOUNT_STATUSES = ["active", "prospect", "past_client", "lost", "dormant"] as const;
export type SalesAccountStatus = (typeof SALES_ACCOUNT_STATUSES)[number];

export const salesAccountsTable = pgTable(
  "sales_accounts",
  {
    id: serial("id").primaryKey(),

    companyName: text("company_name").notNull(),
    // Lowercased, punctuation-stripped, suffix-trimmed name used as the fast
    // candidate key for fuzzy company matching on intake.
    normalizedName: text("normalized_name").notNull(),

    parentCompany: text("parent_company"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    industry: text("industry"),

    ownerRepId: integer("owner_rep_id").references(() => salesRepsTable.id, { onDelete: "set null" }),

    status: text("status").notNull().default("prospect"),
    notes: text("notes"),
    uploadsJson: jsonb("uploads_json").$type<{ name: string; url: string }[]>(),

    lastContactDate: date("last_contact_date"),
    nextFollowUpDate: date("next_follow_up_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    normalizedNameIdx: index("sales_accounts_normalized_name_idx").on(table.normalizedName),
    ownerIdx: index("sales_accounts_owner_idx").on(table.ownerRepId),
  }),
);

export const insertSalesAccountSchema = createInsertSchema(salesAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesAccount = z.infer<typeof insertSalesAccountSchema>;
export type SalesAccount = typeof salesAccountsTable.$inferSelect;
