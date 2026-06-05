import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesRepsTable } from "./salesReps";
import { salesOpportunitiesTable } from "./salesOpportunities";

export const salesOpportunityNotesTable = pgTable(
  "sales_opportunity_notes",
  {
    id: serial("id").primaryKey(),

    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => salesOpportunitiesTable.id, { onDelete: "cascade" }),

    authorRepId: integer("author_rep_id").references(() => salesRepsTable.id, { onDelete: "set null" }),
    authorName: text("author_name"),

    body: text("body").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    opportunityIdx: index("sales_opportunity_notes_opportunity_idx").on(table.opportunityId),
  }),
);

export const insertSalesOpportunityNoteSchema = createInsertSchema(salesOpportunityNotesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSalesOpportunityNote = z.infer<typeof insertSalesOpportunityNoteSchema>;
export type SalesOpportunityNote = typeof salesOpportunityNotesTable.$inferSelect;
