import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric, doublePrecision } from "drizzle-orm/pg-core";
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
  // Currency & tax snapshot resolved at order creation (April 2026).
  // currencySource / taxModeSource explain inheritance: 'partner' | 'event' | 'order'.
  currency: text("currency").notNull().default("USD"),
  currencySource: text("currency_source").notNull().default("partner"),
  taxMode: text("tax_mode").notNull().default("none"),
  taxLabel: text("tax_label"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 3 }),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  taxModeSource: text("tax_mode_source").notNull().default("partner"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
  // Financial / reconciliation
  paymentModel: text("payment_model").notNull().default("partner_billed"), // partner_billed | client_direct | a3_billed | prepaid
  billingEntity: text("billing_entity"), // free-text who is billed
  supplierEstimatedCost: numeric("supplier_estimated_cost", { precision: 12, scale: 2 }),
  supplierFinalCost: numeric("supplier_final_cost", { precision: 12, scale: 2 }),
  expectedCommission: numeric("expected_commission", { precision: 12, scale: 2 }),
  paidCommission: numeric("paid_commission", { precision: 12, scale: 2 }),
  commissionPaidDate: text("commission_paid_date"),
  commissionPaidThrough: text("commission_paid_through"), // ach | check | wire | platform
  commissionStatus: text("commission_status").notNull().default("not_started"), // not_started | expected | partially_paid | paid | disputed | verified
  supplierPayableStatus: text("supplier_payable_status").notNull().default("not_started"), // not_started | invoiced | paid | overdue
  payoutStatus: text("payout_status").notNull().default("pending"),
  reconciliationStatus: text("reconciliation_status").notNull().default("not_started"), // not_started | in_review | waiting_payment | waiting_supplier_final | waiting_commission | discrepancy_found | reconciled
  reconciliationNotes: text("reconciliation_notes"),
  financeNotes: text("finance_notes"),
  // Billing execution
  billingExecModel: text("billing_exec_model"), // resolved value (null = use partner default at runtime)
  billingExecModelSource: text("billing_exec_model_source"), // partner | event | order
  invoiceRequired: boolean("invoice_required").notNull().default(true),
  internalBillingOwnerUserId: text("internal_billing_owner_user_id"),
  billingReferenceNumber: text("billing_reference_number"),
  externalInvoiceRef: text("external_invoice_ref"),
  paymentLinkPlaceholder: text("payment_link_placeholder"),
  billingNotes: text("billing_notes"),
  billingContactJson: jsonb("billing_contact_json").$type<{ name?: string; email?: string; phone?: string }>(),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  vendorNotes: text("vendor_notes"),
  fulfillmentStatus: text("fulfillment_status"),
  // Section 29 — order-level exception workflow.
  // exceptionState drives the at-a-glance pill in the admin UI; exceptionType is
  // a structured category from EXCEPTION_TYPES below; exceptionMessage is the
  // free-text "what's wrong" string admins type. Artwork-needed flow is its own
  // boolean+brief pair so it can co-exist with other exception types.
  exceptionState: text("exception_state").notNull().default("none"),
  exceptionType: text("exception_type"),
  exceptionMessage: text("exception_message"),
  exceptionUpdatedAt: timestamp("exception_updated_at", { withTimezone: true }),
  exceptionUpdatedBy: text("exception_updated_by"),
  artworkNeededFlag: boolean("artwork_needed_flag").notNull().default(false),
  artworkBrief: text("artwork_brief"),
  artworkContactName: text("artwork_contact_name"),
  artworkContactEmail: text("artwork_contact_email"),
  // Shipping & logistics summary (April 2026 logistics extension).
  shipDateTarget: timestamp("ship_date_target", { withTimezone: true }),
  deliveryByDate: timestamp("delivery_by_date", { withTimezone: true }),
  packageCount: integer("package_count"),
  totalShipmentWeight: doublePrecision("total_shipment_weight"),
  totalShipmentWeightUnit: text("total_shipment_weight_unit"), // lb | oz | kg | g
  totalShipmentWeightG: doublePrecision("total_shipment_weight_g"),
  measurementSystem: text("measurement_system"), // imperial | metric (resolved at order creation)
  oversizeFlag: boolean("oversize_flag").notNull().default(false),
  crateRequired: boolean("crate_required").notNull().default(false),
  palletRequired: boolean("pallet_required").notNull().default(false),
  shippingContactJson: jsonb("shipping_contact_json").$type<{ name?: string; email?: string; phone?: string }>(),
  receivingContactJson: jsonb("receiving_contact_json").$type<{ name?: string; email?: string; phone?: string }>(),
  customsNotes: text("customs_notes"),
  internationalShippingNotes: text("international_shipping_notes"),
  logisticsNotes: text("logistics_notes"),
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
  // Task #5: line ties back to a venue survey asset (for "Brand our space" flow).
  // FK is intentionally not declared with .references() to avoid a circular import
  // with surveyAssetsTable; orphan rows tolerated since approval can revoke an asset.
  surveyAssetId: integer("survey_asset_id"),
  selectedMaterial: text("selected_material"),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  estimatedSupplierCost: numeric("estimated_supplier_cost", { precision: 12, scale: 2 }),
  finalSupplierCost: numeric("final_supplier_cost", { precision: 12, scale: 2 }),
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
  assignedSupplierId: integer("assigned_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  supplierAssignmentSource: text("supplier_assignment_source"),
  supplierStatus: text("supplier_status").notNull().default("unassigned"),
  supplierDueDate: timestamp("supplier_due_date", { withTimezone: true }),
  supplierShipDate: timestamp("supplier_ship_date", { withTimezone: true }),
  supplierDeliveryDate: timestamp("supplier_delivery_date", { withTimezone: true }),
  supplierInstallDate: timestamp("supplier_install_date", { withTimezone: true }),
  supplierAcknowledgedAt: timestamp("supplier_acknowledged_at", { withTimezone: true }),
  supplierReference: text("supplier_reference"),
  supplierNotes: text("supplier_notes"),
  exceptionFlag: boolean("exception_flag").notNull().default(false),
  exceptionReason: text("exception_reason"),
  exceptionNotes: text("exception_notes"),
  // Measurement-aware pricing snapshot for this line (April 2026 extension).
  // entered_* preserve the partner's originally typed dimensions+unit;
  // *_mm are the canonical normalized values; billable_* drive pricing display.
  enteredWidth: doublePrecision("entered_width"),
  enteredHeight: doublePrecision("entered_height"),
  enteredSizeUnit: text("entered_size_unit"),
  enteredWidthMm: doublePrecision("entered_width_mm"),
  enteredHeightMm: doublePrecision("entered_height_mm"),
  pricingModel: text("pricing_model"),
  pricingUnit: text("pricing_unit"),
  billableAreaSqm: doublePrecision("billable_area_sqm"),
  billableLinearM: doublePrecision("billable_linear_m"),
  minBillableSize: doublePrecision("min_billable_size"),
  calculationBasis: text("calculation_basis"),
  artworkFileUrl: text("artwork_file_url"),
  artworkRequired: boolean("artwork_required"),
  proofRequired: boolean("proof_required"),
  productionReady: boolean("production_ready"),
  productionBlockedReason: text("production_blocked_reason"),
  // Per-line packed/shipping snapshot (April 2026 logistics extension).
  // Defaults copied from product_catalog at order creation; admin can override.
  packedWidth: doublePrecision("packed_width"),
  packedHeight: doublePrecision("packed_height"),
  packedDepth: doublePrecision("packed_depth"),
  packedSizeUnit: text("packed_size_unit"),
  packedWidthMm: doublePrecision("packed_width_mm"),
  packedHeightMm: doublePrecision("packed_height_mm"),
  packedDepthMm: doublePrecision("packed_depth_mm"),
  shippingWeight: doublePrecision("shipping_weight"),
  shippingWeightUnit: text("shipping_weight_unit"),
  shippingWeightG: doublePrecision("shipping_weight_g"),
  cartonCount: integer("carton_count"),
  packingMode: text("packing_mode"), // rolled | flat | boxed | crated
  crateRequired: boolean("crate_required").notNull().default(false),
  palletRequired: boolean("pallet_required").notNull().default(false),
  oversizeFlag: boolean("oversize_flag").notNull().default(false),
  freightClass: text("freight_class"),
  installKitNotes: text("install_kit_notes"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierAssignmentHistoryTable = pgTable("supplier_assignment_history", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItemsTable.id, { onDelete: "cascade" }),
  fromSupplierId: integer("from_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  toSupplierId: integer("to_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  source: text("source").notNull(),
  changedByUserId: text("changed_by_user_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierStatusEventsTable = pgTable("supplier_status_events", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItemsTable.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedByUserId: text("changed_by_user_id"),
  changedByRole: text("changed_by_role"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true, orderNumber: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
