import { pgTable, serial, text, integer, numeric, jsonb, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesRepsTable } from "./salesReps";
import { salesAccountsTable } from "./salesAccounts";
import { salesIntakeSubmissionsTable } from "./salesIntakeSubmissions";

export const OPPORTUNITY_STAGES = [
  "new_intake",
  "discovery",
  "estimating",
  "quote_sent",
  "follow_up",
  "negotiation",
  "won",
  "lost",
  "production",
  "install_scheduled",
  "completed",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_LOST_REASONS = [
  "price",
  "install_cost",
  "lead_time",
  "existing_vendor",
  "competitor",
  "budget",
  "no_decision",
  "relationship",
  "scope_changed",
  "other",
] as const;
export type OpportunityLostReason = (typeof OPPORTUNITY_LOST_REASONS)[number];

export const salesOpportunitiesTable = pgTable(
  "sales_opportunities",
  {
    id: serial("id").primaryKey(),

    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),

    assignedRepId: integer("assigned_rep_id").references(() => salesRepsTable.id, { onDelete: "set null" }),
    matchedAccountId: integer("matched_account_id").references(() => salesAccountsTable.id, {
      onDelete: "set null",
    }),
    intakeSubmissionId: integer("intake_submission_id").references(() => salesIntakeSubmissionsTable.id, {
      onDelete: "set null",
    }),

    projectType: text("project_type"),
    estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),

    stage: text("stage").notNull().default("new_intake"),

    quoteNeededBy: date("quote_needed_by"),
    eventDate: date("event_date"),
    installDate: date("install_date"),
    removalDate: date("removal_date"),

    filesJson: jsonb("files_json").$type<{ name: string; url: string }[]>(),
    notes: text("notes"),

    // How this opportunity got assigned (mirrors the submission routing).
    source: text("source"),
    routingMethod: text("routing_method"),

    // Lost tracking.
    lostReason: text("lost_reason"),
    competitorName: text("competitor_name"),
    competitorPrice: numeric("competitor_price", { precision: 12, scale: 2 }),
    a3Price: numeric("a3_price", { precision: 12, scale: 2 }),
    lostNotes: text("lost_notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    assignedIdx: index("sales_opportunities_assigned_idx").on(table.assignedRepId),
    stageIdx: index("sales_opportunities_stage_idx").on(table.stage),
  }),
);

export const insertSalesOpportunitySchema = createInsertSchema(salesOpportunitiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesOpportunity = z.infer<typeof insertSalesOpportunitySchema>;
export type SalesOpportunity = typeof salesOpportunitiesTable.$inferSelect;
