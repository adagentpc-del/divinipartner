/**
 * Nonprofit / Charity core - fundraising helpers (Workstream B).
 *
 * Pure, deterministic helpers shared by the fundraising repo + routes. No DB
 * work, no randomness: the same inputs always yield the same output, so they are
 * unit-testable in isolation and cheap to run on every request.
 *
 *   * Enum guards for the fundraising event kind, sponsorship tier, and ticket
 *     package type (used by the routes/repo to reject bad input before a write).
 *   * computeNonprofitRollup: turns the raw, best-effort rows the dashboard repo
 *     loads (packages, ticket packages, payments-if-resolvable, guests, tasks,
 *     fulfillment) into the deterministic dashboard summary. Revenue is REAL:
 *     when payments tied to the org's fundraising events resolve, that sum is the
 *     collected figure; otherwise it degrades to committed revenue derived from
 *     sold * price. Nothing is fabricated - empty inputs yield zeros.
 */

// ---- Enum guards ------------------------------------------------------------

export const FUNDRAISING_KINDS = [
  "gala",
  "fundraiser",
  "luncheon",
  "golf",
  "auction",
  "conference",
  "community",
  "awareness",
  "donor_dinner",
] as const;
export type FundraisingKind = (typeof FUNDRAISING_KINDS)[number];
const KIND_SET = new Set<string>(FUNDRAISING_KINDS);
export function isFundraisingKind(v: unknown): v is FundraisingKind {
  return typeof v === "string" && KIND_SET.has(v);
}

export const SPONSOR_TIERS = [
  "presenting",
  "gold",
  "silver",
  "bronze",
  "in_kind",
  "vendor",
] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];
const TIER_SET = new Set<string>(SPONSOR_TIERS);
export function isSponsorTier(v: unknown): v is SponsorTier {
  return typeof v === "string" && TIER_SET.has(v);
}

export const TICKET_TYPES = ["individual", "vip", "table", "sponsor_table"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
const TICKET_SET = new Set<string>(TICKET_TYPES);
export function isTicketType(v: unknown): v is TicketType {
  return typeof v === "string" && TICKET_SET.has(v);
}

// ---- Numeric coercion -------------------------------------------------------

/** Coerce a possibly-string numeric (pg `numeric` arrives as a string) to a number. */
export function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---- Rollup -----------------------------------------------------------------

export interface RollupPackageRow {
  price: unknown;
  sold: unknown;
}
export interface RollupTicketRow {
  price: unknown;
  sold: unknown;
  seats: unknown;
}
export interface RollupInputs {
  /** goal across the org's fundraising events */
  goalAmount: unknown;
  /** budget across the org's fundraising events */
  budget: unknown;
  /** sponsorship packages (price + sold) */
  sponsorPackages: RollupPackageRow[];
  /** ticket / table packages (price + sold + seats) */
  ticketPackages: RollupTicketRow[];
  /**
   * Sum of payments tied to the org's fundraising events when resolvable, else
   * null. When present it is the authoritative collected-revenue figure.
   */
  paymentsCollected: number | null;
  /** guest count from event_registrations / guests for linked events */
  guestCount: number;
  /** open task count whose due date is in the past */
  tasksOverdue: number;
  /**
   * Sponsor fulfillment status counts when a fulfillment table exists, else
   * null (degrade gracefully - the feature simply does not surface).
   */
  fulfillment: Record<string, number> | null;
}

export interface NonprofitRollup {
  goalAmount: number;
  budget: number;
  sponsorshipRevenue: number;
  ticketRevenue: number;
  committedRevenue: number;
  /** collected (payments) when resolvable, else committed */
  revenueCollected: number;
  revenueSource: "payments" | "committed";
  net: number;
  goalProgressPct: number;
  ticketsSoldSeats: number;
  guestCount: number;
  tasksOverdue: number;
  fulfillment: Record<string, number> | null;
  fulfillmentAvailable: boolean;
}

/**
 * Deterministically roll the loaded rows into the dashboard summary. Real data
 * only: committed revenue is derived from sold * price; collected revenue uses
 * the resolved payments sum when available and falls back to committed
 * otherwise. Empty inputs yield zeros (never fabricated revenue).
 */
export function computeNonprofitRollup(input: RollupInputs): NonprofitRollup {
  const goalAmount = num(input.goalAmount);
  const budget = num(input.budget);

  let sponsorshipRevenue = 0;
  for (const p of input.sponsorPackages ?? []) {
    sponsorshipRevenue += num(p.price) * num(p.sold);
  }

  let ticketRevenue = 0;
  let ticketsSoldSeats = 0;
  for (const t of input.ticketPackages ?? []) {
    const sold = num(t.sold);
    ticketRevenue += num(t.price) * sold;
    ticketsSoldSeats += sold * Math.max(1, num(t.seats));
  }

  const committedRevenue = sponsorshipRevenue + ticketRevenue;
  const usePayments =
    typeof input.paymentsCollected === "number" && input.paymentsCollected > 0;
  const revenueCollected = usePayments
    ? (input.paymentsCollected as number)
    : committedRevenue;
  const revenueSource: "payments" | "committed" = usePayments ? "payments" : "committed";

  const net = revenueCollected - budget;
  const goalProgressPct =
    goalAmount > 0 ? Math.min(100, Math.round((revenueCollected / goalAmount) * 100)) : 0;

  return {
    goalAmount,
    budget,
    sponsorshipRevenue,
    ticketRevenue,
    committedRevenue,
    revenueCollected,
    revenueSource,
    net,
    goalProgressPct,
    ticketsSoldSeats,
    guestCount: Math.max(0, Math.trunc(input.guestCount || 0)),
    tasksOverdue: Math.max(0, Math.trunc(input.tasksOverdue || 0)),
    fulfillment: input.fulfillment ?? null,
    fulfillmentAvailable: input.fulfillment != null,
  };
}
