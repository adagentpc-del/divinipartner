// @ts-nocheck
import {
  db,
  partnersTable, eventsTable, venuesTable, citiesTable,
  packagesTable, productCatalogTable, partnerBrandingLocationsTable,
  ordersTable, partnerThemesTable, partnerSectionsTable, suppliersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export type ChecklistItem = {
  key: string;
  label: string;
  category: string;
  status: "complete" | "incomplete" | "warning";
  severity: "blocker" | "warning" | "info";
  hint?: string;
  link?: string;
};

export async function readinessForPartner(partnerId: number): Promise<{
  partner: any;
  items: ChecklistItem[];
  completionPct: number;
  blockerCount: number;
  warningCount: number;
  readyToLaunch: boolean;
}> {
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId)).limit(1);
  if (!partner) throw new Error("Partner not found");

  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId)).limit(1);
  const sections = await db.select().from(partnerSectionsTable).where(eq(partnerSectionsTable.partnerId, partnerId));
  const cities = await db.select().from(citiesTable).where(eq(citiesTable.partnerId, partnerId));
  const venues = await db.select().from(venuesTable).where(eq(venuesTable.partnerId, partnerId));
  const events = await db.select().from(eventsTable).where(eq(eventsTable.partnerId, partnerId));
  const packages = await db.select().from(packagesTable).where(eq(packagesTable.partnerId, partnerId));
  const zones = await db.select().from(partnerBrandingLocationsTable).where(eq(partnerBrandingLocationsTable.partnerId, partnerId));
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.partnerId, partnerId));

  const items: ChecklistItem[] = [];
  const isBranding = partner.partnerType === "branding";
  const isOrdering = partner.partnerType === "ordering" || !partner.partnerType;
  const link = (s: string) => `/admin/partners/${partnerId}${s}`;

  // -- BRANDING & PORTAL ----
  items.push({
    key: "logo",
    label: "Logo uploaded",
    category: "Branding",
    status: partner.logoUrl ? "complete" : "incomplete",
    severity: "blocker",
    hint: "Upload a logo to brand the partner portal.",
    link: link("/edit"),
  });
  items.push({
    key: "intro_copy",
    label: "Intro copy written",
    category: "Branding",
    status: partner.introHeadline && partner.introText ? "complete" : "incomplete",
    severity: "warning",
    hint: "Add a headline and intro paragraph that greets visitors.",
    link: link("/edit"),
  });
  items.push({
    key: "theme",
    label: "Theme configured",
    category: "Branding",
    status: theme ? "complete" : "incomplete",
    severity: "warning",
    hint: "Set primary colors and typography.",
    link: link("/theme"),
  });
  items.push({
    key: "sections",
    label: "Portal sections published",
    category: "Branding",
    status: sections.length > 0 ? "complete" : "incomplete",
    severity: "warning",
    hint: "Compose the public-facing portal sections.",
    link: link("/sections"),
  });

  // -- CONTACTS & ROUTING ----
  items.push({
    key: "primary_contact",
    label: "Primary contact set",
    category: "Contacts",
    status: partner.contactName && partner.contactEmail ? "complete" : "incomplete",
    severity: "blocker",
    hint: "Required for partner notifications and routing.",
    link: link("/edit"),
  });
  items.push({
    key: "routing_email",
    label: "Routing email configured",
    category: "Contacts",
    status: partner.routingEmail ? "complete" : "warning",
    severity: "warning",
    hint: "Where new order notifications get routed.",
    link: link("/edit"),
  });

  // -- LOCATIONS & VENUES (ordering portals) ----
  if (isOrdering) {
    items.push({
      key: "city",
      label: "At least one city configured",
      category: "Locations",
      status: cities.length > 0 ? "complete" : "incomplete",
      severity: "blocker",
      hint: "Cities anchor inventory and venue assignments.",
      link: "/admin/cities",
    });
    items.push({
      key: "venue",
      label: "At least one venue configured",
      category: "Locations",
      status: venues.length > 0 ? "complete" : "incomplete",
      severity: "blocker",
      hint: "Venues are required for shipping and event creation.",
      link: "/admin/cities",
    });
    items.push({
      key: "event",
      label: "First event created",
      category: "Locations",
      status: events.length > 0 ? "complete" : "incomplete",
      severity: "warning",
      hint: "Create at least one event so clients can place orders.",
      link: "/admin/events",
    });
  }

  // -- BRANDING ZONES (branding partners) ----
  if (isBranding) {
    items.push({
      key: "zones",
      label: "Branding zones loaded",
      category: "Catalog",
      status: zones.length > 0 ? "complete" : "incomplete",
      severity: "blocker",
      hint: "Add the brandable surfaces this partner sells.",
      link: "/admin/branding-locations",
    });
  }

  // -- CATALOG ----
  items.push({
    key: "packages",
    label: "Packages defined",
    category: "Catalog",
    status: packages.length > 0 ? "complete" : "incomplete",
    severity: isOrdering ? "blocker" : "warning",
    hint: "Packages drive ordering — at least one tier is recommended.",
    link: "/admin/packages",
  });

  // -- BILLING ----
  items.push({
    key: "billing_model",
    label: "Default billing model selected",
    category: "Billing",
    status: partner.defaultBillingExecModel ? "complete" : "incomplete",
    severity: "blocker",
    hint: "Determines who issues invoices for this partner.",
    link: link("/edit"),
  });
  items.push({
    key: "billing_contact",
    label: "Billing contact set",
    category: "Billing",
    status: partner.billingContactName && partner.billingContactEmail ? "complete" : "incomplete",
    severity: "warning",
    hint: "Where invoices and statements are sent.",
    link: link("/edit"),
  });
  items.push({
    key: "payment_terms",
    label: "Payment terms set",
    category: "Billing",
    status: partner.paymentTerms ? "complete" : "incomplete",
    severity: "warning",
    hint: "e.g. net_15, net_30. Sets default invoice due dates.",
    link: link("/edit"),
  });

  // -- SUPPLIER DEFAULTS ----
  items.push({
    key: "default_supplier",
    label: "Default supplier assigned",
    category: "Fulfillment",
    status: partner.defaultSupplierId ? "complete" : "warning",
    severity: "warning",
    hint: "Speeds up order routing for items without explicit assignment.",
    link: link("/edit"),
  });

  // -- ROLLOUT GATE ----
  items.push({
    key: "first_order_path",
    label: "Ordering path verified",
    category: "Rollout",
    status: orders.length > 0 ? "complete" : "incomplete",
    severity: "info",
    hint: "Place a test order through the portal before going live.",
    link: `/${partner.slug}`,
  });

  const blockerCount = items.filter(i => i.severity === "blocker" && i.status !== "complete").length;
  const warningCount = items.filter(i => i.severity === "warning" && i.status !== "complete").length;
  const completed = items.filter(i => i.status === "complete").length;
  const completionPct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

  return {
    partner,
    items,
    completionPct,
    blockerCount,
    warningCount,
    readyToLaunch: blockerCount === 0,
  };
}

