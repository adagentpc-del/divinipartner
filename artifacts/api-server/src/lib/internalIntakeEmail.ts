/**
 * Internal A3 order intake email + analysis.
 *
 * The original `renderInternalForwardHtml` template is a generic operational
 * notification — fine for partners running their own ops, but not what A3
 * itself wants in Alyssa/Shawn/Sales' inbox when a partner submits an order.
 *
 * Pass 7 brief: produce a polished, scannable email that answers the four
 * questions A3's intake desk asks every single time:
 *
 *   1. WHO is this from / who do I call?  (partner + program manager + contacts)
 *   2. WHAT is being ordered, and is it a print-only run on partner-owned
 *      hardware, or do we need to ship full units (hardware + print)?
 *   3. What's the inventory situation AFTER this order — do we still have
 *      hardware left, or did this drain the partner's stock?
 *   4. What do we need to do next, and what questions do we need to ask the
 *      partner before we can dispatch?
 *
 * This module exposes:
 *   - `buildA3IntakeAnalysis(ctx)` — pure function that derives everything
 *     above from the OrderEmailContext + DB lookups (rental/family logic,
 *     remaining inventory, follow-up questions, recommended supplier, next
 *     steps). Reused by the OrderDetail page so the admin UI shows the same
 *     analysis the email did.
 *   - `renderA3InternalIntakeHtml(ctx, analysis)` — renders that analysis
 *     into a single self-contained HTML document, brand-styled to A3 (not
 *     to the partner) so it always reads as an "internal A3 ops" email.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productFamiliesTable,
  productFamilyMembersTable,
  productCatalogTable,
  inventoryTable,
  citiesTable,
  partnerContactsTable,
  partnerEmailRecipientsTable,
  partnerBrandingLocationsTable,
  suppliersTable,
  packagesTable,
  packageItemsTable,
  ordersTable,
  type Partner,
  type Order,
  type OrderItem,
  type ProductFamily,
  type ProductFamilyMember,
  type Supplier,
} from "@workspace/db";
import type { OrderEmailContext } from "./email";
import { buildOrderEmailContext } from "./email";
import { publicLink } from "./publicUrl";

// Default A3-side salesperson when a partner has no salesperson_* fields set.
// Stored as a constant so the default can move without a data migration.
export const DEFAULT_A3_SALESPERSON = {
  name: "Alyssa DelTorre",
  email: "adeltorre@a3visual.com",
  phone: null as string | null,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ItemFulfillmentLabel =
  | "print_only_on_partner_inventory"
  | "full_unit_required"
  | "print_only_no_hardware_link"
  | "hardware_supplied_in_order"
  | "rental_asset"
  | "addon_or_misc"
  | "unknown";

// Inventory provenance for a line item — what stock pool A3 ops should
// pull from when fulfilling. Deterministic, derived from the order's
// fulfillment_mode, reservedQuantity and partner inventory state. Used by
// the PM intake email so NetSuite quoting knows whether to invoice for
// hardware or just the print run.
// Quote type taxonomy used by NetSuite quoting language (PM packet).
// Derived deterministically from the order's items + packages composition.
export type PmQuoteType =
  | "Package"
  | "Individual Items"
  | "Package + Add-Ons"
  | "Rental"
  | "Production"
  | "Mixed";

export type InventorySourceLabel =
  | "customer_stock"        // partner-supplied stock — A3 prints only
  | "partner_stock"         // partner's reusable inventory (was their hardware)
  | "a3_stock"              // A3-owned reusable inventory
  | "third_party"           // ship from an outside supplier (e.g. dropship)
  | "produce_new"           // brand-new production run (no existing stock)
  | "confirm_manually";     // ambiguous — flag in the PM packet

export interface IntakeItemAnalysis {
  itemId: number;
  itemName: string;
  quantity: number;
  productSlug: string | null;
  productImageUrl: string | null;
  productSku: string | null;
  productCategory: string | null;
  // Family / role context (null if the product is not part of any family).
  familyId: number | null;
  familyName: string | null;
  memberRole: "hardware" | "component" | "accessory" | null;
  // Order item type ("regular" | "addon" | "branding_zone" | "rental" …)
  // and parent package linkage — both needed by deriveQuoteType so the PM
  // packet renders the correct NetSuite quoting category.
  itemType: string;
  packageId: number | null;
  // Resolved fulfillment intent.
  label: ItemFulfillmentLabel;
  fulfillmentMode: string | null;
  // Hardware / inventory snapshot.
  hardwareUnitsNeeded: number; // how many partner hardware units this consumes
  reservedFromInventoryQty: number;
  shortageQty: number;
  inventorySource: {
    cityName: string | null;
    inventoryName: string | null;
    onHandBefore: number | null;
    onHandAfter: number | null;
  } | null;
  // Deterministic provenance label rendered as a chip in the PM packet.
  inventorySourceLabel: InventorySourceLabel;
  // Physical dimensions / artwork / hardware / material — everything PM
  // needs to build the NetSuite quote line without opening the order.
  dimensions: {
    enteredWidth: number | null;
    enteredHeight: number | null;
    enteredDepth: number | null;
    sizeUnit: string | null;
    packedW: number | null;
    packedH: number | null;
    packedD: number | null;
    packedUnit: string | null;
  };
  artwork: {
    fileUrl: string | null;
    needed: boolean;
  };
  selectedMaterial: string | null;
  hardwareSummary: string | null; // e.g. "2 frames + base"; null when n/a
  // Per-line inventory accounting: explicit requested vs available vs
  // remaining-after, plus deterministic warnings (over-allocated, unknown
  // source, produce-new path) so PM doesn't have to compute these by hand.
  inventoryQty: {
    requested: number;
    available: number | null;     // null when source is produce_new / unknown
    reservedFromInventory: number;
    remainingAfter: number | null; // null when source is produce_new / unknown
    warnings: string[];           // e.g. "over-allocated", "no source", "shortage 3"
  };
  vendor: {
    supplierId: number | null;
    supplierName: string | null;
    matchSource: "order_assigned" | "product_default" | "branding_location_default" | "scored" | "none";
    matchScore: number | null;
    matchReasons: string[];        // why this supplier won (or "no candidates")
  };
  // Per-line human note rendered in the email + UI.
  note: string;
  // Task #5: when this order line is tied to a venue survey asset, A3 ops
  // gets a richer per-line block (measurements, selected material, internal
  // install/production notes, NetSuite asset & venue numbers).
  surveyAsset: {
    id: number;
    externalAssetId: string;
    name: string;
    venueName: string | null;
    cityName: string | null;
    selectedMaterial: string | null;
    measurements: {
      widthIn: number | null; heightIn: number | null; depthIn: number | null;
      areaSqft: number | null; shape: string | null;
      measurementUnit: string | null; orientation: string | null;
    };
    surfaceMaterial: string | null;
    environment: string | null;
    zoneName: string | null;
    recommendedApplications: string[];
    alternateApplications: string[];
    visibilityTier: string | null;
    publicStatus: string | null;
    designNeeded: boolean;
    commissionEligible: boolean;
    opsOwner: string | null;
    internalNotes: string | null;
    installNotes: string | null;
    productionNotes: string | null;
    pricingNotes: string | null;
    internalPhotos: Array<{ url: string; caption?: string }>;
    netsuiteAssetNumber: string | null;
    netsuiteVenueNumber: string | null;
    netsuiteItemName: string | null;
    netsuiteItemCategory: string | null;
  } | null;
}

export interface IntakeFamilyRemaining {
  familyId: number;
  familyName: string;
  hardwareProductName: string | null;
  totalOwned: number;
  reservedNow: number;
  availableAfterThisOrder: number;
  status: "ok" | "low" | "depleted";
  perCity: Array<{ cityName: string; onHand: number; reservedAfter: number; remaining: number }>;
}

export interface IntakeContact {
  label: string;       // "Program manager", "Account owner", ...
  name: string | null;
  email: string | null;
  source: "partner_field" | "partner_contact" | "recipient_role";
}

// Top-of-email NetSuite Quote Entry Summary — single discrete block A3 ops
// uses as a "quote-entry packet". Combines customer/billing/contact +
// salesperson + quote-type + NetSuite customer #.
export interface IntakeNetsuiteSummary {
  quoteType: PmQuoteType;
  netsuiteCustomerNumber: string | null;
  partnerName: string;
  customerCompany: string | null;
  customerContactName: string;
  customerContactEmail: string;
  customerContactPhone: string | null;
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactPhone: string | null;
  billingTerms: string | null;
  salespersonName: string;
  salespersonEmail: string;
  salespersonPhone: string | null;
  totalLines: number;
  totalQuantity: number;
}

// ----- PM Intake packet types ------------------------------------------------
// Task #27: the internal ops email is upgraded into a full Project Manager
// intake packet that NetSuite quoting can use without opening the portal.

export interface IntakeCustomerBlock {
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  companyName: string | null;
}

export interface IntakeBillingBlock {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  paymentModel: string | null;
  paymentTerms: string | null;
  netsuiteCustomerNumber: string | null;
}

export interface IntakeEventBlock {
  eventName: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  installDate: string | null;
  teardownDate: string | null;
  shippingDeadline: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueContacts: Array<{ name: string; email?: string | null; phone?: string | null; role?: string | null }>;
}

export interface IntakePackageBlock {
  packageId: number;
  packageName: string;
  packageDescription: string | null;
  packageImageUrl: string | null;
  // Order items grouped under this package (matched by orderItem.packageId).
  itemIds: number[];
}

export interface IntakeVendorMatch {
  supplierId: number;
  supplierName: string;
  itemIds: number[];
  matchSources: Array<"order_assigned" | "product_default" | "branding_location_default" | "scored">;
  // Best (max) deterministic score among the lines this supplier matched on.
  // Null when supplier was resolved purely by fallback chain.
  bestMatchScore: number | null;
  matchReasons: string[]; // de-duplicated reasons across all lines
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  leadTimeDays: number | null;
  categories: string[];
  city: string | null;
  country: string | null;
  isActive: boolean;
  lineSummaries: Array<{
    itemId: number;
    itemName: string;
    quantity: number;
    sku: string | null;
    productCategory: string | null;
    dimensions: string | null;
    material: string | null;
    productLeadTimeDays: number | null;
  }>;
}

export interface IntakeFile {
  url: string;
  name: string;
  kind: "artwork" | "product_image" | "survey_photo";
  contextLabel: string | null; // e.g. "Line: SureBoard 24x36" or "Asset #123"
}

export interface IntakeMissingField {
  field: string;
  severity: "critical" | "warning";
  reason: string;
}

export interface IntakeChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string | null;
}

export interface IntakeAnalysis {
  // Header summary
  orderType: "print_only" | "full_unit" | "mixed" | "rental" | "other";
  orderTypeReason: string;
  // Quote type is derived from orderType for NetSuite quoting language.
  quoteType: PmQuoteType;
  netsuiteCustomerNumber: string | null;
  // People
  salesperson: IntakeContact;            // always present (defaults to Alyssa DelTorre)
  programManager: IntakeContact | null;
  accountOwner: IntakeContact | null;
  supportContact: IntakeContact | null;
  partnerContacts: IntakeContact[]; // primary, billing, graphic_designer, onsite, project, other
  opsRecipients: string[];
  // PM packet blocks
  netsuiteSummary: IntakeNetsuiteSummary;
  customer: IntakeCustomerBlock;
  billing: IntakeBillingBlock;
  event: IntakeEventBlock;
  packages: IntakePackageBlock[];
  // Per-item + remaining
  items: IntakeItemAnalysis[];
  familiesRemaining: IntakeFamilyRemaining[];
  // Deterministic vendor matches (one row per distinct supplier).
  vendorMatches: IntakeVendorMatch[];
  // All file links bundled for the packet.
  files: IntakeFile[];
  // Missing-info warning block.
  missingFields: IntakeMissingField[];
  // PM checklist for handoff into NetSuite quoting.
  pmChecklist: IntakeChecklistItem[];
  // Workflow guidance
  recommendedSupplierName: string | null;
  followUpQuestions: string[];
  nextSteps: string[];
  readinessLabel: "ready_to_dispatch" | "needs_clarification" | "needs_artwork" | "blocked_inventory";
  readinessReason: string;
}

// ---------------------------------------------------------------------------
// Analysis builder
// ---------------------------------------------------------------------------

export async function buildA3IntakeAnalysis(ctx: OrderEmailContext): Promise<IntakeAnalysis> {
  const { partner, order, items } = ctx;

  // 1) Resolve product / family / member context for every line.
  const productIds = Array.from(new Set(items.map(i => i.productId).filter((v): v is number => !!v)));
  const products = productIds.length
    ? await db.select().from(productCatalogTable).where(inArray(productCatalogTable.id, productIds))
    : [];
  const productById = new Map(products.map(p => [p.id, p]));

  const memberRows = productIds.length
    ? await db
        .select({
          fam: productFamiliesTable,
          member: productFamilyMembersTable,
        })
        .from(productFamilyMembersTable)
        .innerJoin(productFamiliesTable, eq(productFamilyMembersTable.familyId, productFamiliesTable.id))
        .where(inArray(productFamilyMembersTable.productId, productIds))
    : [];
  const familyByProduct = new Map<number, { fam: ProductFamily; member: ProductFamilyMember }>();
  for (const r of memberRows) familyByProduct.set(r.member.productId, r);

  // 2) Build partner contacts directory.
  const contacts = await db
    .select()
    .from(partnerContactsTable)
    .where(and(eq(partnerContactsTable.partnerId, partner.id), eq(partnerContactsTable.isActive, true)));

  const partnerContactsOut: IntakeContact[] = contacts
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
    .map(c => ({
      label: humanizeContactRole(c.role) + (c.isPrimary ? " (primary)" : ""),
      name: c.fullName || null,
      email: c.email || null,
      source: "partner_contact" as const,
    }));

  // Program manager / account owner / support: prefer partner-level columns
  // (these are the explicitly-named A3-side pointers), then fall back to
  // matching partner_contact rows so a partner that uses contacts instead
  // of the dedicated fields still resolves cleanly.
  // Task #27: When no PM / account owner is named for the partner, fall back
  // to the default A3 salesperson (Alyssa DelTorre) so internal email + intake
  // panel always have a real human to point at instead of "—".
  const programManager = pickContact(
    "Program manager",
    partner.programManagerName,
    partner.programManagerEmail,
    contacts.find(c => c.role === "project" && c.isPrimary) ?? contacts.find(c => c.role === "project") ?? null,
  ) ?? { label: "Program manager", name: DEFAULT_A3_SALESPERSON.name, email: DEFAULT_A3_SALESPERSON.email, source: "partner_field" as const };
  const accountOwner = pickContact(
    "A3 account owner",
    partner.internalAccountOwnerName,
    partner.internalAccountOwnerEmail,
    null,
  ) ?? { label: "A3 account owner", name: DEFAULT_A3_SALESPERSON.name, email: DEFAULT_A3_SALESPERSON.email, source: "partner_field" as const };
  const supportContact = pickContact(
    "Support contact",
    partner.supportContactName,
    partner.supportContactEmail,
    contacts.find(c => c.role === "support" && c.isPrimary) ?? contacts.find(c => c.role === "support") ?? null,
  );

  // 3) Active ops recipients (so the email can show "you got this because…").
  const opsRows = await db
    .select()
    .from(partnerEmailRecipientsTable)
    .where(and(
      eq(partnerEmailRecipientsTable.partnerId, partner.id),
      eq(partnerEmailRecipientsTable.isActive, true),
      eq(partnerEmailRecipientsTable.role, "ops"),
    ));
  const opsRecipients = opsRows.map(r => r.email).filter(Boolean);
  if (opsRecipients.length === 0) {
    if (partner.internalForwardEmail) opsRecipients.push(partner.internalForwardEmail);
    if (partner.routingEmail) opsRecipients.push(partner.routingEmail);
  }

  // 4a) Resolve any linked Venue Asset Survey records for these items
  // (Task #5). One round-trip lookup; orphans tolerated (asset deleted but
  // order line preserved).
  const surveyIds = Array.from(new Set(items.map(i => i.surveyAssetId).filter((v): v is number => typeof v === "number")));
  const { loadSurveyAssetsByIdsForPartner } = await import("../routes/surveyIntegration");
  // Partner-scoped: even if a stale order line points at an asset that now
  // belongs to a different partner, we never surface the foreign asset's
  // internal data in this partner's intake.
  const surveyById = await loadSurveyAssetsByIdsForPartner(surveyIds, partner.id);

  // 4) Per-item analysis.
  const itemsOut: IntakeItemAnalysis[] = [];
  // Map of inventoryId → cumulative reservedQty in this order, so when the
  // same inventory row is hit twice we report the *post-order* on-hand only
  // once at the family-rollup level.
  const reservedByInventoryId = new Map<number, number>();

  for (const it of items) {
    const product = it.productId ? productById.get(it.productId) : null;
    const fam = it.productId ? familyByProduct.get(it.productId) : undefined;
    const role = fam?.member.role as IntakeItemAnalysis["memberRole"] | undefined;
    const familyId = fam?.fam.id ?? null;
    const familyName = fam?.fam.name ?? null;

    // Resolve inventory source if this line reserved partner inventory.
    let invSnap: IntakeItemAnalysis["inventorySource"] = null;
    if (it.inventorySourceInventoryId) {
      const [invRow] = await db
        .select({
          id: inventoryTable.id,
          name: inventoryTable.name,
          hardwareOnHand: inventoryTable.hardwareOnHand,
          cityName: citiesTable.name,
          productName: productCatalogTable.name,
        })
        .from(inventoryTable)
        .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
        .leftJoin(productCatalogTable, eq(inventoryTable.productId, productCatalogTable.id))
        .where(eq(inventoryTable.id, it.inventorySourceInventoryId));
      if (invRow) {
        const reservedSoFar = reservedByInventoryId.get(invRow.id) ?? 0;
        const reservedNow = reservedSoFar + (it.reservedQuantity ?? 0);
        reservedByInventoryId.set(invRow.id, reservedNow);
        invSnap = {
          cityName: invRow.cityName,
          inventoryName: invRow.name || invRow.productName,
          onHandBefore: invRow.hardwareOnHand,
          onHandAfter: Math.max(0, (invRow.hardwareOnHand ?? 0) - reservedNow),
        };
      }
    }

    // Derive label.
    const label = deriveItemLabel({
      itemType: it.itemType,
      productAssetType: (product as { assetType?: string | null } | undefined)?.assetType ?? null,
      memberRole: role ?? null,
      fulfillmentMode: it.fulfillmentMode,
      reservedQuantity: it.reservedQuantity ?? 0,
      hardwareDemand: it.hardwareDemandQuantity ?? 0,
      printDemand: it.printDemandQuantity ?? 0,
    });

    const inventorySourceLabel = deriveInventorySourceLabel(label, it);
    const hardwareSummary = deriveHardwareSummary(label, it, fam);
    itemsOut.push({
      itemId: it.id,
      itemName: it.name,
      quantity: it.quantity,
      productSlug: product?.slug ?? null,
      productImageUrl: product?.imageUrl ?? null,
      productSku: product?.sku ?? null,
      productCategory: product?.category ?? null,
      familyId,
      familyName,
      memberRole: role ?? null,
      itemType: it.itemType,
      packageId: it.packageId ?? null,
      label,
      fulfillmentMode: it.fulfillmentMode ?? null,
      hardwareUnitsNeeded: it.hardwareDemandQuantity ?? 0,
      reservedFromInventoryQty: it.reservedQuantity ?? 0,
      shortageQty: it.shortageQuantity ?? 0,
      inventorySource: invSnap,
      inventorySourceLabel,
      dimensions: {
        enteredWidth: it.enteredWidth ?? null,
        enteredHeight: it.enteredHeight ?? null,
        enteredDepth: null,
        sizeUnit: it.enteredSizeUnit ?? null,
        packedW: it.packedWidth ?? null,
        packedH: it.packedHeight ?? null,
        packedD: it.packedDepth ?? null,
        packedUnit: it.packedSizeUnit ?? null,
      },
      artwork: {
        fileUrl: it.artworkFileUrl ?? null,
        needed: !!it.artworkRequired && !it.artworkFileUrl,
      },
      selectedMaterial: it.selectedMaterial ?? null,
      hardwareSummary,
      inventoryQty: deriveInventoryQty(it, inventorySourceLabel, invSnap),
      vendor: { supplierId: null, supplierName: null, matchSource: "none", matchScore: null, matchReasons: [] }, // resolved below
      note: itemNote(label, it, fam, invSnap),
      surveyAsset: (() => {
        const sId = it.surveyAssetId;
        const s = sId ? surveyById.get(sId) : null;
        if (!s) return null;
        return {
          id: s.id,
          externalAssetId: s.externalAssetId,
          name: s.name,
          venueName: s.venueName,
          cityName: s.cityName,
          selectedMaterial: it.selectedMaterial ?? null,
          measurements: {
            widthIn: s.widthIn, heightIn: s.heightIn, depthIn: s.depthIn,
            areaSqft: s.areaSqft, shape: s.shape,
            measurementUnit: s.measurementUnit, orientation: s.orientation,
          },
          surfaceMaterial: s.surfaceMaterial,
          environment: s.environment,
          zoneName: s.zoneName,
          recommendedApplications: s.recommendedApplicationsJson ?? [],
          alternateApplications: s.alternateApplicationsJson ?? [],
          visibilityTier: s.visibilityTier,
          publicStatus: s.publicStatus,
          designNeeded: s.designNeeded,
          commissionEligible: s.commissionEligible,
          opsOwner: s.opsOwner,
          internalNotes: s.internalNotes,
          installNotes: s.installNotes,
          productionNotes: s.productionNotes,
          pricingNotes: s.internalPricingNotes,
          internalPhotos: s.internalPhotosJson ?? [],
          netsuiteAssetNumber: s.netsuiteAssetNumber,
          netsuiteVenueNumber: s.netsuiteVenueNumber,
          netsuiteItemName: s.netsuiteItemName,
          netsuiteItemCategory: s.netsuiteItemCategory,
        };
      })(),
    });
  }

  // 5) Roll up remaining inventory per family (across all cities for the partner).
  const familiesTouched = new Set<number>();
  for (const it of itemsOut) if (it.familyId) familiesTouched.add(it.familyId);
  const familiesRemaining: IntakeFamilyRemaining[] = [];
  for (const familyId of familiesTouched) {
    const remaining = await rollupFamilyRemaining(partner.id, familyId, items);
    if (remaining) familiesRemaining.push(remaining);
  }

  // 6) Recommended supplier (for display purposes).
  let recommendedSupplierName: string | null = null;
  if (order.assignedSupplierId) {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.assignedSupplierId));
    if (s) recommendedSupplierName = s.name;
  }

  // 6b) Deterministic vendor matching for PM packet. Resolution order per
  // line: assignedSupplierId on the order → product.supplierId → branding
  // location's defaultSupplierId. Lines with no resolution are surfaced in
  // the missing-info block. NO AI is involved — all data-driven.
  const branchingLocIds = Array.from(new Set(items.map(i => i.brandingZoneId).filter((v): v is number => !!v)));
  const branchingLocs = branchingLocIds.length
    ? await db.select().from(partnerBrandingLocationsTable).where(inArray(partnerBrandingLocationsTable.id, branchingLocIds))
    : [];
  const branchingLocById = new Map(branchingLocs.map(b => [b.id, b]));

  const allSupplierIds = new Set<number>();
  if (order.assignedSupplierId) allSupplierIds.add(order.assignedSupplierId);
  for (const p of products) if (p.supplierId) allSupplierIds.add(p.supplierId);
  for (const b of branchingLocs) if (b.defaultSupplierId) allSupplierIds.add(b.defaultSupplierId);
  const supplierRows = allSupplierIds.size
    ? await db.select().from(suppliersTable).where(inArray(suppliersTable.id, Array.from(allSupplierIds)))
    : [];
  const supplierById = new Map(supplierRows.map(s => [s.id, s]));

  // Pull every active supplier on the platform once for the deterministic
  // scoring fallback (see scoreSupplierForLine). Bounded by isActive=true so
  // we never propose retired vendors.
  const allActiveSuppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
  for (const s of allActiveSuppliers) if (!supplierById.has(s.id)) supplierById.set(s.id, s);

  const eventCity = ctx.venue?.city ?? null;
  const eventCountry = ctx.venue?.country ?? null;
  // Partner-preference signal: any supplier already explicitly assigned by
  // this partner on prior orders (assignedSupplierId) wins a soft tiebreaker
  // in the scoring fallback. Computed once per analysis call.
  const partnerPreferredSupplierIds = await loadPartnerPreferredSupplierIds(partner.id);

  const vendorAccum = new Map<number, IntakeVendorMatch>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const out = itemsOut[i];
    let supplierId: number | null = null;
    let matchSource: IntakeItemAnalysis["vendor"]["matchSource"] = "none";
    let matchScore: number | null = null;
    let matchReasons: string[] = [];
    if (order.assignedSupplierId) {
      supplierId = order.assignedSupplierId;
      matchSource = "order_assigned";
      matchReasons = ["assigned on the order"];
    } else if (it.productId && productById.get(it.productId)) {
      const ps = productById.get(it.productId)?.supplierId;
      if (ps) { supplierId = ps; matchSource = "product_default"; matchReasons = ["product default supplier"]; }
    }
    if (!supplierId && it.brandingZoneId) {
      const bl = branchingLocById.get(it.brandingZoneId);
      if (bl?.defaultSupplierId) { supplierId = bl.defaultSupplierId; matchSource = "branding_location_default"; matchReasons = ["branding location default supplier"]; }
    }
    if (!supplierId) {
      const product = it.productId ? productById.get(it.productId) : undefined;
      const scored = scoreSupplierCandidates(allActiveSuppliers, {
        product,
        material: out.selectedMaterial,
        widthIn: out.dimensions.enteredWidth,
        heightIn: out.dimensions.enteredHeight,
        eventCity,
        eventCountry,
        partnerPreferredSupplierIds,
      });
      if (scored && scored.score > 0) {
        supplierId = scored.supplier.id;
        matchSource = "scored";
        matchScore = scored.score;
        matchReasons = scored.reasons;
      } else {
        matchReasons = scored ? ["no positive scoring match"] : ["no active supplier candidates"];
      }
    }
    const supplier = supplierId ? supplierById.get(supplierId) : undefined;
    const supplierName = supplier?.name ?? null;
    out.vendor = { supplierId, supplierName, matchSource, matchScore, matchReasons };
    if (supplierId && supplierName && supplier) {
      const product = it.productId ? productById.get(it.productId) : undefined;
      const d = out.dimensions;
      let dims: string | null = null;
      if (d.enteredWidth != null && d.enteredHeight != null) {
        dims = `${d.enteredWidth} × ${d.enteredHeight} ${d.sizeUnit || "in"}`;
      } else if (d.packedW != null && d.packedH != null) {
        dims = `packed ${d.packedW} × ${d.packedH}${d.packedD != null ? ` × ${d.packedD}` : ""} ${d.packedUnit || "in"}`;
      }
      const lineSummary = {
        itemId: out.itemId,
        itemName: out.itemName,
        quantity: out.quantity,
        sku: product?.sku ?? null,
        productCategory: product?.category ?? null,
        dimensions: dims,
        material: out.selectedMaterial,
        productLeadTimeDays: product?.leadTimeDays ?? null,
      };
      const cur = vendorAccum.get(supplierId);
      if (cur) {
        cur.itemIds.push(out.itemId);
        cur.lineSummaries.push(lineSummary);
        if (matchSource !== "none" && matchSource !== "scored" && !cur.matchSources.includes(matchSource)) cur.matchSources.push(matchSource);
        if (matchSource === "scored" && !cur.matchSources.includes("scored")) cur.matchSources.push("scored");
        if (matchScore != null && (cur.bestMatchScore == null || matchScore > cur.bestMatchScore)) cur.bestMatchScore = matchScore;
        for (const r of matchReasons) if (!cur.matchReasons.includes(r)) cur.matchReasons.push(r);
      } else {
        vendorAccum.set(supplierId, {
          supplierId, supplierName,
          itemIds: [out.itemId],
          matchSources: matchSource === "none" ? [] : [matchSource],
          bestMatchScore: matchScore,
          matchReasons: [...matchReasons],
          contactName: supplier.contactName ?? null,
          contactEmail: supplier.contactEmail ?? null,
          contactPhone: supplier.contactPhone ?? null,
          leadTimeDays: supplier.defaultLeadTimeDays ?? null,
          categories: supplier.categoriesJson ?? [],
          city: supplier.city ?? null,
          country: supplier.country ?? null,
          isActive: supplier.isActive,
          lineSummaries: [lineSummary],
        });
      }
    }
  }
  const vendorMatches = Array.from(vendorAccum.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  // 6c) Package grouping — load packages referenced by the order or its items.
  const packageIds = Array.from(new Set([
    order.packageId,
    ...items.map(i => i.packageId),
  ].filter((v): v is number => !!v)));
  const packageRows = packageIds.length
    ? await db.select().from(packagesTable).where(inArray(packagesTable.id, packageIds))
    : [];
  const packagesOut: IntakePackageBlock[] = packageRows.map(pkg => ({
    packageId: pkg.id,
    packageName: pkg.displayName || pkg.name,
    packageDescription: pkg.description ?? null,
    packageImageUrl: pkg.imageUrl ?? (pkg.imageUrls && pkg.imageUrls[0]) ?? null,
    itemIds: items.filter(i => i.packageId === pkg.id).map(i => i.id),
  }));

  // 6d) Customer / billing / event blocks.
  const customer: IntakeCustomerBlock = {
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone ?? null,
    companyName: order.companyName ?? null,
  };
  const bj = order.billingContactJson || {};
  const ba = order.billingAddressJson || null;
  const billingAddrLine = ba ? [ba.line1, ba.line2, ba.city, ba.state, ba.postalCode, ba.country].filter(Boolean).join(", ") : null;
  const billing: IntakeBillingBlock = {
    contactName: bj.name || partner.billingContactName || null,
    contactEmail: bj.email || partner.billingContactEmail || null,
    contactPhone: bj.phone || partner.billingContactPhone || null,
    addressLine: billingAddrLine,
    paymentModel: order.paymentModel ?? null,
    paymentTerms: partner.paymentTerms ?? null,
    netsuiteCustomerNumber: partner.netsuiteCustomerNumber || null,
  };
  const vRow = ctx.venueRow ?? null;
  const eRow = ctx.eventRow ?? null;
  const venueAddr = vRow
    ? [vRow.venueAddress, ctx.venue?.city, ctx.venue?.country].filter(Boolean).join(", ")
    : ctx.venue
      ? [ctx.venue.city, ctx.venue.country].filter(Boolean).join(", ")
      : null;
  const eventBlock: IntakeEventBlock = {
    eventName: eRow?.name ?? ctx.event?.name ?? null,
    eventStartDate: eRow?.eventStartDate ?? null,
    eventEndDate: eRow?.eventEndDate ?? null,
    installDate: eRow?.installDate ?? null,
    teardownDate: eRow?.teardownDate ?? null,
    shippingDeadline: eRow?.shippingDeadline ?? null,
    venueName: vRow?.name ?? ctx.venue?.name ?? null,
    venueAddress: venueAddr || null,
    venueContacts: eRow?.venueContactsJson ?? [],
  };

  const files: IntakeFile[] = [];
  for (const f of order.artworkFilesJson ?? []) {
    if (f?.url) files.push({ url: f.url, name: f.name || f.url.split("/").pop() || "artwork", kind: "artwork", contextLabel: "Order-level artwork" });
  }
  for (const it of itemsOut) {
    if (it.artwork.fileUrl) {
      files.push({ url: it.artwork.fileUrl, name: it.artwork.fileUrl.split("/").pop() || "artwork", kind: "artwork", contextLabel: `Line: ${it.itemName}` });
    }
  }
  for (const p of products) {
    if (p.imageUrl) files.push({ url: p.imageUrl, name: `${p.name} reference`, kind: "product_image", contextLabel: `Product: ${p.name}` });
  }
  for (const it of itemsOut) {
    if (it.surveyAsset) {
      for (const ph of it.surveyAsset.internalPhotos) {
        files.push({ url: ph.url, name: ph.caption || `survey-${it.surveyAsset.id}`, kind: "survey_photo", contextLabel: `Survey asset #${it.surveyAsset.id}` });
      }
    }
  }

  const salesperson: IntakeContact = {
    label: "Salesperson",
    name: partner.salespersonName || DEFAULT_A3_SALESPERSON.name,
    email: partner.salespersonEmail || DEFAULT_A3_SALESPERSON.email,
    source: "partner_field",
  };

  // 7) Follow-up questions + next steps + readiness label.
  const orderTypeInfo = classifyOrderType(itemsOut);
  const followUps = buildFollowUpQuestions(ctx, itemsOut, partner);
  const nextSteps = buildNextSteps(ctx, itemsOut, familiesRemaining, recommendedSupplierName);
  const readiness = computeReadiness(ctx, itemsOut, familiesRemaining, followUps);
  const missingFields = buildMissingFields(ctx, itemsOut, partner, vendorMatches);
  const pmChecklist = buildPmChecklist(ctx, itemsOut, partner, files, vendorMatches, missingFields);
  const quoteType = deriveQuoteType(itemsOut);

  const netsuiteSummary: IntakeNetsuiteSummary = {
    quoteType,
    netsuiteCustomerNumber: partner.netsuiteCustomerNumber || null,
    partnerName: partner.companyName,
    customerCompany: customer.companyName,
    customerContactName: customer.contactName,
    customerContactEmail: customer.contactEmail,
    customerContactPhone: customer.contactPhone,
    billingContactName: billing.contactName,
    billingContactEmail: billing.contactEmail,
    billingContactPhone: billing.contactPhone,
    billingTerms: billing.paymentTerms,
    salespersonName: salesperson.name || DEFAULT_A3_SALESPERSON.name,
    salespersonEmail: salesperson.email || DEFAULT_A3_SALESPERSON.email,
    salespersonPhone: partner.salespersonPhone || DEFAULT_A3_SALESPERSON.phone,
    totalLines: itemsOut.length,
    totalQuantity: itemsOut.reduce((sum, i) => sum + (i.quantity || 0), 0),
  };

  return {
    orderType: orderTypeInfo.type,
    orderTypeReason: orderTypeInfo.reason,
    quoteType,
    netsuiteCustomerNumber: partner.netsuiteCustomerNumber || null,
    salesperson,
    programManager,
    accountOwner,
    supportContact,
    partnerContacts: partnerContactsOut,
    opsRecipients,
    netsuiteSummary,
    customer,
    billing,
    event: eventBlock,
    packages: packagesOut,
    items: itemsOut,
    familiesRemaining,
    vendorMatches,
    files,
    missingFields,
    pmChecklist,
    recommendedSupplierName,
    followUpQuestions: followUps,
    nextSteps,
    readinessLabel: readiness.label,
    readinessReason: readiness.reason,
  };
}

// Single shared entry point used by both the email render path and the
// admin Intake Panel API endpoint, so they can never drift. Returns null
// when the order id doesn't resolve.
export async function buildInternalOrderEmailData(orderId: number): Promise<{
  ctx: OrderEmailContext;
  analysis: IntakeAnalysis;
  html: string;
} | null> {
  const ctx = await buildOrderEmailContext(orderId);
  if (!ctx) return null;
  const analysis = await buildA3IntakeAnalysis(ctx);
  const html = renderA3InternalIntakeHtml(ctx, analysis);
  return { ctx, analysis, html };
}

// Compute the per-line inventory accounting block (requested vs available
// vs remaining-after) plus deterministic warning strings. Pure function of
// already-resolved values — no extra DB hits.
function deriveInventoryQty(
  it: OrderItem,
  label: InventorySourceLabel,
  invSnap: IntakeItemAnalysis["inventorySource"],
): IntakeItemAnalysis["inventoryQty"] {
  const requested = it.quantity ?? 0;
  const reserved = it.reservedQuantity ?? 0;
  const shortage = it.shortageQuantity ?? 0;
  const warnings: string[] = [];
  let available: number | null = null;
  let remainingAfter: number | null = null;

  if (label === "produce_new" || label === "third_party") {
    // No existing stock involved — produce-new pathway.
    warnings.push(label === "produce_new" ? "produce-new run" : "ships from outside supplier");
  } else if (label === "confirm_manually") {
    warnings.push("inventory source unknown — confirm manually");
  } else if (invSnap) {
    available = invSnap.onHandBefore ?? null;
    remainingAfter = invSnap.onHandAfter ?? null;
    if (available != null && reserved > available) warnings.push(`over-allocated by ${reserved - available}`);
    if (remainingAfter != null && remainingAfter === 0) warnings.push("depletes this inventory pool");
  } else if (label === "partner_stock" || label === "a3_stock") {
    warnings.push("no inventory pool linked — confirm source");
  }
  if (shortage > 0) warnings.push(`shortage of ${shortage}`);

  return { requested, available, reservedFromInventory: reserved, remainingAfter, warnings };
}

// Soft tiebreaker signal: which suppliers has this partner explicitly
// assigned on past orders? Returns at most ~20 supplier ids.
async function loadPartnerPreferredSupplierIds(partnerId: number): Promise<Set<number>> {
  const rows = await db
    .select({ id: ordersTable.assignedSupplierId })
    .from(ordersTable)
    .where(and(eq(ordersTable.partnerId, partnerId), isNotNull(ordersTable.assignedSupplierId)))
    .limit(200);
  const out = new Set<number>();
  for (const r of rows) if (r.id != null) out.add(r.id);
  return out;
}

// Fully deterministic supplier scoring used as a fallback when no order /
// product / branding-location default supplier is set. Higher score = better
// fit. Score is a sum of weighted signals — no AI, no randomness, fully
// reproducible. Returns the top supplier (or null when no candidates).
function scoreSupplierCandidates(
  candidates: Supplier[],
  ctx: {
    product: { category?: string | null } | undefined;
    material: string | null;
    widthIn: number | null;
    heightIn: number | null;
    eventCity: string | null;
    eventCountry: string | null;
    partnerPreferredSupplierIds: Set<number>;
  },
): { supplier: Supplier; score: number; reasons: string[] } | null {
  if (candidates.length === 0) return null;
  let best: { supplier: Supplier; score: number; reasons: string[] } | null = null;
  const targetCat = (ctx.product?.category ?? "").toLowerCase().trim();
  const targetMat = (ctx.material ?? "").toLowerCase().trim();
  const targetCity = (ctx.eventCity ?? "").toLowerCase().trim();
  const targetCountry = (ctx.eventCountry ?? "").toLowerCase().trim();
  const maxDim = Math.max(ctx.widthIn ?? 0, ctx.heightIn ?? 0);

  for (const s of candidates) {
    if (!s.isActive) continue;
    let score = 0;
    const reasons: string[] = [];
    const cats = (s.categoriesJson ?? []).map(c => String(c).toLowerCase());
    if (targetCat && cats.some(c => c === targetCat)) { score += 40; reasons.push(`category match: ${targetCat}`); }
    else if (targetCat && cats.some(c => c.includes(targetCat) || targetCat.includes(c))) { score += 20; reasons.push(`category partial: ${targetCat}`); }
    if (targetMat && cats.some(c => c.includes(targetMat))) { score += 20; reasons.push(`material capability: ${targetMat}`); }
    if (maxDim > 0) {
      const maxW = (s as Supplier & { maxWidthIn?: number | null }).maxWidthIn ?? null;
      const maxH = (s as Supplier & { maxHeightIn?: number | null }).maxHeightIn ?? null;
      const supMax = Math.max(maxW ?? 0, maxH ?? 0);
      if (supMax > 0 && maxDim <= supMax) { score += 15; reasons.push(`fits ${maxDim}" within supplier max ${supMax}"`); }
      else if (supMax > 0 && maxDim > supMax) { score -= 30; reasons.push(`exceeds supplier max ${supMax}"`); }
    }
    if (targetCity && (s.city ?? "").toLowerCase() === targetCity) { score += 12; reasons.push(`local to ${targetCity}`); }
    else if (targetCountry && (s.country ?? "").toLowerCase() === targetCountry) { score += 6; reasons.push(`in-country: ${targetCountry}`); }
    if (ctx.partnerPreferredSupplierIds.has(s.id)) { score += 8; reasons.push("partner has used this supplier before"); }
    if (s.defaultLeadTimeDays != null && s.defaultLeadTimeDays <= 7) { score += 3; reasons.push(`fast lead time ${s.defaultLeadTimeDays}d`); }
    if (!best || score > best.score) best = { supplier: s, score, reasons };
  }
  return best;
}

// Deterministic PM quote-type derivation. Categories are independent and
// counted from the items themselves: rental (asset hold), production (new
// fabrication via produce_new), package-bound (items tied to a package),
// add-ons (line-level extras), and individual items (everything else).
// Single category → that category. Packages + add-ons → Package + Add-Ons.
// Anything else with two or more categories present → Mixed.
function deriveQuoteType(items: IntakeItemAnalysis[]): PmQuoteType {
  if (!items.length) return "Individual Items";
  const hasRental = items.some(i => i.label === "rental_asset");
  const hasProduction = items.some(i => i.inventorySourceLabel === "produce_new");
  const hasPackage = items.some(i => i.packageId != null);
  const hasAddon = items.some(i => i.itemType === "addon" || i.label === "addon_or_misc");
  const hasIndividual = items.some(i => i.packageId == null && i.label !== "rental_asset" && i.inventorySourceLabel !== "produce_new" && !(i.itemType === "addon" || i.label === "addon_or_misc"));
  const categories = [hasRental, hasProduction, hasPackage, hasAddon, hasIndividual].filter(Boolean).length;
  if (hasPackage && hasAddon && !hasRental && !hasProduction && !hasIndividual) return "Package + Add-Ons";
  if (categories > 1) return "Mixed";
  if (hasRental) return "Rental";
  if (hasProduction) return "Production";
  if (hasPackage) return "Package";
  if (hasAddon) return "Individual Items";
  return "Individual Items";
}

function deriveInventorySourceLabel(label: ItemFulfillmentLabel, it: OrderItem): InventorySourceLabel {
  // Customer-supplied stock is implied when partner reuses their own
  // hardware via use_existing_partner_inventory. A3 stock is implied when
  // a rental asset is reserved without a partner inventory pointer (A3
  // owns the rental pool). Hardware shipped in this order means we're
  // sourcing from the order itself (vendor → A3 → ship). Anything we
  // can't classify deterministically defers to PM judgement.
  if (label === "print_only_on_partner_inventory") return "partner_stock";
  if (label === "rental_asset" && !it.inventorySourceInventoryId) return "a3_stock";
  if (label === "rental_asset") return "partner_stock";
  // Hardware fabricated as part of this order, or full units shipped when
  // no partner hardware exists, are brand-new production runs by A3 — not
  // dropshipped from a third-party supplier. Surface them deterministically
  // as `produce_new` so the PM packet's inventory plan shows the correct
  // sourcing intent for NetSuite quoting.
  if (label === "hardware_supplied_in_order") return "produce_new";
  if (label === "full_unit_required") return "produce_new";
  if (label === "print_only_no_hardware_link") return "customer_stock";
  return "confirm_manually";
}

function deriveHardwareSummary(label: ItemFulfillmentLabel, it: OrderItem, fam: { fam: ProductFamily; member: ProductFamilyMember } | undefined): string | null {
  if (label === "print_only_no_hardware_link" || label === "addon_or_misc" || label === "rental_asset") return null;
  const hwName = fam?.fam.name ?? null;
  const hwQty = it.hardwareDemandQuantity ?? 0;
  if (hwQty <= 0 && !hwName) return null;
  const base = hwName ? `${hwQty || it.quantity} × ${hwName}` : `${hwQty} hardware unit${hwQty === 1 ? "" : "s"}`;
  if (label === "full_unit_required") return `${base} (full unit ship)`;
  if (label === "hardware_supplied_in_order") return `${base} (hardware in this order)`;
  if (label === "print_only_on_partner_inventory") return `${base} (reuse partner stock)`;
  return base;
}

function buildMissingFields(
  ctx: OrderEmailContext,
  items: IntakeItemAnalysis[],
  partner: Partner,
  vendorMatches: IntakeVendorMatch[],
): IntakeMissingField[] {
  const missing: IntakeMissingField[] = [];
  const { order, event, venue } = ctx;
  if (!partner.netsuiteCustomerNumber) {
    missing.push({ field: "NetSuite customer #", severity: "critical", reason: "Required to post the quote in NetSuite." });
  }
  if (!order.companyName && !order.contactName) {
    missing.push({ field: "Customer name", severity: "critical", reason: "No company or contact name on the order." });
  }
  if (!order.contactEmail) {
    missing.push({ field: "Customer email", severity: "critical", reason: "PM cannot send the quote without an email." });
  }
  if (!order.contactPhone) {
    missing.push({ field: "Customer phone", severity: "warning", reason: "Phone helps for rush approvals." });
  }
  if (!order.shippingAddressJson || !order.shippingAddressJson.line1) {
    missing.push({ field: "Shipping address", severity: "critical", reason: "Cannot quote freight without a destination." });
  }
  const eRow = ctx.eventRow ?? null;
  if (!event) {
    missing.push({ field: "Event link", severity: "warning", reason: "Order is not associated with an event — confirm timeline." });
  } else if (!eRow?.eventStartDate) {
    missing.push({ field: "Event start date", severity: "warning", reason: "Event has no date set — install/ship math may be wrong." });
  }
  if (event && !eRow?.installDate && !eRow?.shippingDeadline) {
    missing.push({ field: "Install / ship deadline", severity: "warning", reason: "No install or ship-by date — production lead time is unknown." });
  }
  if (!venue) {
    missing.push({ field: "Venue", severity: "warning", reason: "No venue captured — required for freight + on-site contact." });
  }
  for (const it of items) {
    if (it.label === "print_only_no_hardware_link" || it.label === "print_only_on_partner_inventory" || it.label === "full_unit_required") {
      const d = it.dimensions;
      if ((d.enteredWidth == null || d.enteredHeight == null) && !it.surveyAsset) {
        missing.push({ field: `Dimensions for "${it.itemName}"`, severity: "critical", reason: "Print line has no width × height — cannot quote material." });
      }
    }
    if (it.artwork.needed) {
      missing.push({ field: `Artwork for "${it.itemName}"`, severity: "warning", reason: "Marked artwork-required; no file attached yet." });
    }
    if (it.vendor.matchSource === "none") {
      missing.push({ field: `Vendor for "${it.itemName}"`, severity: "warning", reason: "No supplier resolved — assign manually." });
    }
  }
  if (vendorMatches.length === 0 && items.length > 0) {
    missing.push({ field: "Production vendor", severity: "warning", reason: "No vendor matched any line — PM must assign manually." });
  }
  return missing;
}

function buildPmChecklist(
  ctx: OrderEmailContext,
  items: IntakeItemAnalysis[],
  partner: Partner,
  files: IntakeFile[],
  vendorMatches: IntakeVendorMatch[],
  missing: IntakeMissingField[],
): IntakeChecklistItem[] {
  const { order, event, eventRow } = ctx;
  const out: IntakeChecklistItem[] = [];
  out.push({
    key: "ns_customer",
    label: "Confirm NetSuite customer record",
    done: !!partner.netsuiteCustomerNumber,
    detail: partner.netsuiteCustomerNumber ? `NS #${partner.netsuiteCustomerNumber}` : "Missing — create or link customer in NetSuite",
  });
  out.push({
    key: "ship_to",
    label: "Confirm ship-to address",
    done: !!(order.shippingAddressJson && order.shippingAddressJson.line1),
    detail: order.shippingAddressJson ? "Captured on order" : "Missing on order",
  });
  out.push({
    key: "timeline",
    label: "Lock event/install/ship dates",
    done: !!(event && (eventRow?.installDate || eventRow?.shippingDeadline)),
    detail: event ? "Event linked" : "No event linked",
  });
  out.push({
    key: "dimensions",
    label: "Verify dimensions on every print line",
    done: items.filter(i => ["print_only_no_hardware_link", "print_only_on_partner_inventory", "full_unit_required"].includes(i.label))
      .every(i => (i.dimensions.enteredWidth != null && i.dimensions.enteredHeight != null) || !!i.surveyAsset),
    detail: null,
  });
  out.push({
    key: "artwork",
    label: "Collect artwork files for every print line",
    done: items.filter(i => i.artwork.needed).length === 0,
    detail: files.filter(f => f.kind === "artwork").length ? `${files.filter(f => f.kind === "artwork").length} file(s) attached` : "No artwork attached yet",
  });
  out.push({
    key: "vendor",
    label: "Confirm production vendor(s)",
    done: vendorMatches.length > 0 && items.every(i => i.vendor.matchSource !== "none" || i.label === "addon_or_misc"),
    detail: vendorMatches.length ? vendorMatches.map(v => v.supplierName).join(", ") : "None resolved",
  });
  out.push({
    key: "inventory",
    label: "Confirm inventory source per line (customer / partner / A3 / 3P)",
    done: items.every(i => i.inventorySourceLabel !== "confirm_manually"),
    detail: null,
  });
  out.push({
    key: "missing",
    label: "Resolve missing-info warnings",
    done: missing.filter(m => m.severity === "critical").length === 0,
    detail: missing.length ? `${missing.length} flagged (${missing.filter(m => m.severity === "critical").length} critical)` : "Clean",
  });
  out.push({
    key: "quote",
    label: "Build NetSuite quote and send for approval",
    done: false,
    detail: null,
  });
  return out;
}

// ---------------------------------------------------------------------------
// Renderer — A3-branded HTML email
// ---------------------------------------------------------------------------

const A3_NAVY = "#0b1a3b";
const A3_INK = "#0f172a";
const A3_BG = "#f7f8fb";
const A3_MUTED = "#5b6478";
const A3_LINE = "#e3e7ef";
const A3_ACCENT = "#cf3a3a";
const A3_GREEN = "#0c8a5b";
const A3_AMBER = "#b75a00";

export function renderA3InternalIntakeHtml(ctx: OrderEmailContext, analysis: IntakeAnalysis): string {
  const { partner, order, event, venue } = ctx;
  const ship = order.shippingAddressJson || null;
  const shipLine = ship ? [ship.line1, ship.line2, ship.city, ship.state, ship.postalCode, ship.country].filter(Boolean).map(escape).join(", ") : "";
  const eventLine = event ? `${escape(event.name)}${event.eventDate ? ` · ${escape(new Date(event.eventDate).toLocaleDateString())}` : ""}` : "—";
  const venueLine = venue ? `${escape(venue.name)}${venue.city ? `, ${escape(venue.city)}` : ""}${venue.country ? `, ${escape(venue.country)}` : ""}` : "—";
  const submittedAt = new Date(order.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const orderTypeBadge = (() => {
    const map: Record<IntakeAnalysis["orderType"], { bg: string; fg: string; label: string }> = {
      print_only:  { bg: "#e9f6ee", fg: A3_GREEN, label: "Print only · use partner inventory" },
      full_unit:   { bg: "#fdecec", fg: A3_ACCENT, label: "Full unit required · ship hardware + print" },
      mixed:       { bg: "#fff4e0", fg: A3_AMBER, label: "Mixed · print + full units" },
      rental:      { bg: "#eef0ff", fg: "#3a47b8", label: "Rental asset" },
      other:       { bg: "#eef1f6", fg: A3_INK, label: "Order received" },
    };
    const m = map[analysis.orderType];
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${m.bg};color:${m.fg};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escape(m.label)}</span>`;
  })();

  const readinessBadge = (() => {
    const map = {
      ready_to_dispatch:    { bg: "#e9f6ee", fg: A3_GREEN, label: "Ready to dispatch" },
      needs_clarification:  { bg: "#fff4e0", fg: A3_AMBER, label: "Needs clarification" },
      needs_artwork:        { bg: "#fff4e0", fg: A3_AMBER, label: "Needs artwork" },
      blocked_inventory:    { bg: "#fdecec", fg: A3_ACCENT, label: "Blocked — inventory short" },
    } as const;
    const m = map[analysis.readinessLabel];
    return `<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${m.bg};color:${m.fg};font-size:11px;font-weight:700;">${escape(m.label)}</span>`;
  })();

  return `<!doctype html><html><body style="margin:0;padding:0;background:${A3_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:${A3_INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${A3_BG};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid ${A3_LINE};border-radius:14px;overflow:hidden;box-shadow:0 1px 0 ${A3_LINE};">

        <!-- Header (A3-branded, not partner-branded — this is internal mail) -->
        <tr><td style="background:${A3_NAVY};padding:18px 24px;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a8b3cf;font-weight:700;">A3 Visual · Internal order intake</div>
          <div style="font-size:16px;margin-top:4px;color:#ffffff;font-weight:600;">New order from <span style="color:#ffffff;">${escape(partner.companyName)}</span></div>
        </td></tr>

        <!-- At-a-glance band -->
        <tr><td style="padding:20px 24px 4px 24px;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${orderTypeBadge} ${readinessBadge}</div>
          <h1 style="margin:14px 0 2px 0;font-size:22px;color:${A3_INK};">${escape(order.orderNumber)}</h1>
          <div style="font-size:13px;color:${A3_MUTED};">${escape(analysis.orderTypeReason)}</div>
          <div style="font-size:12px;color:${A3_MUTED};margin-top:2px;">Submitted ${escape(submittedAt)}</div>
        </td></tr>

        <!-- Missing-info warning band (only when there's anything to flag) -->
        ${analysis.missingFields.length ? `<tr><td style="padding:8px 24px 0 24px;">
          ${renderMissingFieldsBlock(analysis.missingFields)}
        </td></tr>` : ""}

        <tr><td style="padding:0 24px 12px 24px;">${renderQuickActionsBlock(order.id, partner.id, analysis.customer.contactEmail || order.contactEmail || null, analysis.files.length)}</td></tr>

        <!-- NetSuite Quote Entry Summary — single discrete top block. -->
        ${section("NetSuite Quote Entry Summary", renderNetsuiteSummaryBlock(analysis.netsuiteSummary))}

        <!-- A. Account snapshot -->
        ${section("A · Account snapshot", `
          ${kvTable([
            ["Partner", `${escape(partner.companyName)}${partner.slug ? ` <span style="color:${A3_MUTED};">/${escape(partner.slug)}</span>` : ""}`],
            ["Quote type", `<strong>${escape(analysis.quoteType)}</strong>`],
            ["NetSuite customer #", analysis.netsuiteCustomerNumber ? `<code style="background:${A3_BG};padding:2px 6px;border-radius:4px;border:1px solid ${A3_LINE};">${escape(analysis.netsuiteCustomerNumber)}</code>` : `<span style="color:${A3_ACCENT};">— missing —</span>`],
            ["Event", eventLine],
            ["Venue", venueLine],
            shipLine ? ["Ship to", shipLine] : null,
          ].filter(Boolean) as Array<[string, string]>)}
        `)}

        <!-- A2. Customer + Billing block (PM packet) -->
        ${section("A2 · Customer & billing", renderCustomerBillingBlock(analysis.customer, analysis.billing))}

        <!-- A3. Event timeline (PM packet) -->
        ${section("A3 · Event & timeline", renderEventBlock(analysis.event))}

        <!-- B. People to call (salesperson always present, defaults to Alyssa) -->
        ${section("B · People to call", `
          ${peopleBlock([
            analysis.salesperson,
            analysis.programManager,
            analysis.accountOwner,
            analysis.supportContact,
          ].filter((c): c is IntakeContact => !!c))}
          ${analysis.partnerContacts.length ? `<div style="margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${A3_MUTED};font-weight:700;">Partner directory</div>${peopleBlock(analysis.partnerContacts.slice(0, 6))}` : ""}
          <div style="margin-top:10px;font-size:12px;color:${A3_MUTED};">Submitter: <span style="color:${A3_INK};font-weight:600;">${escape(order.contactName)}</span> · <a href="mailto:${escape(order.contactEmail)}" style="color:${A3_NAVY};">${escape(order.contactEmail)}</a>${order.contactPhone ? ` · ${escape(order.contactPhone)}` : ""}</div>
        `)}

        <!-- B2. Packages (PM packet) -->
        ${analysis.packages.length ? section("B2 · Packages", renderPackagesBlock(analysis.packages, analysis.items)) : ""}

        <!-- C. Order line items + fulfillment intent -->
        ${section("B3 · Rental & inventory plan", renderInventoryPlanBlock(analysis.items))}

        ${section("C · Items + fulfillment intent", renderItemsTable(analysis.items))}

        <!-- C2. Vendor matches (deterministic) -->
        ${section("C2 · Vendor matches", renderVendorMatchesBlock(analysis.vendorMatches, analysis.items))}

        <!-- C3. Files bundle for PM -->
        ${analysis.files.length ? section("C3 · Files", renderFilesBlock(analysis.files)) : ""}

        <!-- D. Inventory left after this order -->
        ${analysis.familiesRemaining.length ? section("D · Inventory after this order", renderFamiliesRemaining(analysis.familiesRemaining)) : ""}

        <!-- D2. PM handoff checklist -->
        ${section("D2 · PM handoff checklist", renderPmChecklistBlock(analysis.pmChecklist))}

        <!-- E. Recommended next steps -->
        ${section("E · Next steps for A3", renderList(analysis.nextSteps, A3_NAVY))}

        <!-- F. Follow-up questions for the partner -->
        ${analysis.followUpQuestions.length ? section("F · Questions to send back to the partner", renderList(analysis.followUpQuestions, A3_AMBER)) : ""}

        ${analysis.recommendedSupplierName ? `<tr><td style="padding:0 24px 18px 24px;font-size:12px;color:${A3_MUTED};">Suggested production partner: <strong style="color:${A3_INK};">${escape(analysis.recommendedSupplierName)}</strong></td></tr>` : ""}

        ${order.notes ? section("Client notes", `<div style="font-size:13px;color:${A3_INK};white-space:pre-wrap;">${escape(order.notes)}</div>`) : ""}
        ${order.internalNotes ? section("Internal notes", `<div style="font-size:13px;color:${A3_INK};white-space:pre-wrap;">${escape(order.internalNotes)}</div>`) : ""}

        <!-- Footer -->
        <tr><td style="padding:14px 24px 22px 24px;border-top:1px solid ${A3_LINE};font-size:11px;color:${A3_MUTED};">
          You're receiving this because you're configured as an ops recipient${analysis.opsRecipients.length ? ` (${escape(analysis.opsRecipients.slice(0, 4).join(", "))}${analysis.opsRecipients.length > 4 ? `, +${analysis.opsRecipients.length - 4} more` : ""})` : ""} on the <strong>${escape(partner.companyName)}</strong> partner account. Reply to this email to message the submitter directly.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function section(title: string, body: string): string {
  return `<tr><td style="padding:18px 24px 4px 24px;">
    <div style="font-size:11px;letter-spacing:0.10em;text-transform:uppercase;color:${A3_MUTED};font-weight:700;margin-bottom:8px;">${escape(title)}</div>
    ${body}
  </td></tr>`;
}

function kvTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${A3_BG};border:1px solid ${A3_LINE};border-radius:8px;overflow:hidden;">
    ${rows.map(([k, v], i) => `<tr>
      <td style="padding:8px 12px;font-size:12px;color:${A3_MUTED};width:160px;${i ? `border-top:1px solid ${A3_LINE};` : ""}">${escape(k)}</td>
      <td style="padding:8px 12px;font-size:13px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}">${v}</td>
    </tr>`).join("")}
  </table>`;
}

function peopleBlock(contacts: IntakeContact[]): string {
  if (!contacts.length) return `<div style="font-size:13px;color:${A3_MUTED};">No A3-side routing contacts configured for this partner.</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">
    ${contacts.map(c => `<tr>
      <td style="padding:6px 0;font-size:12px;color:${A3_MUTED};width:160px;vertical-align:top;">${escape(c.label)}</td>
      <td style="padding:6px 0;font-size:13px;color:${A3_INK};">
        ${c.name ? `<div style="font-weight:600;">${escape(c.name)}</div>` : ""}
        ${c.email ? `<a href="mailto:${escape(c.email)}" style="color:${A3_NAVY};text-decoration:none;">${escape(c.email)}</a>` : `<span style="color:${A3_MUTED};">— no email on file —</span>`}
      </td>
    </tr>`).join("")}
  </table>`;
}

function renderItemsTable(items: IntakeItemAnalysis[]): string {
  if (!items.length) return `<div style="font-size:13px;color:${A3_MUTED};">No line items.</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${A3_LINE};border-radius:8px;overflow:hidden;">
    <thead><tr style="background:${A3_BG};">
      <th align="left" style="padding:8px 12px;font-size:11px;color:${A3_MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Item</th>
      <th align="right" style="padding:8px 12px;font-size:11px;color:${A3_MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.06em;width:48px;">Qty</th>
      <th align="left" style="padding:8px 12px;font-size:11px;color:${A3_MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">What we ship</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td style="padding:10px 12px;font-size:13px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}vertical-align:top;">
          <div style="font-weight:600;">${escape(it.itemName)}</div>
          ${it.familyName ? `<div style="font-size:11px;color:${A3_MUTED};margin-top:2px;">${escape(it.familyName)}${it.memberRole ? ` · ${escape(it.memberRole)}` : ""}</div>` : ""}
        </td>
        <td align="right" style="padding:10px 12px;font-size:13px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}vertical-align:top;font-variant-numeric:tabular-nums;">${it.quantity}</td>
        <td style="padding:10px 12px;font-size:12px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}vertical-align:top;">
          ${labelChip(it.label)} ${inventorySourceChip(it.inventorySourceLabel)}
          <div style="margin-top:4px;color:${A3_MUTED};">${escape(it.note)}</div>
          ${renderItemPmDetail(it)}
          ${renderSurveyAssetBlock(it.surveyAsset)}
        </td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function renderSurveyAssetBlock(s: IntakeItemAnalysis["surveyAsset"]): string {
  if (!s) return "";
  // Unit-aware dimension rendering: the survey app captures `measurementUnit`
  // (in/cm/ft) on each row. Default to inches when null so legacy rows render.
  const unit = s.measurements.measurementUnit ?? "in";
  const unitGlyph = unit === "in" ? "″" : ` ${unit}`;
  const areaUnit = unit === "in" ? "sq ft" : unit === "cm" ? "sq m" : "sq ft";
  const dims: string[] = [];
  if (s.measurements.widthIn != null && s.measurements.heightIn != null) {
    dims.push(`${s.measurements.widthIn}${unitGlyph} × ${s.measurements.heightIn}${unitGlyph}${s.measurements.depthIn != null ? ` × ${s.measurements.depthIn}${unitGlyph}` : ""}`);
  }
  if (s.measurements.areaSqft != null) dims.push(`${s.measurements.areaSqft} ${areaUnit}`);
  if (s.measurements.shape) dims.push(escape(s.measurements.shape));
  if (s.measurements.orientation) dims.push(escape(s.measurements.orientation));
  const place = [s.venueName, s.zoneName, s.cityName].filter(Boolean).map(v => escape(v as string)).join(" · ");
  const surface = [
    s.surfaceMaterial ? `Surface: ${escape(s.surfaceMaterial)}` : null,
    s.environment ? `Environment: ${escape(s.environment)}` : null,
  ].filter(Boolean).join(" · ");
  const apps = [
    s.recommendedApplications.length ? `Recommended: ${s.recommendedApplications.map(escape).join(", ")}` : null,
    s.alternateApplications.length ? `Alternate: ${s.alternateApplications.map(escape).join(", ")}` : null,
  ].filter(Boolean).join(" · ");
  const flags = [
    s.visibilityTier ? `Tier: ${escape(s.visibilityTier)}` : null,
    s.publicStatus ? `Status: ${escape(s.publicStatus)}` : null,
    s.designNeeded ? "Design needed" : null,
    s.commissionEligible ? "Commission eligible" : null,
    s.opsOwner ? `Ops: ${escape(s.opsOwner)}` : null,
  ].filter(Boolean).join(" · ");
  const ns = [
    s.netsuiteItemName ? `Item ${escape(s.netsuiteItemName)}` : null,
    s.netsuiteItemCategory ? `(${escape(s.netsuiteItemCategory)})` : null,
    s.netsuiteAssetNumber ? `Asset #${escape(s.netsuiteAssetNumber)}` : null,
    s.netsuiteVenueNumber ? `Venue #${escape(s.netsuiteVenueNumber)}` : null,
  ].filter(Boolean).join(" · ");
  const notes: string[] = [];
  if (s.installNotes) notes.push(`Install: ${escape(s.installNotes)}`);
  if (s.productionNotes) notes.push(`Production: ${escape(s.productionNotes)}`);
  if (s.pricingNotes) notes.push(`Pricing: ${escape(s.pricingNotes)}`);
  if (s.internalNotes) notes.push(`Internal: ${escape(s.internalNotes)}`);
  const photos = s.internalPhotos.length
    ? `<div style="margin-top:4px;color:${A3_MUTED};">Marked photos: ${s.internalPhotos.map((p, i) => `<a href="${escape(p.url)}" style="color:${A3_INK};text-decoration:underline;">#${i + 1}${p.caption ? ` ${escape(p.caption)}` : ""}</a>`).join(" · ")}</div>`
    : "";
  return `<div style="margin-top:8px;padding:8px 10px;border:1px dashed ${A3_LINE};border-radius:6px;background:${A3_BG};font-size:11px;color:${A3_INK};">
    <div style="font-weight:700;color:${A3_MUTED};text-transform:uppercase;letter-spacing:0.06em;">Venue Survey · ${escape(s.name)} <span style="color:${A3_MUTED};font-weight:600;">· Asset ${escape(s.externalAssetId)} <span style="color:#9aa1ad;">(#${s.id})</span></span></div>
    ${place ? `<div style="margin-top:3px;">${place}</div>` : ""}
    ${dims.length ? `<div style="margin-top:3px;">${dims.join(" · ")}</div>` : ""}
    ${surface ? `<div style="margin-top:3px;">${surface}</div>` : ""}
    ${s.selectedMaterial ? `<div style="margin-top:3px;"><strong>Material:</strong> ${escape(s.selectedMaterial)}</div>` : ""}
    ${apps ? `<div style="margin-top:3px;color:${A3_MUTED};">${apps}</div>` : ""}
    ${flags ? `<div style="margin-top:3px;color:${A3_MUTED};">${flags}</div>` : ""}
    ${ns ? `<div style="margin-top:3px;color:${A3_MUTED};">${ns}</div>` : ""}
    ${notes.length ? `<div style="margin-top:4px;color:${A3_MUTED};">${notes.join(" · ")}</div>` : ""}
    ${photos}
  </div>`;
}

function labelChip(label: ItemFulfillmentLabel): string {
  const map: Record<ItemFulfillmentLabel, { bg: string; fg: string; text: string }> = {
    print_only_on_partner_inventory: { bg: "#e9f6ee", fg: A3_GREEN, text: "Print only — partner has the hardware" },
    full_unit_required:              { bg: "#fdecec", fg: A3_ACCENT, text: "Full unit required" },
    print_only_no_hardware_link:     { bg: "#eef1f6", fg: A3_INK,    text: "Print only" },
    hardware_supplied_in_order:      { bg: "#fff4e0", fg: A3_AMBER, text: "Hardware shipped in this order" },
    rental_asset:                    { bg: "#eef0ff", fg: "#3a47b8", text: "Rental asset" },
    addon_or_misc:                   { bg: "#eef1f6", fg: A3_INK,    text: "Add-on / line" },
    unknown:                         { bg: "#eef1f6", fg: A3_MUTED, text: "Unclassified" },
  };
  const m = map[label];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${m.bg};color:${m.fg};font-size:11px;font-weight:600;">${escape(m.text)}</span>`;
}

function renderFamiliesRemaining(rows: IntakeFamilyRemaining[]): string {
  return rows.map(r => {
    const statusColor = r.status === "depleted" ? A3_ACCENT : r.status === "low" ? A3_AMBER : A3_GREEN;
    const statusLabel = r.status === "depleted" ? "Depleted" : r.status === "low" ? "Low" : "OK";
    return `<div style="border:1px solid ${A3_LINE};border-radius:8px;padding:12px 14px;margin-bottom:8px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;color:${A3_INK};font-weight:600;">${escape(r.familyName)}${r.hardwareProductName ? ` <span style="color:${A3_MUTED};font-weight:400;">· ${escape(r.hardwareProductName)}</span>` : ""}</div>
        <div style="font-size:11px;color:${statusColor};font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${escape(statusLabel)}</div>
      </div>
      <div style="margin-top:6px;font-size:12px;color:${A3_INK};font-variant-numeric:tabular-nums;">
        <strong style="color:${statusColor};">${r.availableAfterThisOrder}</strong> of ${r.totalOwned} units remain after this order
        ${r.reservedNow > 0 ? ` <span style="color:${A3_MUTED};">(this order reserves ${r.reservedNow})</span>` : ""}
      </div>
      ${r.perCity.length > 1 ? `<div style="margin-top:6px;font-size:11px;color:${A3_MUTED};">By city: ${r.perCity.map(c => `${escape(c.cityName)} ${c.remaining}/${c.onHand}`).join(" · ")}</div>` : ""}
    </div>`;
  }).join("");
}

function renderList(items: string[], accent: string): string {
  if (!items.length) return `<div style="font-size:13px;color:${A3_MUTED};">Nothing flagged.</div>`;
  return `<ol style="margin:0;padding:0 0 0 0;list-style:none;">
    ${items.map((s, i) => `<li style="display:flex;gap:10px;padding:8px 12px;border:1px solid ${A3_LINE};border-radius:8px;margin-bottom:6px;background:#ffffff;font-size:13px;color:${A3_INK};">
      <span style="flex:0 0 auto;width:20px;height:20px;border-radius:999px;background:${accent};color:#ffffff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">${i + 1}</span>
      <span>${escape(s)}</span>
    </li>`).join("")}
  </ol>`;
}

function pickContact(label: string, name: string | null | undefined, email: string | null | undefined, fallback: { fullName: string; email: string | null } | null): IntakeContact | null {
  if (name || email) return { label, name: name || null, email: email || null, source: "partner_field" };
  if (fallback) return { label, name: fallback.fullName, email: fallback.email, source: "partner_contact" };
  return null;
}

function humanizeContactRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function deriveItemLabel(args: {
  itemType: string;
  productAssetType: string | null;
  memberRole: "hardware" | "component" | "accessory" | null;
  fulfillmentMode: string | null;
  reservedQuantity: number;
  hardwareDemand: number;
  printDemand: number;
}): ItemFulfillmentLabel {
  if (args.itemType === "rental" || args.productAssetType === "rentable") return "rental_asset";
  if (args.itemType === "addon" || args.itemType === "branding_zone") return "addon_or_misc";
  if (args.memberRole === "hardware") return "hardware_supplied_in_order";
  if (args.fulfillmentMode === "use_existing_partner_inventory" && args.reservedQuantity > 0) {
    return "print_only_on_partner_inventory";
  }
  if (args.memberRole === "component" || args.memberRole === "accessory") {
    if (args.hardwareDemand > 0 && args.reservedQuantity < args.hardwareDemand) {
      return "full_unit_required";
    }
    if (args.fulfillmentMode === "ship_full_unit") return "full_unit_required";
  }
  if (args.printDemand > 0 && args.hardwareDemand === 0) return "print_only_no_hardware_link";
  return args.fulfillmentMode ? "addon_or_misc" : "unknown";
}

function itemNote(label: ItemFulfillmentLabel, item: OrderItem, fam: { fam: ProductFamily; member: ProductFamilyMember } | undefined, inv: IntakeItemAnalysis["inventorySource"]): string {
  switch (label) {
    case "print_only_on_partner_inventory":
      return inv
        ? `Reserve ${item.reservedQuantity} unit(s) from ${inv.cityName ?? "partner"} stock${inv.inventoryName ? ` (${inv.inventoryName})` : ""}; ship print only.`
        : `Print run on partner-owned hardware (${item.reservedQuantity} reserved).`;
    case "full_unit_required": {
      const fname = fam?.fam.name ?? "the kit";
      return `No hardware available — ship a full unit (frame + print) for ${fname}.`;
    }
    case "hardware_supplied_in_order":
      return `Partner is buying the hardware base (${item.quantity} unit${item.quantity === 1 ? "" : "s"}) — print line will reserve against this once received.`;
    case "rental_asset":
      return `Rental hold — confirm event window and return logistics.`;
    case "print_only_no_hardware_link":
      return `Standalone print run — no hardware dependency.`;
    case "addon_or_misc":
      return `Add-on / accessory line.`;
    default:
      return `Unclassified line — confirm fulfillment with partner.`;
  }
}

function classifyOrderType(items: IntakeItemAnalysis[]): { type: IntakeAnalysis["orderType"]; reason: string } {
  if (!items.length) return { type: "other", reason: "No items on this order yet." };
  const hasPrint = items.some(i => i.label === "print_only_on_partner_inventory");
  const hasFull = items.some(i => i.label === "full_unit_required" || i.label === "hardware_supplied_in_order");
  const hasRental = items.some(i => i.label === "rental_asset");
  if (hasRental && !hasPrint && !hasFull) return { type: "rental", reason: "Rental hold for a partner-owned asset." };
  if (hasPrint && hasFull) return { type: "mixed", reason: "Some items reuse partner hardware; others need full units shipped." };
  if (hasPrint) return { type: "print_only", reason: "All hardware components are reserved against existing partner inventory — ship the print only." };
  if (hasFull) return { type: "full_unit", reason: "Partner does not have hardware available — ship full units (hardware + print)." };
  return { type: "other", reason: "Standard order — review line items below." };
}

async function rollupFamilyRemaining(partnerId: number, familyId: number, items: OrderItem[]): Promise<IntakeFamilyRemaining | null> {
  const [fam] = await db.select().from(productFamiliesTable).where(eq(productFamiliesTable.id, familyId));
  if (!fam || !fam.hardwareProductId) return null;
  const [hwProd] = await db.select().from(productCatalogTable).where(eq(productCatalogTable.id, fam.hardwareProductId));

  const invRows = await db
    .select({
      id: inventoryTable.id,
      hardwareOnHand: inventoryTable.hardwareOnHand,
      reserved: inventoryTable.reserved,
      cityName: citiesTable.name,
    })
    .from(inventoryTable)
    .leftJoin(citiesTable, eq(inventoryTable.cityId, citiesTable.id))
    .where(and(
      eq(inventoryTable.partnerId, partnerId),
      eq(inventoryTable.productId, fam.hardwareProductId),
    ));

  // Tally how many units this order reserves per inventory row.
  const reservedThisOrderById = new Map<number, number>();
  for (const it of items) {
    if (!it.inventorySourceInventoryId) continue;
    const fam2 = familyId; // we only want this family's inventory; if this item points at this family's hardware product, it's relevant
    if (it.fulfillmentMode !== "use_existing_partner_inventory") continue;
    // Match by inventory row presence (already filtered by partner+product above).
    if (!invRows.some(r => r.id === it.inventorySourceInventoryId)) continue;
    reservedThisOrderById.set(it.inventorySourceInventoryId, (reservedThisOrderById.get(it.inventorySourceInventoryId) ?? 0) + (it.reservedQuantity ?? 0));
    void fam2;
  }

  let totalOwned = 0;
  let availableAfter = 0;
  let reservedNow = 0;
  const perCity: IntakeFamilyRemaining["perCity"] = [];
  for (const r of invRows) {
    const onHand = r.hardwareOnHand ?? 0;
    const baseReserved = r.reserved ?? 0;
    const orderReserved = reservedThisOrderById.get(r.id) ?? 0;
    const remaining = Math.max(0, onHand - baseReserved - orderReserved);
    totalOwned += onHand;
    availableAfter += remaining;
    reservedNow += orderReserved;
    if (r.cityName) perCity.push({ cityName: r.cityName, onHand, reservedAfter: baseReserved + orderReserved, remaining });
  }

  // Threshold matches resolveLowStockThreshold in familyAvailability.
  const stored = fam.lowStockThreshold;
  const threshold = stored !== null && stored !== undefined ? stored : Math.max(2, Math.ceil(totalOwned * 0.15));
  const status: IntakeFamilyRemaining["status"] = availableAfter <= 0 ? "depleted" : availableAfter <= threshold ? "low" : "ok";

  return {
    familyId,
    familyName: fam.name,
    hardwareProductName: hwProd?.name ?? null,
    totalOwned,
    reservedNow,
    availableAfterThisOrder: availableAfter,
    status,
    perCity,
  };
}

function buildFollowUpQuestions(ctx: OrderEmailContext, items: IntakeItemAnalysis[], partner: Partner): string[] {
  const qs: string[] = [];
  const { order, event } = ctx;
  if (!order.contactPhone) qs.push("No phone number on the submitter — confirm a daytime contact in case we need approvals.");
  if (!event) qs.push("No event linked — confirm which event/show this order is for so we can align ship dates.");
  if (!order.shippingAddressJson || !order.shippingAddressJson.line1) {
    qs.push("Shipping address is incomplete — confirm receiving address and any dock/access constraints.");
  }
  if (order.artworkNeededFlag) {
    qs.push(`Artwork is flagged as outstanding${order.artworkBrief ? ` (${order.artworkBrief})` : ""} — confirm who is delivering files and by when.`);
  } else if (!(order.artworkFilesJson?.length)) {
    qs.push("No artwork attached — confirm whether files are coming separately or if A3 is creating them.");
  }
  const fullUnits = items.filter(i => i.label === "full_unit_required");
  if (fullUnits.length) {
    qs.push(`Confirm with partner that they want full units shipped for: ${fullUnits.map(i => i.itemName).join(", ")} (their inventory is depleted).`);
  }
  if (!partner.netsuiteCustomerNumber) {
    qs.push("No NetSuite customer number on file for this partner — confirm the billing entity before invoicing.");
  }
  if (!partner.programManagerEmail && !partner.internalAccountOwnerEmail) {
    qs.push("No A3-side program manager or account owner is configured for this partner — confirm who owns this account internally.");
  }
  return qs;
}

function buildNextSteps(ctx: OrderEmailContext, items: IntakeItemAnalysis[], remaining: IntakeFamilyRemaining[], supplierName: string | null): string[] {
  const steps: string[] = [];
  const orderType = classifyOrderType(items).type;
  if (orderType === "print_only") {
    steps.push("Print run only — kick artwork to production; no hardware to pick or ship.");
  } else if (orderType === "full_unit") {
    steps.push("Pull hardware + print files together; confirm ship date covers install lead time.");
  } else if (orderType === "mixed") {
    steps.push("Split fulfillment: print-only lines go straight to production; full-unit lines need hardware pulled and crated.");
  }
  if (remaining.some(r => r.status === "depleted")) {
    steps.push("Inventory depleted on at least one product family — flag the partner for a hardware reorder conversation.");
  } else if (remaining.some(r => r.status === "low")) {
    steps.push("Partner inventory is now low on at least one family — note this on the next account check-in.");
  }
  if (supplierName) {
    steps.push(`Send the production packet to ${supplierName} (already assigned on the order).`);
  } else {
    steps.push("Assign a production supplier on the order detail page before dispatching.");
  }
  if (ctx.order.artworkNeededFlag) {
    steps.push("Open the artwork loop with the graphic designer contact before producing.");
  }
  steps.push("Confirm receipt back to the partner so they know we have it.");
  return steps;
}

function computeReadiness(ctx: OrderEmailContext, items: IntakeItemAnalysis[], remaining: IntakeFamilyRemaining[], followUps: string[]): { label: IntakeAnalysis["readinessLabel"]; reason: string } {
  if (remaining.some(r => r.status === "depleted") && items.some(i => i.label === "full_unit_required" && i.shortageQty > 0)) {
    return { label: "blocked_inventory", reason: "Hardware is depleted and the order has shortages — full units cannot be shipped without restocking." };
  }
  if (ctx.order.artworkNeededFlag || items.some(i => i.note.includes("artwork"))) {
    return { label: "needs_artwork", reason: "Artwork is outstanding — production can't start until files arrive." };
  }
  if (followUps.length >= 2) {
    return { label: "needs_clarification", reason: "Multiple intake questions are open — clear them with the partner before dispatching." };
  }
  return { label: "ready_to_dispatch", reason: "All inputs look complete — production can begin." };
}


// ---------------------------------------------------------------------------
// PM packet render helpers (task #27)
// ---------------------------------------------------------------------------

function renderMissingFieldsBlock(missing: IntakeMissingField[]): string {
  const crit = missing.filter(m => m.severity === "critical");
  const warn = missing.filter(m => m.severity === "warning");
  const bg = crit.length ? "#fdecec" : "#fff8e1";
  const border = crit.length ? A3_ACCENT : A3_AMBER;
  const heading = crit.length
    ? `Missing info — ${crit.length} critical${warn.length ? `, ${warn.length} warning` : ""}`
    : `Heads up — ${warn.length} item${warn.length === 1 ? "" : "s"} to confirm before quoting`;
  return `<div style="border:1px solid ${border};background:${bg};border-radius:8px;padding:10px 12px;">
    <div style="font-size:12px;font-weight:700;color:${border};text-transform:uppercase;letter-spacing:0.06em;">${escape(heading)}</div>
    <ul style="margin:6px 0 0 18px;padding:0;font-size:12px;color:${A3_INK};">
      ${missing.map(m => `<li style="margin:2px 0;"><strong>${escape(m.field)}</strong> — <span style="color:${A3_MUTED};">${escape(m.reason)}</span></li>`).join("")}
    </ul>
  </div>`;
}

function renderCustomerBillingBlock(c: IntakeCustomerBlock, b: IntakeBillingBlock): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td valign="top" width="50%" style="padding-right:8px;">
        ${kvTable([
          ["Customer", `<strong>${escape(c.companyName || c.contactName)}</strong>`],
          ["Contact", escape(c.contactName)],
          ["Email", c.contactEmail ? `<a href="mailto:${escape(c.contactEmail)}" style="color:${A3_NAVY};">${escape(c.contactEmail)}</a>` : `<span style="color:${A3_MUTED};">—</span>`],
          ["Phone", c.contactPhone ? escape(c.contactPhone) : `<span style="color:${A3_MUTED};">—</span>`],
        ])}
      </td>
      <td valign="top" width="50%" style="padding-left:8px;">
        ${kvTable([
          ["Bill to", b.contactName ? escape(b.contactName) : `<span style="color:${A3_MUTED};">— same as customer —</span>`],
          ["Bill email", b.contactEmail ? `<a href="mailto:${escape(b.contactEmail)}" style="color:${A3_NAVY};">${escape(b.contactEmail)}</a>` : `<span style="color:${A3_MUTED};">—</span>`],
          ["Bill phone", b.contactPhone ? escape(b.contactPhone) : `<span style="color:${A3_MUTED};">—</span>`],
          ["Bill address", b.addressLine ? escape(b.addressLine) : `<span style="color:${A3_MUTED};">—</span>`],
          ["Payment", `${escape(b.paymentModel || "—")}${b.paymentTerms ? ` · ${escape(b.paymentTerms)}` : ""}`],
          ["NetSuite #", b.netsuiteCustomerNumber ? `<code>${escape(b.netsuiteCustomerNumber)}</code>` : `<span style="color:${A3_ACCENT};">missing</span>`],
        ])}
      </td>
    </tr>
  </table>`;
}

function fmtDate(s: string | null): string {
  if (!s) return `<span style="color:${A3_MUTED};">—</span>`;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return escape(s);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch { return escape(s); }
}

function renderEventBlock(e: IntakeEventBlock): string {
  const rows: Array<[string, string]> = [
    ["Event", e.eventName ? escape(e.eventName) : `<span style="color:${A3_MUTED};">— not linked —</span>`],
    ["Event window", `${fmtDate(e.eventStartDate)}${e.eventEndDate ? ` → ${fmtDate(e.eventEndDate)}` : ""}`],
    ["Install", fmtDate(e.installDate)],
    ["Teardown", fmtDate(e.teardownDate)],
    ["Ship by", fmtDate(e.shippingDeadline)],
    ["Venue", e.venueName ? escape(e.venueName) : `<span style="color:${A3_MUTED};">—</span>`],
  ];
  if (e.venueAddress) rows.push(["Venue address", escape(e.venueAddress)]);
  let venueContacts = "";
  if (e.venueContacts.length) {
    venueContacts = `<div style="margin-top:8px;font-size:12px;color:${A3_MUTED};">Venue contacts: ${e.venueContacts.map(v => `<span style="color:${A3_INK};">${escape(v.name)}${v.role ? ` (${escape(v.role)})` : ""}</span>${v.email ? ` · <a href="mailto:${escape(v.email)}" style="color:${A3_NAVY};">${escape(v.email)}</a>` : ""}${v.phone ? ` · ${escape(v.phone)}` : ""}`).join(" · ")}</div>`;
  }
  return kvTable(rows) + venueContacts;
}

function renderPackagesBlock(packages: IntakePackageBlock[], items: IntakeItemAnalysis[]): string {
  return packages.map(pkg => {
    const lines = items.filter(i => pkg.itemIds.includes(i.itemId));
    const rows = lines.map(l => {
      const d = l.dimensions;
      const dimsBits: string[] = [];
      if (d.enteredWidth != null && d.enteredHeight != null) dimsBits.push(`${d.enteredWidth} × ${d.enteredHeight} ${escape(d.sizeUnit || "in")}`);
      if (d.packedW != null && d.packedH != null) dimsBits.push(`packed ${d.packedW} × ${d.packedH}${d.packedD != null ? ` × ${d.packedD}` : ""} ${escape(d.packedUnit || "in")}`);
      const meta: string[] = [];
      if (l.productSku) meta.push(`SKU ${escape(l.productSku)}`);
      if (l.productCategory) meta.push(escape(l.productCategory));
      if (l.selectedMaterial) meta.push(`<strong>Material:</strong> ${escape(l.selectedMaterial)}`);
      if (l.hardwareSummary) meta.push(`<strong>Hardware:</strong> ${escape(l.hardwareSummary)}`);
      if (l.vendor.supplierName) meta.push(`<strong>Vendor:</strong> ${escape(l.vendor.supplierName)}`);
      if (l.artwork.fileUrl) meta.push(`<strong>Artwork:</strong> <a href="${escape(l.artwork.fileUrl)}" style="color:${A3_NAVY};">file</a>`);
      else if (l.artwork.needed) meta.push(`<strong style="color:${A3_ACCENT};">Artwork needed</strong>`);
      return `<tr>
        <td style="padding:8px 8px;border-top:1px solid ${A3_LINE};vertical-align:top;width:64px;">
          ${l.productImageUrl ? `<img src="${escape(l.productImageUrl)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:6px;border:1px solid ${A3_LINE};object-fit:cover;" />` : `<div style="width:56px;height:56px;border-radius:6px;border:1px dashed ${A3_LINE};background:${A3_BG};"></div>`}
        </td>
        <td style="padding:8px 8px;border-top:1px solid ${A3_LINE};vertical-align:top;font-size:12px;color:${A3_INK};">
          <div style="font-weight:600;">${escape(l.itemName)} <span style="color:${A3_MUTED};font-weight:400;">× ${l.quantity}</span> ${inventorySourceChip(l.inventorySourceLabel)}</div>
          ${dimsBits.length ? `<div style="margin-top:2px;color:${A3_MUTED};">${dimsBits.join(" · ")}</div>` : ""}
          ${meta.length ? `<div style="margin-top:4px;color:${A3_INK};line-height:1.5;">${meta.join(" · ")}</div>` : ""}
        </td>
      </tr>`;
    }).join("");
    const headerImage = pkg.packageImageUrl
      ? `<img src="${escape(pkg.packageImageUrl)}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:6px;border:1px solid ${A3_LINE};object-fit:cover;margin-right:10px;" />`
      : "";
    return `<div style="border:1px solid ${A3_LINE};border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#ffffff;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;"><tr>
        ${headerImage ? `<td style="vertical-align:top;width:74px;">${headerImage}</td>` : ""}
        <td style="vertical-align:top;">
          <div style="font-size:13px;font-weight:600;color:${A3_INK};">${escape(pkg.packageName)} <span style="color:${A3_MUTED};font-weight:400;font-size:11px;">· ${lines.length} line${lines.length === 1 ? "" : "s"}</span></div>
          ${pkg.packageDescription ? `<div style="font-size:12px;color:${A3_MUTED};margin-top:2px;">${escape(pkg.packageDescription)}</div>` : ""}
        </td>
      </tr></table>
      ${lines.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">${rows}</table>` : `<div style="margin-top:6px;font-size:12px;color:${A3_MUTED};">No lines tied to this package.</div>`}
    </div>`;
  }).join("");
}

// Standalone scannable inventory plan: groups items by source label and
// summarizes requested/available/remaining + warnings. Renders as one
// table per source so PM can see at a glance what's coming from where.
function renderInventoryPlanBlock(items: IntakeItemAnalysis[]): string {
  if (!items.length) return `<div style="font-size:12px;color:${A3_MUTED};">No line items.</div>`;
  const groups = new Map<InventorySourceLabel, IntakeItemAnalysis[]>();
  for (const it of items) {
    const arr = groups.get(it.inventorySourceLabel) ?? [];
    arr.push(it);
    groups.set(it.inventorySourceLabel, arr);
  }
  const groupOrder: InventorySourceLabel[] = ["partner_stock", "a3_stock", "customer_stock", "produce_new", "third_party", "confirm_manually"];
  const blocks: string[] = [];
  for (const label of groupOrder) {
    const grp = groups.get(label);
    if (!grp || !grp.length) continue;
    const rows = grp.map(it => {
      const iq = it.inventoryQty;
      const reqCell = iq ? `${iq.requested}` : `${it.quantity ?? 0}`;
      const availCell = iq?.available != null ? String(iq.available) : "—";
      const remCell = iq?.remainingAfter != null ? String(iq.remainingAfter) : "—";
      const warn = iq?.warnings?.length
        ? `<div style="color:${A3_ACCENT};font-weight:600;font-size:11px;margin-top:2px;">⚠ ${iq.warnings.map(w => escape(w)).join(" · ")}</div>`
        : "";
      const where = it.inventorySource?.cityName ? ` <span style="color:${A3_MUTED};">· ${escape(it.inventorySource.cityName)}</span>` : "";
      return `<tr>
        <td style="padding:6px 8px;border-top:1px solid ${A3_LINE};font-size:12px;color:${A3_INK};">${escape(it.itemName)}${where}${warn}</td>
        <td style="padding:6px 8px;border-top:1px solid ${A3_LINE};font-size:12px;color:${A3_INK};text-align:right;tabular-nums:auto;">${reqCell}</td>
        <td style="padding:6px 8px;border-top:1px solid ${A3_LINE};font-size:12px;color:${A3_INK};text-align:right;tabular-nums:auto;">${availCell}</td>
        <td style="padding:6px 8px;border-top:1px solid ${A3_LINE};font-size:12px;color:${A3_INK};text-align:right;tabular-nums:auto;">${remCell}</td>
      </tr>`;
    }).join("");
    blocks.push(`<div style="border:1px solid ${A3_LINE};border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#ffffff;">
      <div style="font-size:13px;font-weight:600;color:${A3_INK};">${inventorySourceChip(label)} <span style="color:${A3_MUTED};font-weight:400;font-size:11px;margin-left:6px;">${grp.length} line${grp.length === 1 ? "" : "s"}</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">
        <thead><tr>
          <th style="text-align:left;padding:4px 8px;font-size:11px;color:${A3_MUTED};font-weight:600;">Item</th>
          <th style="text-align:right;padding:4px 8px;font-size:11px;color:${A3_MUTED};font-weight:600;">Req</th>
          <th style="text-align:right;padding:4px 8px;font-size:11px;color:${A3_MUTED};font-weight:600;">Avail</th>
          <th style="text-align:right;padding:4px 8px;font-size:11px;color:${A3_MUTED};font-weight:600;">After</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
  }
  return blocks.join("") || `<div style="font-size:12px;color:${A3_MUTED};">No inventory groupings.</div>`;
}

function renderVendorMatchesBlock(matches: IntakeVendorMatch[], _items: IntakeItemAnalysis[]): string {
  if (!matches.length) {
    return `<div style="font-size:13px;color:${A3_ACCENT};border:1px dashed ${A3_ACCENT};border-radius:8px;padding:10px 12px;background:#fdf3f3;">No deterministic vendor match — PM must assign suppliers manually.</div>`;
  }
  const sourceLabel = (s: string) => s === "order_assigned" ? "Order" : s === "product_default" ? "Product default" : s === "branding_location_default" ? "Branding location" : s === "scored" ? "Scored fallback" : "—";
  return matches.map(m => {
    const meta: string[] = [];
    if (m.contactName) meta.push(`<strong>Contact:</strong> ${escape(m.contactName)}`);
    if (m.contactEmail) meta.push(`<a href="mailto:${escape(m.contactEmail)}" style="color:${A3_NAVY};">${escape(m.contactEmail)}</a>`);
    if (m.contactPhone) meta.push(escape(m.contactPhone));
    if (m.leadTimeDays != null) meta.push(`<strong>Lead time:</strong> ${m.leadTimeDays}d`);
    if (m.city || m.country) meta.push([m.city, m.country].filter(Boolean).map(v => escape(v!)).join(", "));
    if (!m.isActive) meta.push(`<span style="color:${A3_ACCENT};font-weight:600;">INACTIVE</span>`);
    const cats = m.categories.length ? `<div style="margin-top:4px;font-size:11px;color:${A3_MUTED};">Categories: ${m.categories.map(c => `<span style="background:${A3_BG};border:1px solid ${A3_LINE};padding:1px 6px;border-radius:999px;color:${A3_INK};margin-right:3px;">${escape(c)}</span>`).join("")}</div>` : "";
    const lineRows = m.lineSummaries.map(ls => {
      const bits: string[] = [];
      if (ls.sku) bits.push(`SKU ${escape(ls.sku)}`);
      if (ls.dimensions) bits.push(escape(ls.dimensions));
      if (ls.material) bits.push(`mat: ${escape(ls.material)}`);
      if (ls.productLeadTimeDays != null) bits.push(`prod lead ${ls.productLeadTimeDays}d`);
      return `<tr>
        <td style="padding:4px 6px;border-top:1px solid ${A3_LINE};font-size:11px;color:${A3_INK};">${escape(ls.itemName)} <span style="color:${A3_MUTED};">×${ls.quantity}</span>${ls.productCategory ? ` <span style="color:${A3_MUTED};">· ${escape(ls.productCategory)}</span>` : ""}</td>
        <td style="padding:4px 6px;border-top:1px solid ${A3_LINE};font-size:11px;color:${A3_MUTED};text-align:right;">${bits.join(" · ") || "—"}</td>
      </tr>`;
    }).join("");
    const scoreChip = m.bestMatchScore != null
      ? ` <span style="background:${A3_BG};border:1px solid ${A3_LINE};color:${A3_INK};padding:1px 6px;border-radius:999px;font-size:10px;margin-left:4px;">score ${m.bestMatchScore}</span>`
      : "";
    const reasons = (m.matchReasons && m.matchReasons.length)
      ? `<div style="margin-top:4px;font-size:11px;color:${A3_MUTED};"><strong>Why:</strong> ${m.matchReasons.map(r => escape(r)).join(" · ")}</div>`
      : "";
    return `<div style="border:1px solid ${A3_LINE};border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#ffffff;">
      <div style="font-size:13px;font-weight:600;color:${A3_INK};">${escape(m.supplierName)} <span style="color:${A3_MUTED};font-weight:400;font-size:11px;">· match: ${m.matchSources.map(sourceLabel).join(", ") || "—"}</span>${scoreChip}</div>
      ${reasons}
      ${meta.length ? `<div style="font-size:12px;color:${A3_INK};margin-top:4px;line-height:1.5;">${meta.join(" · ")}</div>` : ""}
      ${cats}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;">${lineRows}</table>
    </div>`;
  }).join("");
}

function renderNetsuiteSummaryBlock(s: IntakeNetsuiteSummary): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 8px;font-size:12px;color:${A3_MUTED};width:38%;vertical-align:top;">${escape(label)}</td><td style="padding:4px 8px;font-size:12px;color:${A3_INK};vertical-align:top;">${value}</td></tr>`;
  const ns = s.netsuiteCustomerNumber
    ? `<code style="background:${A3_BG};padding:2px 6px;border-radius:4px;border:1px solid ${A3_LINE};">${escape(s.netsuiteCustomerNumber)}</code>`
    : `<span style="color:${A3_ACCENT};font-weight:600;">— missing —</span>`;
  const customerBits = [
    `<strong>${escape(s.customerContactName)}</strong>`,
    s.customerCompany ? escape(s.customerCompany) : null,
    `<a href="mailto:${escape(s.customerContactEmail)}" style="color:${A3_NAVY};">${escape(s.customerContactEmail)}</a>`,
    s.customerContactPhone ? escape(s.customerContactPhone) : null,
  ].filter(Boolean).join(" · ");
  const billingBits = [
    s.billingContactName ? `<strong>${escape(s.billingContactName)}</strong>` : null,
    s.billingContactEmail ? `<a href="mailto:${escape(s.billingContactEmail)}" style="color:${A3_NAVY};">${escape(s.billingContactEmail)}</a>` : null,
    s.billingContactPhone ? escape(s.billingContactPhone) : null,
    s.billingTerms ? `terms: ${escape(s.billingTerms)}` : null,
  ].filter(Boolean).join(" · ") || `<span style="color:${A3_ACCENT};">— missing billing contact —</span>`;
  const salesBits = [
    `<strong>${escape(s.salespersonName)}</strong>`,
    `<a href="mailto:${escape(s.salespersonEmail)}" style="color:${A3_NAVY};">${escape(s.salespersonEmail)}</a>`,
    s.salespersonPhone ? escape(s.salespersonPhone) : null,
  ].filter(Boolean).join(" · ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${A3_LINE};border-radius:8px;background:#fbfbfb;">
    ${row("Quote type", `<strong>${escape(s.quoteType)}</strong>`)}
    ${row("NetSuite customer #", ns)}
    ${row("Partner", `<strong>${escape(s.partnerName)}</strong>`)}
    ${row("Customer contact", customerBits)}
    ${row("Billing contact", billingBits)}
    ${row("Salesperson", salesBits)}
    ${row("Lines / total qty", `${s.totalLines} line${s.totalLines === 1 ? "" : "s"} · ${s.totalQuantity} units`)}
  </table>`;
}

function renderQuickActionsBlock(orderId: number, partnerId: number, customerEmail: string | null, fileCount: number): string {
  const orderLink = publicLink(`/admin/orders/${orderId}`);
  const partnerLink = publicLink(`/admin/partners/${partnerId}/edit`);
  const filesLink = publicLink(`/admin/orders/${orderId}#files`);
  const customerHref = customerEmail ? `mailto:${customerEmail}` : null;
  const btn = (href: string, label: string) =>
    `<a href="${escape(href)}" style="display:inline-block;background:${A3_NAVY};color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;margin:0 6px 6px 0;">${escape(label)}</a>`;
  const ghostBtn = (href: string, label: string) =>
    `<a href="${escape(href)}" style="display:inline-block;background:#fff;color:${A3_NAVY};border:1px solid ${A3_NAVY};padding:7px 11px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;margin:0 6px 6px 0;">${escape(label)}</a>`;
  return `<div>
    ${btn(orderLink, "View order")}
    ${ghostBtn(partnerLink, "Open partner")}
    ${customerHref ? ghostBtn(customerHref, "Email customer") : ""}
    ${ghostBtn(filesLink, `Files${fileCount ? ` (${fileCount})` : ""}`)}
  </div>`;
}

function renderFilesBlock(files: IntakeFile[]): string {
  const groups: Record<IntakeFile["kind"], IntakeFile[]> = { artwork: [], product_image: [], survey_photo: [] };
  for (const f of files) groups[f.kind].push(f);
  const groupLabel: Record<IntakeFile["kind"], string> = { artwork: "Artwork", product_image: "Product reference", survey_photo: "Survey photos" };
  return (Object.keys(groups) as IntakeFile["kind"][]).map(k => {
    const arr = groups[k];
    if (!arr.length) return "";
    return `<div style="margin-bottom:8px;">
      <div style="font-size:11px;color:${A3_MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${groupLabel[k]}</div>
      <ul style="margin:0;padding:0 0 0 18px;font-size:12px;">
        ${arr.map(f => `<li style="margin:2px 0;"><a href="${escape(f.url)}" style="color:${A3_NAVY};">${escape(f.name)}</a>${f.contextLabel ? ` <span style="color:${A3_MUTED};">— ${escape(f.contextLabel)}</span>` : ""}</li>`).join("")}
      </ul>
    </div>`;
  }).join("");
}

function renderPmChecklistBlock(items: IntakeChecklistItem[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${A3_BG};border:1px solid ${A3_LINE};border-radius:8px;overflow:hidden;">
    ${items.map((c, i) => `<tr>
      <td style="padding:8px 12px;width:24px;${i ? `border-top:1px solid ${A3_LINE};` : ""}vertical-align:top;font-size:14px;">${c.done ? `<span style="color:${A3_GREEN};">✔</span>` : `<span style="color:${A3_MUTED};">▢</span>`}</td>
      <td style="padding:8px 12px;font-size:13px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}">
        <div style="${c.done ? `color:${A3_MUTED};` : "font-weight:600;"}">${escape(c.label)}</div>
        ${c.detail ? `<div style="font-size:11px;color:${A3_MUTED};margin-top:2px;">${escape(c.detail)}</div>` : ""}
      </td>
    </tr>`).join("")}
  </table>`;
}

function inventorySourceChip(label: InventorySourceLabel): string {
  const map: Record<InventorySourceLabel, { bg: string; fg: string; text: string }> = {
    customer_stock:    { bg: "#eef1f6", fg: A3_INK,    text: "Customer stock" },
    partner_stock:     { bg: "#e9f6ee", fg: A3_GREEN, text: "Partner stock" },
    a3_stock:          { bg: "#eef0ff", fg: "#3a47b8", text: "A3 stock" },
    third_party:       { bg: "#fff4e0", fg: A3_AMBER, text: "Third-party" },
    produce_new:       { bg: "#f1ecfd", fg: "#5b3fb6", text: "Produce new" },
    confirm_manually:  { bg: "#fdecec", fg: A3_ACCENT, text: "Confirm source" },
  };
  const m = map[label];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${m.bg};color:${m.fg};font-size:11px;font-weight:600;margin-left:4px;">${escape(m.text)}</span>`;
}

function renderItemPmDetail(it: IntakeItemAnalysis): string {
  const d = it.dimensions;
  const dimsLine: string[] = [];
  if (d.enteredWidth != null && d.enteredHeight != null) {
    const u = d.sizeUnit || "in";
    dimsLine.push(`${d.enteredWidth} × ${d.enteredHeight}${d.enteredDepth != null ? ` × ${d.enteredDepth}` : ""} ${escape(u)}`);
  }
  if (d.packedW != null && d.packedH != null) {
    const u = d.packedUnit || "in";
    dimsLine.push(`packed ${d.packedW} × ${d.packedH}${d.packedD != null ? ` × ${d.packedD}` : ""} ${escape(u)}`);
  }
  const bits: string[] = [];
  if (dimsLine.length) bits.push(`<strong>Dims:</strong> ${dimsLine.join(" · ")}`);
  if (it.selectedMaterial) bits.push(`<strong>Material:</strong> ${escape(it.selectedMaterial)}`);
  if (it.hardwareSummary) bits.push(`<strong>Hardware:</strong> ${escape(it.hardwareSummary)}`);
  if (it.vendor.supplierName) {
    const vsrc = it.vendor.matchSource;
    const srcText = vsrc === "order_assigned" ? "order" : vsrc === "product_default" ? "product default" : vsrc === "branding_location_default" ? "branding location" : vsrc === "scored" ? "scored" : "—";
    const scoreText = it.vendor.matchScore != null ? ` (${it.vendor.matchScore})` : "";
    bits.push(`<strong>Vendor:</strong> ${escape(it.vendor.supplierName)} <span style="color:${A3_MUTED};">· ${srcText}${scoreText}</span>`);
  } else if (it.vendor.matchSource === "none") {
    bits.push(`<strong style="color:${A3_ACCENT};">Vendor: unmatched — assign manually</strong>`);
  }
  const iq = it.inventoryQty;
  if (iq) {
    const parts: string[] = [`req ${iq.requested}`];
    if (iq.available != null) parts.push(`avail ${iq.available}`);
    if (iq.reservedFromInventory > 0) parts.push(`reserved ${iq.reservedFromInventory}`);
    if (iq.remainingAfter != null) parts.push(`remaining ${iq.remainingAfter}`);
    const warn = iq.warnings.length
      ? ` <span style="color:${A3_ACCENT};font-weight:600;">⚠ ${iq.warnings.map(w => escape(w)).join(" · ")}</span>`
      : "";
    bits.push(`<strong>Inventory:</strong> ${parts.join(" · ")}${warn}`);
  }
  if (it.vendor.matchReasons && it.vendor.matchReasons.length) {
    bits.push(`<span style="color:${A3_MUTED};">Why: ${it.vendor.matchReasons.map(r => escape(r)).join(" · ")}</span>`);
  }
  if (it.artwork.fileUrl) bits.push(`<strong>Artwork:</strong> <a href="${escape(it.artwork.fileUrl)}" style="color:${A3_NAVY};">file</a>`);
  else if (it.artwork.needed) bits.push(`<strong style="color:${A3_ACCENT};">Artwork needed</strong>`);
  if (!bits.length) return "";
  return `<div style="margin-top:6px;padding:6px 8px;background:${A3_BG};border:1px solid ${A3_LINE};border-radius:6px;font-size:11px;color:${A3_INK};line-height:1.5;">${bits.join(" · ")}</div>`;
}
