/**
 * Divini Partners - per-role plan catalog (Phase 2 data, captured now so the
 * numbers are not lost between sessions).
 *
 * This is the canonical source of truth for what each of the 7 roles' Free /
 * Plus / Pro (or role-equivalent) plans cost and include, per the growth
 * strategy: subscriptions are priced as a "no-brainer" upgrade (usage/value
 * unlocked, not friction), while platform (marketplace transaction) fees are
 * the long-term monetization engine. Optimizing for GMV, transaction volume,
 * retention, and cross-sell -- not subscription revenue in isolation.
 *
 * Wired to billing/entitlements via planTierFor(role, tier): the shared
 * organizations.tier enum (client/free_partner/partner/premier) still marks
 * WHICH LEVEL an org is on (free/plus/pro), but the real dollar figure, fee
 * rate, and feature limits for that level are looked up here, per role,
 * instead of the flat db.ts TIERS table (which remains the fallback for the
 * `billing` role and any role without a catalog entry).
 *
 * BRANDING RULE (user directive, 2026-08-03): never market a feature as "AI
 * ___". Every AI-powered feature is labeled either "Divini Concierge" (a
 * guided assist -- matching, qualification, pricing guidance, follow-ups:
 * the tool advises or acts on the user's behalf) or "Divini Builder" (a
 * generator -- proposals, budgets, timelines, RFPs: the tool produces a
 * document/artifact the user reviews and sends). This mapping is provisional
 * pending the user's own tool specifications; do not add net-new "AI ___"
 * bullets anywhere in this file, and update the existing labels once the
 * user's exact tool definitions land.
 *
 * Zero em dashes.
 */
import type { Role, Tier } from "../db.js";

/** Numeric usage limits called out in a plan's feature list (null = unlimited,
 *  a key simply absent = not applicable to this role). Mirrors
 *  lib/entitlements.ts's CapabilityKey; kept as plain strings here so
 *  planCatalog.ts has no import-time dependency on entitlements.ts. */
export type PlanLimits = Partial<Record<
  | "events.active" | "quotes.per_event" | "quotes.compare" | "locations" | "spaces"
  | "inventory_items" | "warehouses" | "team_seats" | "workers" | "leads.monthly"
  | "leads.active" | "proposals.monthly" | "packages",
  number | null
>>;

export interface PlanTier {
  key: string;
  label: string;
  /** Flat monthly price in dollars, or null when priced per-event / variable (see priceNote). */
  monthlyUsd: number | null;
  annualUsd?: number | null;
  /** Marketplace transaction fee rate (0.05 == 5%), or null for roles/tiers with no platform fee. */
  platformFeeRate: number | null;
  /** All fees remain capped at $2,500/event per the platform-wide cap (see lib/platformFees.ts). */
  feeCapCents?: number | null;
  seatsIncluded?: number;
  features: string[];
  priceNote?: string;
  limits?: PlanLimits;
}

export interface RolePlanCatalog {
  role: Role;
  displayName: string;
  tiers: PlanTier[];
}

