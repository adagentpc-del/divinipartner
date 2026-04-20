import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { citiesTable } from "./cities";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  venueAddress: text("venue_address"),
  shippingAddress: text("shipping_address"),
  onsiteContactName: text("onsite_contact_name"),
  onsiteContactPhone: text("onsite_contact_phone"),
  onsiteContactEmail: text("onsite_contact_email"),
  installNotes: text("install_notes"),
  shippingInstructions: text("shipping_instructions"),
  deadlineNotes: text("deadline_notes"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
