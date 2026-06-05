import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesRepsTable } from "./salesReps";
import { salesAccountsTable } from "./salesAccounts";

export const INTAKE_FORM_TYPES = ["general", "pole_banner"] as const;
export type IntakeFormType = (typeof INTAKE_FORM_TYPES)[number];

// Link source captured from the public URL path (/intake/<source>).
export const INTAKE_LINK_SOURCES = ["alyssa", "drew", "retta", "general"] as const;
export type IntakeLinkSource = (typeof INTAKE_LINK_SOURCES)[number];

export const INTAKE_ROUTING_METHODS = ["account_match", "link_source", "super_admin_queue"] as const;
export type IntakeRoutingMethod = (typeof INTAKE_ROUTING_METHODS)[number];

export const salesIntakeSubmissionsTable = pgTable(
  "sales_intake_submissions",
  {
    id: serial("id").primaryKey(),

    formType: text("form_type").notNull(),
    linkSource: text("link_source"),

    // Promoted top-level fields used for matching / routing / list display.
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),

    // Full form payload (all the rich form fields live here).
    payloadJson: jsonb("payload_json").notNull().$type<Record<string, unknown>>(),

    matchedAccountId: integer("matched_account_id").references(() => salesAccountsTable.id, {
      onDelete: "set null",
    }),
    assignedRepId: integer("assigned_rep_id").references(() => salesRepsTable.id, { onDelete: "set null" }),
    routingMethod: text("routing_method"),

    status: text("status").notNull().default("new"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    assignedIdx: index("sales_intake_assigned_idx").on(table.assignedRepId),
    createdIdx: index("sales_intake_created_idx").on(table.createdAt),
  }),
);

export const insertSalesIntakeSubmissionSchema = createInsertSchema(salesIntakeSubmissionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesIntakeSubmission = z.infer<typeof insertSalesIntakeSubmissionSchema>;
export type SalesIntakeSubmission = typeof salesIntakeSubmissionsTable.$inferSelect;
