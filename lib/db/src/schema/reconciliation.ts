import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const discrepanciesTable = pgTable("discrepancies", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // supplier_cost_variance | commission_variance | billing_mismatch | missing_payment | missing_supplier_final | wrong_billing_model | missing_quote_ref | shortage_unresolved | manual_review
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  status: text("status").notNull().default("open"), // open | in_review | resolved | wont_fix
  reason: text("reason"),
  notes: text("notes"),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }),
  actualAmount: numeric("actual_amount", { precision: 12, scale: 2 }),
  varianceAmount: numeric("variance_amount", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  assignedToUserId: text("assigned_to_user_id"),
  resolutionNotes: text("resolution_notes"),
  autoFlagged: text("auto_flagged"), // null or short tag explaining why auto-detected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const commissionPayoutsTable = pgTable("commission_payouts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  paidDate: text("paid_date"),
  paidThrough: text("paid_through"),
  reference: text("reference"),
  notes: text("notes"),
  recordedByUserId: text("recorded_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Discrepancy = typeof discrepanciesTable.$inferSelect;
export type CommissionPayout = typeof commissionPayoutsTable.$inferSelect;
