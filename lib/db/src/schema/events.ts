import { pgTable, serial, text, integer, boolean, timestamp, jsonb, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { citiesTable } from "./cities";
import { venuesTable } from "./venues";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  eventStartDate: date("event_start_date"),
  eventEndDate: date("event_end_date"),
  installDate: date("install_date"),
  teardownDate: date("teardown_date"),
  shippingDeadline: date("shipping_deadline"),
  orderingOpensAt: timestamp("ordering_opens_at", { withTimezone: true }),
  orderingClosesAt: timestamp("ordering_closes_at", { withTimezone: true }),
  venueContactsJson: jsonb("venue_contacts_json").$type<Array<{ name: string; email?: string; phone?: string; role?: string }>>(),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  availablePackageIdsJson: jsonb("available_package_ids_json").$type<number[]>(),
  availableProductIdsJson: jsonb("available_product_ids_json").$type<number[]>(),
  quantityLimitsJson: jsonb("quantity_limits_json").$type<Record<string, number>>(),
  imageUrl: text("image_url"),
  // Billing override (null = inherit from partner)
  billingExecModelOverride: text("billing_exec_model_override"),
  // Currency & tax overrides (April 2026). null = inherit from partner default.
  currency: text("currency"),
  taxMode: text("tax_mode"), // none | sales_tax | vat | gst | custom
  taxLabel: text("tax_label"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 3 }),
  taxInclusive: boolean("tax_inclusive"),
  // Measurement preference override (imperial | metric). null = inherit from venue/partner.
  unitPreference: text("unit_preference"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
