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
 * NOT YET WIRED to billing/entitlements. lib/stripeBilling.ts's
 * SUBSCRIBABLE_TIERS + db.ts's TIERS still only cover the Vendor role (the
 * Phase 1 slice, matching the pre-existing $45/$99 numbers). Phase 2 extends
 * the org-membership + Stripe-subscription plumbing built in Phase 1 to every
 * role below, keyed by (role, planKey) instead of a single global tier.
 *
 * Zero em dashes.
 */
import type { Role } from "../db.js";

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
          "AI budget builder",
          "AI vendor matching",
          "AI timeline",
          "Shared planning",
          "Guest lists",
          "Vendor scorecards",
          "Unlimited collaborators",
          "Priority support",
        ],
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
          "White label portal",
          "AI proposals",
          "AI pricing",
          "Dynamic pricing",
          "Floorplans",
          "BEOs",
          "Forecasting",
          "API",
          "Accounting",
          "Advanced CRM",
          "Lead scoring",
        ],
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
          "AI proposals",
          "AI pricing",
          "AI follow-up",
          "AI lead qualification",
          "Margin tracking",
          "Job costing",
          "Forecasting",
          "White label",
          "Advanced reporting",
          "API",
          "Automation",
        ],
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
          "White label",
          "Advanced analytics",
        ],
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
          "AI RFPs",
          "AI venue matching",
          "AI budgets",
          "AI timelines",
          "Procurement reporting",
          "Profitability",
          "White label",
          "API",
          "Advanced CRM",
          "Sponsor management",
          "Registration",
        ],
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
      },
      {
        key: "pro",
        label: "Pro",
        monthlyUsd: 349,
        annualUsd: 3490,
        platformFeeRate: null,
        seatsIncluded: 15,
        features: [
          "AI matching",
          "ROI analytics",
          "Audience scoring",
          "Competitor tracking",
          "Lead tracking",
          "QR tracking",
          "API",
          "White label",
        ],
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
  { key: "ai_credits_100", label: "AI 100 Credits", priceUsd: 10 },
  { key: "ai_credits_500", label: "AI 500 Credits", priceUsd: 35 },
  { key: "ai_credits_2000", label: "AI 2,000 Credits", priceUsd: 99 },
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