export const PLAN_CATALOG: RolePlanCatalog[] = [
  {
    role: "client",
    displayName: "Client / Event Booker",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: null,
        features: [
          "2 active events",
          "Unlimited archived events",
          "Budget tracker",
          "Checklist",
          "Timeline",
          "Messaging",
          "Payments",
          "Contracts",
          "Favorites",
          "10 quote requests/event",
          "Compare 3 quotes",
        ],
        limits: { "events.active": 2, "quotes.per_event": 10, "quotes.compare": 3 },
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 19,
        annualUsd: 190,
        platformFeeRate: null,
        features: [
          "10 active events",
          "Unlimited quote requests",
          "Compare 10 quotes",
          "Divini Builder for budgets",
          "Divini Concierge vendor matching",
          "Divini Builder for timelines",
          "Shared planning",
          "Guest lists",
          "Vendor scorecards",
          "Unlimited collaborators",
          "Priority support",
        ],
        limits: { "events.active": 10, "quotes.per_event": null, "quotes.compare": 10 },
      },
      {
        key: "concierge",
        label: "Concierge",
        monthlyUsd: null,
        platformFeeRate: null,
        priceNote: "$149-$499/event",
        features: ["Premium, white-glove procurement for a single event"],
      },
    ],
  },
  {
    role: "venue",
    displayName: "Venue / Hotel",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: 0.05,
        feeCapCents: 250000,
        features: [
          "1 location",
          "2 spaces",
          "10 marketplace leads/month",
          "5 proposals",
          "Calendar",
          "Payments",
          "Contracts",
          "Preferred vendors",
          "Basic analytics",
        ],
        limits: { locations: 1, spaces: 2, "leads.monthly": 10, "proposals.monthly": 5 },
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 149,
        annualUsd: 1490,
        platformFeeRate: 0.025,
        feeCapCents: 250000,
        seatsIncluded: 5,
        features: [
          "3 locations",
          "Unlimited leads",
          "Live availability",
          "Proposal builder",
          "Contracts",
          "E-signatures",
          "Deposits",
          "Team CRM",
          "Revenue reporting",
          "Calendar sync",
          "Website widget",
        ],
        limits: { locations: 3, "leads.monthly": null, "proposals.monthly": null, team_seats: 5 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 399,
        annualUsd: 3990,
        platformFeeRate: 0.01,
        feeCapCents: 250000,
        seatsIncluded: 15,
        features: [
          "15 locations",
          "Divini Builder for proposals",
          "Divini Concierge pricing guidance",
          "Dynamic pricing",
          "Floorplans",
          "BEOs",
          "Forecasting",
          "API",
          "Accounting",
          "Advanced CRM",
          "Lead scoring",
        ],
        limits: { locations: 15, team_seats: 15 },
      },
    ],
  },
  {
    role: "vendor",
    displayName: "Vendor / Service Provider",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: 0.05,
        feeCapCents: 250000,
        features: [
          "Public profile",
          "Portfolio",
          "3 packages",
          "Receive leads",
          "Quotes",
          "Contracts",
          "Payments",
          "Reviews",
          "Messaging",
          "5 active leads",
        ],
        limits: { "leads.active": 5, packages: 3 },
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 45,
        annualUsd: 450,
        platformFeeRate: 0.025,
        feeCapCents: 250000,
        seatsIncluded: 3,
        features: [
          "Unlimited leads",
          "Unlimited quotes",
          "Proposal builder",
          "E-signatures",
          "CRM",
          "Calendar",
          "Follow-ups",
          "Packages",
          "Analytics",
          "Website embed",
        ],
        limits: { "leads.active": null, team_seats: 3 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 99,
        annualUsd: 990,
        platformFeeRate: 0.01,
        feeCapCents: 250000,
        seatsIncluded: 10,
        features: [
          "Divini Builder for proposals",
          "Divini Concierge pricing guidance",
          "Divini Concierge follow-ups",
          "Divini Concierge lead qualification",
          "Margin tracking",
          "Job costing",
          "Forecasting",
          "Advanced reporting",
          "API",
          "Automation",
        ],
        limits: { team_seats: 10 },
      },
    ],
  },
  {
    role: "supplier",
    displayName: "Supplier / Rentals",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: 0.05,
        feeCapCents: 250000,
        features: ["50 inventory items", "Quotes", "Payments", "1 warehouse", "Availability"],
        limits: { inventory_items: 50, warehouses: 1 },
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 99,
        annualUsd: 990,
        platformFeeRate: 0.025,
        feeCapCents: 250000,
        seatsIncluded: 5,
        features: [
          "1,000 inventory items",
          "Barcode scanning",
          "Inventory reservations",
          "Delivery scheduling",
          "Pickup scheduling",
          "QR codes",
          "Utilization reporting",
        ],
        limits: { inventory_items: 1000, team_seats: 5, warehouses: 1 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 249,
        annualUsd: 2490,
        platformFeeRate: 0.01,
        feeCapCents: 250000,
        features: [
          "10,000 inventory items",
          "Multi warehouse",
          "Route planning",
          "Driver scheduling",
          "Scan in/out",
          "Demand forecasting",
          "Purchase forecasting",
          "API",
          "Advanced analytics",
        ],
        limits: { inventory_items: 10000 },
      },
    ],
  },
  {
    role: "planner",
    displayName: "Event Planner",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: 0.05,
        feeCapCents: 250000,
        features: ["2 active events", "RFPs", "Budgets", "Timeline", "Client portal", "Payments"],
        limits: { "events.active": 2 },
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 149,
        annualUsd: 1490,
        platformFeeRate: 0.025,
        feeCapCents: 250000,
        seatsIncluded: 5,
        features: [
          "15 active events",
          "Unlimited RFPs",
          "Vendor comparisons",
          "Budget tracking",
          "Spend tracking",
          "CRM",
          "Team tasks",
          "Guest lists",
          "Templates",
        ],
        limits: { "events.active": 15, team_seats: 5 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 349,
        annualUsd: 3490,
        platformFeeRate: 0.01,
        feeCapCents: 250000,
        seatsIncluded: 15,
        features: [
          "100 active events",
          "Divini Builder for RFPs",
          "Divini Concierge venue matching",
          "Divini Builder for budgets",
          "Divini Builder for timelines",
          "Procurement reporting",
          "Profitability",
          "API",
          "Advanced CRM",
          "Sponsor management",
          "Registration",
        ],
        limits: { "events.active": 100, team_seats: 15 },
      },
    ],
  },
  {
    role: "installer",
    displayName: "Installer / Support Staff",
    tiers: [
      {
        key: "worker",
        label: "Worker (Free)",
        monthlyUsd: 0,
        platformFeeRate: null,
        features: [
          "Receive jobs",
          "Accept jobs",
          "Schedule",
          "Availability",
          "Time tracking",
          "Documents",
          "Ratings",
        ],
      },
      {
        key: "team",
        label: "Team",
        monthlyUsd: 79,
        annualUsd: 790,
        platformFeeRate: null,
        seatsIncluded: 25,
        features: ["25 workers", "Scheduling", "Messaging", "Call sheets", "Payroll export", "Time tracking"],
        limits: { workers: 25 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 249,
        annualUsd: 2490,
        platformFeeRate: null,
        seatsIncluded: 250,
        features: [
          "250 workers",
          "Labor forecasting",
          "QR check in",
          "Geofence",
          "Certifications",
          "Analytics",
          "API",
        ],
        limits: { workers: 250 },
      },
    ],
  },
  {
    role: "sponsor",
    displayName: "Sponsor / Brand",
    tiers: [
      {
        key: "free",
        label: "Free",
        monthlyUsd: 0,
        platformFeeRate: null,
        features: ["Browse sponsorships", "Save opportunities", "Contact organizers"],
      },
      {
        key: "plus",
        label: "Plus",
        monthlyUsd: 99,
        annualUsd: 990,
        platformFeeRate: null,
        seatsIncluded: 5,
        features: [
          "Unlimited searches",
          "Campaign calendar",
          "Asset vault",
          "Reporting",
          "Deliverables",
          "Renewals",
        ],
        limits: { team_seats: 5 },
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 349,
        annualUsd: 3490,
        platformFeeRate: null,
        seatsIncluded: 15,
        features: [
          "Divini Concierge sponsorship matching",
          "ROI analytics",
          "Audience scoring",
          "Competitor tracking",
          "Lead tracking",
          "QR tracking",
          "API",
        ],
        limits: { team_seats: 15 },
      },
    ],
  },
];

