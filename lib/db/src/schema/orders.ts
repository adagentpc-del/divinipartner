import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { eventsTable } from "./events";
import { suppliersTable } from "./suppliers";
import { packagesTable } from "./packages";
import { productCatalogTable } from "./productCatalog";
import { partnerBrandingLocationsTable } from "./partnerBrandingLocations";
import { venuesTable } from "./venues";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "restrict" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  packageId: integer("package_id").references(() => packagesTable.id, { onDelete: "set null" }),
  portalType: text("portal_type").notNull().default("ordering"),
  shippingVenueId: integer("shipping_venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  assignedSupplierId: integer("assigned_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  fulfillmentMode: text("fulfillment_mode"),
  status: text("status").notNull().default("new"),
  paymentStatus: text("payment_status").notNull().default("not_charged"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  companyName: text("company_name"),
  shippingAddressJson: jsonb("shipping_address_json").$type<{ line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }>(),
  billingAddressJson: jsonb("billing_address_json").$type<{ line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }>(),
  artworkFilesJson: jsonb("artwork_files_json").$type<Array<{ url: string; name?: string; size?: number; type?: string }>>(),
  totalEstimate: numeric("total_estimate", { precision: 12, scale: 2 }),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  vendorNotes: text("vendor_notes"),
  fulfillmentStatus: text("fulfillment_status"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  productId: integer("product_id").references(() => productCatalogTable.id, { onDelete: "set null" }),
  packageId: integer("package_id").references(() => packagesTable.id, { onDelete: "set null" }),
  brandingZoneId: integer("branding_zone_id").references(() => partnerBrandingLocationsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  fulfillmentMode: text("fulfillment_mode"),
  hardwareRequired: boolean("hardware_required").notNull().default(false),
  printDemandQuantity: integer("print_demand_quantity").notNull().default(0),
  hardwareDemandQuantity: integer("hardware_demand_quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  shortageQuantity: integer("shortage_quantity").notNull().default(0),
  inventorySourceCityId: integer("inventory_source_city_id"),
  inventorySourceInventoryId: integer("inventory_source_inventory_id"),
  inventoryReservationId: integer("inventory_reservation_id"),
  internalFulfillmentNotes: text("internal_fulfillment_notes"),
  artworkFileUrl: text("artwork_file_url"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true, orderNumber: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
