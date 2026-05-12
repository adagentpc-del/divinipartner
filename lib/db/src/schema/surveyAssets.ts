/**
 * Venue Asset Survey integration (Task #5).
 *
 * `survey_assets` stores assets ingested from the external Venue Asset Survey
 * iPad/desktop app — either by webhook push or admin-triggered pull. Each row
 * is keyed by (partnerId, externalAssetId) so re-syncs idempotently update the
 * same record. The split between "publicly safe" and "internal/A3-only"
 * fields is enforced by the public projection in `publicPortal.ts`.
 *
 * Approval workflow:
 *   - approvalStatus = "pending"  — admin has not reviewed yet (default)
 *   - approvalStatus = "approved" — visible on the partner public portal
 *   - approvalStatus = "rejected" — hidden, kept for audit only
 *
 * Material override modes:
 *   - "per_item"  — use the asset's own approvedMaterials list
 *   - "global"    — fall back to the global approved_materials table
 *   - "custom"    — only the customApprovedMaterials list is offered
 */
import { pgTable, serial, text, integer, boolean, timestamp, jsonb, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const surveyAssetsTable = pgTable("survey_assets", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  // Identity from the source survey app — composite unique with partnerId for idempotent upserts.
  externalAssetId: text("external_asset_id").notNull(),
  externalSurveyId: text("external_survey_id"),
  sourceApp: text("source_app").notNull().default("venue_asset_survey"),
  // Public-safe display fields (rendered on the partner portal Brand-our-space tile gallery).
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // wall | floor | window | column | banner | other
  venueName: text("venue_name"),
  cityName: text("city_name"),
  publicPhotoUrl: text("public_photo_url"),
  publicPhotosJson: jsonb("public_photos_json").$type<Array<{ url: string; caption?: string }>>(),
  // Customer-visible measurements (kept loose so survey app can send any of these).
  widthIn: doublePrecision("width_in"),
  heightIn: doublePrecision("height_in"),
  depthIn: doublePrecision("depth_in"),
  diameterIn: doublePrecision("diameter_in"),
  areaSqft: doublePrecision("area_sqft"),
  shape: text("shape"),
  // Asset_Master geometry / surface columns (Step 1).
  measurementUnit: text("measurement_unit"),         // "in" | "cm" | "ft" — what the survey app captured
  orientation: text("orientation"),                  // landscape | portrait | square | free
  surfaceMaterial: text("surface_material"),         // physical surface: drywall, glass, fabric, brick…
  environment: text("environment"),                  // indoor | outdoor | covered_outdoor
  zoneName: text("zone_name"),                       // venue zone (Lobby, Concourse, Suite Level…)
  // Application taxonomy from the survey workbook.
  primaryApplicationsJson: jsonb("primary_applications_json").$type<string[]>(),
  recommendedApplicationsJson: jsonb("recommended_applications_json").$type<string[]>(),
  alternateApplicationsJson: jsonb("alternate_applications_json").$type<string[]>(),
  publicUseCase: text("public_use_case"),
  // Visibility / inclusion flags from Asset_Master.
  visibilityTier: text("visibility_tier"),           // hero | featured | standard | hidden
  publicStatus: text("public_status"),               // live | draft | retired
  publicDeckInclude: boolean("public_deck_include").notNull().default(true),
  portalVisible: boolean("portal_visible").notNull().default(true),
  netsuiteInclude: boolean("netsuite_include").notNull().default(false),
  designNeeded: boolean("design_needed").notNull().default(false),
  commissionEligible: boolean("commission_eligible").notNull().default(false),
  opsOwner: text("ops_owner"),
  // Per-asset approved material list (used when materialOverrideMode="per_item" or "custom").
  approvedMaterialsJson: jsonb("approved_materials_json").$type<string[]>(),
  customApprovedMaterialsJson: jsonb("custom_approved_materials_json").$type<string[]>(),
  materialOverrideMode: text("material_override_mode").notNull().default("per_item"), // per_item | global | custom
  // Internal / A3-only fields — must NEVER appear in any /public/* response.
  internalNotes: text("internal_notes"),
  installNotes: text("install_notes"),
  productionNotes: text("production_notes"),
  internalPhotosJson: jsonb("internal_photos_json").$type<Array<{ url: string; caption?: string }>>(),
  netsuiteAssetNumber: text("netsuite_asset_number"),
  netsuiteVenueNumber: text("netsuite_venue_number"),
  netsuiteItemName: text("netsuite_item_name"),
  netsuiteItemCategory: text("netsuite_item_category"),
  internalPricingNotes: text("internal_pricing_notes"),
  costCenter: text("cost_center"),
  surveyorName: text("surveyor_name"),
  surveyedAt: timestamp("surveyed_at", { withTimezone: true }),
  // Approval / lifecycle.
  approvalStatus: text("approval_status").notNull().default("pending"), // pending | approved | rejected
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  rejectedReason: text("rejected_reason"),
  isActive: boolean("is_active").notNull().default(true),
  // Raw payload for debugging + future field additions without code changes.
  rawPayloadJson: jsonb("raw_payload_json"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  partnerExternalUq: uniqueIndex("survey_assets_partner_external_uq").on(t.partnerId, t.externalAssetId),
}));

export const insertSurveyAssetSchema = createInsertSchema(surveyAssetsTable).omit({
  id: true, ingestedAt: true, createdAt: true, updatedAt: true, lastSyncedAt: true,
});
export type InsertSurveyAsset = z.infer<typeof insertSurveyAssetSchema>;
export type SurveyAsset = typeof surveyAssetsTable.$inferSelect;

export const SURVEY_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const SURVEY_MATERIAL_MODES = ["per_item", "global", "custom"] as const;

/**
 * Public projection — returns only fields safe for unauthenticated public consumption.
 * Strips ALL internal / A3-only fields. Per the spec, MEASUREMENTS are also
 * considered internal and are NEVER returned via /public/* — A3 ops uses them
 * for quoting; the customer only sees the photo + the approved-material picker.
 */
export function toPublicSurveyAsset(a: SurveyAsset, globalApprovedMaterials: string[]): {
  id: number;
  externalAssetId: string;
  name: string;
  description: string | null;
  category: string | null;
  venueName: string | null;
  cityName: string | null;
  publicPhotoUrl: string | null;
  publicPhotos: Array<{ url: string; caption?: string }>;
  approvedMaterials: string[];
  materialOverrideMode: string;
  publicUseCase: string | null;
} {
  let materials: string[];
  if (a.materialOverrideMode === "custom") materials = a.customApprovedMaterialsJson ?? [];
  else if (a.materialOverrideMode === "per_item") materials = a.approvedMaterialsJson ?? globalApprovedMaterials;
  else materials = globalApprovedMaterials;
  return {
    id: a.id,
    externalAssetId: a.externalAssetId,
    name: a.name,
    description: a.description,
    category: a.category,
    venueName: a.venueName,
    cityName: a.cityName,
    publicPhotoUrl: a.publicPhotoUrl,
    publicPhotos: a.publicPhotosJson ?? [],
    approvedMaterials: materials,
    materialOverrideMode: a.materialOverrideMode,
    publicUseCase: a.publicUseCase,
  };
}
