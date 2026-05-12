/**
 * Public-projection regression test (Task #5, Step 4).
 *
 * Asserts that `toPublicSurveyAsset()` strips EVERY internal / A3-only field.
 * If any new internal field is added to the schema without being explicitly
 * dropped from the projection, this test fails. Run with `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicSurveyAsset, type SurveyAsset } from "@workspace/db";

const FORBIDDEN_INTERNAL_KEYS = [
  "internalNotes",
  "installNotes",
  "productionNotes",
  "internalPricingNotes",
  "internalPhotosJson",
  "netsuiteAssetNumber",
  "netsuiteVenueNumber",
  "netsuiteItemName",
  "netsuiteItemCategory",
  "costCenter",
  "surveyorName",
  "surveyedAt",
  "rawPayloadJson",
  "approvedBy",
  "rejectedReason",
  "approvalStatus",
  "isActive",
  "customApprovedMaterialsJson",
  "approvedMaterialsJson",
  // Measurements are A3-internal (used for ops quoting only) — must not leak.
  "measurements",
  "widthIn",
  "heightIn",
  "depthIn",
  "diameterIn",
  "areaSqft",
  "shape",
] as const;

const fixture: SurveyAsset = {
  id: 1,
  partnerId: 7,
  externalAssetId: "ext-1",
  externalSurveyId: "survey-1",
  sourceApp: "venue_asset_survey",
  name: "North Lobby Banner",
  description: "Backlit banner in the north lobby.",
  category: "banner",
  venueName: "Convention Center",
  cityName: "Austin",
  publicPhotoUrl: "https://example.com/photo.jpg",
  publicPhotosJson: [{ url: "https://example.com/photo.jpg" }],
  widthIn: 96,
  heightIn: 48,
  depthIn: null,
  diameterIn: null,
  areaSqft: 32,
  shape: "rectangle",
  measurementUnit: "in",
  orientation: "landscape",
  surfaceMaterial: "drywall",
  environment: "indoor",
  zoneName: "Lobby",
  primaryApplicationsJson: null,
  recommendedApplicationsJson: null,
  alternateApplicationsJson: null,
  publicUseCase: null,
  visibilityTier: "standard",
  publicStatus: "live",
  publicDeckInclude: true,
  portalVisible: true,
  netsuiteInclude: false,
  designNeeded: false,
  commissionEligible: false,
  opsOwner: null,
  approvedMaterialsJson: ["13oz Vinyl"],
  customApprovedMaterialsJson: null,
  materialOverrideMode: "per_item",
  // INTERNAL — every value below MUST be stripped from the projection.
  internalNotes: "Lobby manager prefers afternoon installs.",
  installNotes: "Use scissor lift; 2-person team.",
  productionNotes: "Print to 13oz vinyl with grommets at 2ft.",
  internalPricingNotes: "Quote at $4.25 per sq ft, minimum 100 sq ft.",
  internalPhotosJson: [{ url: "https://internal.example/marked.jpg" }],
  netsuiteAssetNumber: "NS-A-1001",
  netsuiteVenueNumber: "NS-V-22",
  netsuiteItemName: "BANNER-LOBBY-N",
  netsuiteItemCategory: "Backlit Banners",
  costCenter: "CC-44",
  surveyorName: "Alex P.",
  surveyedAt: new Date("2025-09-01T00:00:00Z"),
  approvalStatus: "approved",
  approvedAt: new Date("2025-09-02T00:00:00Z"),
  approvedBy: "user_admin",
  rejectedReason: null,
  isActive: true,
  rawPayloadJson: { secret: "must-not-leak" },
  ingestedAt: new Date("2025-09-01T00:00:00Z"),
  lastSyncedAt: new Date("2025-09-01T00:00:00Z"),
  createdAt: new Date("2025-09-01T00:00:00Z"),
  updatedAt: new Date("2025-09-01T00:00:00Z"),
};

test("public projection has no internal/A3-only field names", () => {
  const projected = toPublicSurveyAsset(fixture, ["13oz Vinyl"]);
  const keys = Object.keys(projected);
  for (const k of FORBIDDEN_INTERNAL_KEYS) {
    assert.ok(!keys.includes(k), `Public projection leaked internal field: ${k}`);
  }
});

test("public projection has no internal/A3-only string values anywhere", () => {
  const projected = toPublicSurveyAsset(fixture, ["13oz Vinyl"]);
  const flat = JSON.stringify(projected);
  const forbiddenSubstrings = [
    "Lobby manager prefers afternoon installs.",
    "Use scissor lift",
    "13oz vinyl with grommets",
    "$4.25 per sq ft",
    "internal.example/marked.jpg",
    "NS-A-1001",
    "NS-V-22",
    "BANNER-LOBBY-N",
    "Backlit Banners",
    "CC-44",
    "Alex P.",
    "must-not-leak",
  ];
  for (const s of forbiddenSubstrings) {
    assert.ok(!flat.includes(s), `Public projection leaked internal value: ${s}`);
  }
});

test("public projection still contains expected public fields", () => {
  const projected = toPublicSurveyAsset(fixture, ["13oz Vinyl"]);
  assert.equal(projected.id, 1);
  assert.equal(projected.name, "North Lobby Banner");
  assert.equal(projected.publicPhotoUrl, "https://example.com/photo.jpg");
  assert.deepEqual(projected.approvedMaterials, ["13oz Vinyl"]);
});
