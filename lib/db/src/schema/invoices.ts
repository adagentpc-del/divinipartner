import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { eventsTable } from "./events";
import { ordersTable } from "./orders";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  internalReference: text("internal_reference"),
  publicToken: text("public_token").notNull().unique(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "restrict" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  billingExecModel: text("billing_exec_model").notNull(),
  billingEntity: text("billing_entity"),
  status: text("status").notNull().default("draft"), // draft | ready | sent | partially_paid | paid | overdue | cancelled
  issueDate: text("issue_date"), // ISO date
  dueDate: text("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 12, scale: 2 }),
  // Currency + tax snapshot carried from the source order (April 2026).
  currency: text("currency").notNull().default("USD"),
  taxMode: text("tax_mode").notNull().default("none"),
  taxLabel: text("tax_label"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 3 }),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).notNull().default("0"),
  depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  paymentInstructions: text("payment_instructions"),
  externalInvoiceRef: text("external_invoice_ref"),
  paymentLinkPlaceholder: text("payment_link_placeholder"),
  billingContactJson: jsonb("billing_contact_json").$type<{ name?: string; email?: string; phone?: string; address?: string }>(),
  lineItemsJson: jsonb("line_items_json").$type<Array<{ description: string; quantity?: number; unitPrice?: string; amount: string }>>(),
  notes: text("notes"),
  internalBillingOwnerUserId: text("internal_billing_owner_user_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidDate: text("paid_date"),
  method: text("method"), // ach | check | wire | card | cash | other
  reference: text("reference"),
  receivedByUserId: text("received_by_user_id"),
  isDeposit: boolean("is_deposit").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const insertInvoicePaymentSchema = createInsertSchema(invoicePaymentsTable).omit({ id: true, createdAt: true });
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;
