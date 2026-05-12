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

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productFamiliesTable,
  productFamilyMembersTable,
  productCatalogTable,
  inventoryTable,
  citiesTable,
  partnerContactsTable,
  partnerEmailRecipientsTable,
  suppliersTable,
  type Partner,
  type Order,
  type OrderItem,
  type ProductFamily,
  type ProductFamilyMember,
} from "@workspace/db";
import type { OrderEmailContext } from "./email";

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

export interface IntakeItemAnalysis {
  itemId: number;
  itemName: string;
  quantity: number;
  productSlug: string | null;
  // Family / role context (null if the product is not part of any family).
  familyId: number | null;
  familyName: string | null;
  memberRole: "hardware" | "component" | "accessory" | null;
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

export interface IntakeAnalysis {
  // Header summary
  orderType: "print_only" | "full_unit" | "mixed" | "rental" | "other";
  orderTypeReason: string;
  netsuiteCustomerNumber: string | null;
  // People
  programManager: IntakeContact | null;
  accountOwner: IntakeContact | null;
  supportContact: IntakeContact | null;
  partnerContacts: IntakeContact[]; // primary, billing, graphic_designer, onsite, project, other
  opsRecipients: string[];
  // Per-item + remaining
  items: IntakeItemAnalysis[];
  familiesRemaining: IntakeFamilyRemaining[];
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
  const programManager = pickContact(
    "Program manager",
    partner.programManagerName,
    partner.programManagerEmail,
    contacts.find(c => c.role === "project" && c.isPrimary) ?? contacts.find(c => c.role === "project") ?? null,
  );
  const accountOwner = pickContact(
    "A3 account owner",
    partner.internalAccountOwnerName,
    partner.internalAccountOwnerEmail,
    null,
  );
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

    itemsOut.push({
      itemId: it.id,
      itemName: it.name,
      quantity: it.quantity,
      productSlug: product?.slug ?? null,
      familyId,
      familyName,
      memberRole: role ?? null,
      label,
      fulfillmentMode: it.fulfillmentMode ?? null,
      hardwareUnitsNeeded: it.hardwareDemandQuantity ?? 0,
      reservedFromInventoryQty: it.reservedQuantity ?? 0,
      shortageQty: it.shortageQuantity ?? 0,
      inventorySource: invSnap,
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

  // 7) Follow-up questions + next steps + readiness label.
  const orderTypeInfo = classifyOrderType(itemsOut);
  const followUps = buildFollowUpQuestions(ctx, itemsOut, partner);
  const nextSteps = buildNextSteps(ctx, itemsOut, familiesRemaining, recommendedSupplierName);
  const readiness = computeReadiness(ctx, itemsOut, familiesRemaining, followUps);

  return {
    orderType: orderTypeInfo.type,
    orderTypeReason: orderTypeInfo.reason,
    netsuiteCustomerNumber: partner.netsuiteCustomerNumber || null,
    programManager,
    accountOwner,
    supportContact,
    partnerContacts: partnerContactsOut,
    opsRecipients,
    items: itemsOut,
    familiesRemaining,
    recommendedSupplierName,
    followUpQuestions: followUps,
    nextSteps,
    readinessLabel: readiness.label,
    readinessReason: readiness.reason,
  };
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
  const ship = (order.shippingAddressJson as any) || null;
  const shipLine = ship ? [ship.line1, ship.line2, ship.city, ship.state || ship.region, ship.postalCode, ship.country].filter(Boolean).map(escape).join(", ") : "";
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

        <!-- A. Account snapshot -->
        ${section("A · Account snapshot", `
          ${kvTable([
            ["Partner", `${escape(partner.companyName)}${partner.slug ? ` <span style="color:${A3_MUTED};">/${escape(partner.slug)}</span>` : ""}`],
            ["NetSuite customer #", analysis.netsuiteCustomerNumber ? `<code style="background:${A3_BG};padding:2px 6px;border-radius:4px;border:1px solid ${A3_LINE};">${escape(analysis.netsuiteCustomerNumber)}</code>` : `<span style="color:${A3_MUTED};">— not on file —</span>`],
            ["Event", eventLine],
            ["Venue", venueLine],
            shipLine ? ["Ship to", shipLine] : null,
          ].filter(Boolean) as Array<[string, string]>)}
        `)}

        <!-- B. People to call -->
        ${section("B · People to call", `
          ${peopleBlock([
            analysis.programManager,
            analysis.accountOwner,
            analysis.supportContact,
          ].filter((c): c is IntakeContact => !!c))}
          ${analysis.partnerContacts.length ? `<div style="margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${A3_MUTED};font-weight:700;">Partner directory</div>${peopleBlock(analysis.partnerContacts.slice(0, 6))}` : ""}
          <div style="margin-top:10px;font-size:12px;color:${A3_MUTED};">Submitter: <span style="color:${A3_INK};font-weight:600;">${escape(order.contactName)}</span> · <a href="mailto:${escape(order.contactEmail)}" style="color:${A3_NAVY};">${escape(order.contactEmail)}</a>${order.contactPhone ? ` · ${escape(order.contactPhone)}` : ""}</div>
        `)}

        <!-- C. Order line items + fulfillment intent -->
        ${section("C · Items + fulfillment intent", renderItemsTable(analysis.items))}

        <!-- D. Inventory left after this order -->
        ${analysis.familiesRemaining.length ? section("D · Inventory after this order", renderFamiliesRemaining(analysis.familiesRemaining)) : ""}

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
        <td style="padding:10px 12px;font-size:12px;color:${A3_INK};${i ? `border-top:1px solid ${A3_LINE};` : ""}vertical-align:top;">${labelChip(it.label)}<div style="margin-top:4px;color:${A3_MUTED};">${escape(it.note)}</div>${renderSurveyAssetBlock(it.surveyAsset)}</td>
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
  if (!order.shippingAddressJson || !(order.shippingAddressJson as any).line1) {
    qs.push("Shipping address is incomplete — confirm receiving address and any dock/access constraints.");
  }
  if (order.artworkNeededFlag) {
    qs.push(`Artwork is flagged as outstanding${order.artworkBrief ? ` (${order.artworkBrief})` : ""} — confirm who is delivering files and by when.`);
  } else if (!(order.artworkFilesJson as any[] | null)?.length) {
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

