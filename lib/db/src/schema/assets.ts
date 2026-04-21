import { pgTable, serial, text, integer, timestamp, boolean, jsonb, bigint } from "drizzle-orm/pg-core";
import { partnersTable } from "./partners";
import { eventsTable } from "./events";
import { ordersTable, orderItemsTable } from "./orders";
import { productCatalogTable } from "./productCatalog";
import { packagesTable } from "./packages";
import { partnerBrandingLocationsTable } from "./partnerBrandingLocations";
import { suppliersTable } from "./suppliers";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),

  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  fileSize: bigint("file_size", { mode: "number" }),

  // Categorization
  category: text("category").notNull().default("client_artwork"),
  // client_artwork | approved_artwork | proof | print_ready | reference | install_reference | shipping_document | photo | spec | internal_only

  visibility: text("visibility").notNull().default("internal_only"),
  // internal_only | partner_visible | client_visible | vendor_visible

  // Polymorphic linkage
  ownerType: text("owner_type"),
  ownerId: integer("owner_id"),

  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => productCatalogTable.id, { onDelete: "set null" }),
  packageId: integer("package_id").references(() => packagesTable.id, { onDelete: "set null" }),
  brandingZoneId: integer("branding_zone_id").references(() => partnerBrandingLocationsTable.id, { onDelete: "set null" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),

  // Versioning
  version: integer("version").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  parentAssetId: integer("parent_asset_id"),

  // Lifecycle
  status: text("status").notNull().default("uploaded"),
  // uploaded | under_review | revision_requested | approved | superseded | vendor_released | archived

  approvalStatus: text("approval_status").notNull().default("pending"),
  // pending | approved | rejected | not_required

  approvedByUserId: text("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  releasedToVendorAt: timestamp("released_to_vendor_at", { withTimezone: true }),

  productionReady: boolean("production_ready").notNull().default(false),

  uploadedByUserId: text("uploaded_by_user_id"),
  notes: text("notes"),
  tagsJson: jsonb("tags_json").$type<string[]>(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Many-to-many: one asset can be mapped to multiple line items
export const assetLinksTable = pgTable("asset_links", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id").notNull().references(() => orderItemsTable.id, { onDelete: "cascade" }),
  role: text("role"),                 // primary_artwork | proof | reference | install_diagram | shipping_doc
  isRequiredFor: boolean("is_required_for").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Activity log for asset lifecycle
export const assetEventsTable = pgTable("asset_events", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").references(() => assetsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id"),
  eventType: text("event_type").notNull(),
  // uploaded | linked | unlinked | new_version | approved | revision_requested | released_to_vendor | superseded | archived | blocked | unblocked | note
  fromValue: text("from_value"),
  toValue: text("to_value"),
  actorUserId: text("actor_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Asset = typeof assetsTable.$inferSelect;
export type AssetLink = typeof assetLinksTable.$inferSelect;
export type AssetEvent = typeof assetEventsTable.$inferSelect;