export interface AddOn {
  key: string;
  label: string;
  priceUsd: number | null;
  priceNote?: string;
}

export const ADD_ONS: AddOn[] = [
  { key: "seat", label: "Additional Seat", priceUsd: 15, priceNote: "/mo" },
  { key: "location", label: "Additional Location", priceUsd: 49, priceNote: "/mo" },
  { key: "warehouse", label: "Additional Warehouse", priceUsd: 29, priceNote: "/mo" },
  { key: "storage_25gb", label: "Additional 25 GB Storage", priceUsd: 10, priceNote: "/mo" },
  { key: "storage_100gb", label: "Additional 100 GB Storage", priceUsd: 29, priceNote: "/mo" },
  { key: "divini_credits_100", label: "Divini Credits (100)", priceUsd: 10 },
  { key: "divini_credits_500", label: "Divini Credits (500)", priceUsd: 35 },
  { key: "divini_credits_2000", label: "Divini Credits (2,000)", priceUsd: 99 },
  { key: "verified_business", label: "Verified Business", priceUsd: 99, priceNote: "/year" },
  { key: "background_check", label: "Background Check", priceUsd: null, priceNote: "Cost + margin" },
  { key: "featured_listing", label: "Featured Marketplace Listing", priceUsd: null, priceNote: "$49-$199/mo" },
  { key: "booking_widget", label: "Website Booking Widget", priceUsd: 19, priceNote: "/mo" },
  { key: "sms_package", label: "SMS Package", priceUsd: null, priceNote: "Usage-based" },
];

/** Auto-trigger criteria for offering an Enterprise (custom pricing) tier to
 *  any role's org, evaluated against org/usage data once Phase 3 usage
 *  metering is wired up. Not yet enforced anywhere. */
export const ENTERPRISE_TRIGGERS: string[] = [
  "25+ team members",
  "15+ locations",
  "250+ active events",
  "Multi-brand or multi-office operations",
  "SSO requirements",
  "API-heavy integrations",
  "Custom procurement workflows",
  "Dedicated account management",
];

export function planCatalogForRole(role: Role): RolePlanCatalog | undefined {
  return PLAN_CATALOG.find((r) => r.role === role);
}

/**
 * Maps the shared `organizations.tier` enum (client/free_partner/partner/
 * premier/white_label) to a plan LEVEL (0 = free, 1 = plus, 2 = pro), so the
 * existing tier column keeps working as "which level is this org on" while
 * the actual dollar figure and feature list are looked up per role. Client's
 * "concierge" tier and Installer's "worker"/"team" naming still line up by
 * position: tiers[0] is always the free/entry tier, tiers[2] is always the
 * top tier.
 */
const TIER_LEVEL: Record<Tier, number> = {
  client: 0,
  free_partner: 0,
  partner: 1,
  premier: 2,
};

/** The real, role-specific plan (price/fee/features) for an org's tier LEVEL,
 *  or undefined when the role has no catalog entry yet (falls back to the
 *  flat TIERS table -- see lib/entitlements.ts, lib/stripeBilling.ts). */
export function planTierFor(role: Role | string | null | undefined, tier: Tier): PlanTier | undefined {
  const catalog = planCatalogForRole(role as Role);
  if (!catalog) return undefined;
  const level = TIER_LEVEL[tier] ?? 0;
  return catalog.tiers[level];
}
