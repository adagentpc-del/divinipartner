import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SALES_REP_ROLES = ["super_admin", "sales_rep"] as const;
export type SalesRepRole = (typeof SALES_REP_ROLES)[number];

export const SALES_REP_STATUSES = ["active", "inactive"] as const;
export type SalesRepStatus = (typeof SALES_REP_STATUSES)[number];

export const salesRepsTable = pgTable(
  "sales_reps",
  {
    id: serial("id").primaryKey(),

    // Clerk user id, populated on first login when email matches.
    clerkUserId: text("clerk_user_id"),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),

    role: text("role").notNull().default("sales_rep"),
    status: text("status").notNull().default("active"),

    // Where routed-intake notifications should go (falls back to email).
    notificationEmail: text("notification_email"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    emailIdx: uniqueIndex("sales_reps_email_idx").on(table.email),
  }),
);

export const insertSalesRepSchema = createInsertSchema(salesRepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesRep = z.infer<typeof insertSalesRepSchema>;
export type SalesRep = typeof salesRepsTable.$inferSelect;