// =====================================================================
// Internal launch wizard — global readiness for whole platform
// =====================================================================
export async function platformReadiness() {
  const partners = await db.select().from(partnersTable);
  const suppliers = await db.select().from(suppliersTable);
  const products = await db.select().from(productCatalogTable);

  const items: ChecklistItem[] = [
    {
      key: "first_partner",
      label: "First partner created",
      category: "Platform",
      status: partners.length > 0 ? "complete" : "incomplete",
      severity: "blocker",
      hint: "Create the first partner to launch the platform.",
      link: "/admin/partners",
    },
    {
      key: "supplier",
      label: "At least one supplier configured",
      category: "Platform",
      status: suppliers.length > 0 ? "complete" : "incomplete",
      severity: "blocker",
      link: "/admin/suppliers",
    },
    {
      key: "products",
      label: "Product catalog populated",
      category: "Platform",
      status: products.length > 0 ? "complete" : "incomplete",
      severity: "warning",
      link: "/admin/products",
    },
    {
      key: "live_partner",
      label: "At least one live partner",
      category: "Platform",
      status: partners.some(p => p.launchStatus === "live") ? "complete" : "incomplete",
      severity: "warning",
      hint: "Activate a partner from its rollout checklist.",
      link: "/admin/partners",
    },
  ];

  const blockerCount = items.filter(i => i.severity === "blocker" && i.status !== "complete").length;
  const completed = items.filter(i => i.status === "complete").length;
  return {
    items,
    completionPct: Math.round((completed / items.length) * 100),
    blockerCount,
    partnerCount: partners.length,
    livePartnerCount: partners.filter(p => p.launchStatus === "live").length,
    draftPartnerCount: partners.filter(p => p.launchStatus === "draft").length,
    demoPartnerCount: partners.filter(p => p.demoFlag).length,
  };
}

// Per-partner activation helper
export async function setLaunchStatus(partnerId: number, status: string, overrideNote?: string | null) {
  const update: any = { launchStatus: status, updatedAt: new Date() };
  if (status === "live") update.launchedAt = new Date();
  if (overrideNote !== undefined) update.launchOverrideNote = overrideNote || null;
  if (status === "live") update.isActive = true;
  if (status === "paused") update.isActive = false;
  await db.update(partnersTable).set(update).where(eq(partnersTable.id, partnerId));
  return readinessForPartner(partnerId);
}
