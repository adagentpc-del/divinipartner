/**
 * Nonprofit post-event recap helpers (Phase 2).
 *
 * Pure, deterministic helpers that turn the best-effort rows the recap repo
 * loads (sponsorship packages, ticket packages, donations, auction results,
 * resolved payments, guest count) into a structured fundraising performance
 * recap for a single fundraising event. Real data only: the same inputs always
 * yield the same output, and empty inputs yield zeros - nothing is fabricated.
 *
 * Revenue mirrors server/src/lib/fundraising.ts: collected = resolved payments
 * when available (and tied to the event), else committed = sponsorship sold*price
 * + ticket sold*price + donations + paid auction. The board report text is a
 * deterministic rendering of those same numbers.
 */
import { num } from "./fundraising.js";

export interface RecapPackageRow {
  price: unknown;
  sold: unknown;
}
export interface RecapTicketRow {
  price: unknown;
  sold: unknown;
  seats: unknown;
}

export interface RecapInputs {
  eventName: string;
  eventKind: string | null;
  eventDate: string | null;
  goalAmount: unknown;
  budget: unknown;
  sponsorPackages: RecapPackageRow[];
  ticketPackages: RecapTicketRow[];
  /** sum of donation amounts for this event (recorded + received, not refunded) */
  donationsTotal: unknown;
  /** number of donation records counted into donationsTotal */
  donationCount: number;
  /**
   * sum of winning_bid for paid auction items tied to this event, or null when
   * the auction_items table does not exist (graceful degrade).
   */
  auctionRevenue: number | null;
  /**
   * resolved payments tied to the event when available, else null. When present
   * (> 0) it is the authoritative collected figure, overriding committed.
   */
  paymentsCollected: number | null;
  /** guest count from event_registrations / guests for the linked event */
  guestCount: number;
}

export interface RecapReport {
  eventName: string;
  eventKind: string | null;
  eventDate: string | null;
  goalAmount: number;
  sponsorshipRevenue: number;
  ticketRevenue: number;
  auctionRevenue: number;
  auctionAvailable: boolean;
  donationsTotal: number;
  donationCount: number;
  committedRevenue: number;
  totalRaised: number;
  revenueSource: "payments" | "committed";
  expenses: number;
  netRaised: number;
  goalProgressPct: number;
  guestCount: number;
  sponsorRecap: string;
  boardReport: string;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Deterministically build the recap report for one fundraising event. Committed
 * revenue is sponsorship sold*price + ticket sold*price + donations + paid
 * auction; collected uses the resolved payments sum when available and falls
 * back to committed otherwise.
 */
export function computeRecap(input: RecapInputs): RecapReport {
  const goalAmount = num(input.goalAmount);
  const expenses = num(input.budget);

  let sponsorshipRevenue = 0;
  for (const p of input.sponsorPackages ?? []) {
    sponsorshipRevenue += num(p.price) * num(p.sold);
  }

  let ticketRevenue = 0;
  for (const t of input.ticketPackages ?? []) {
    ticketRevenue += num(t.price) * num(t.sold);
  }

  const donationsTotal = num(input.donationsTotal);
  const auctionAvailable = typeof input.auctionRevenue === "number";
  const auctionRevenue = auctionAvailable ? (input.auctionRevenue as number) : 0;

  const committedRevenue =
    sponsorshipRevenue + ticketRevenue + donationsTotal + auctionRevenue;

  const usePayments =
    typeof input.paymentsCollected === "number" && input.paymentsCollected > 0;
  const totalRaised = usePayments
    ? (input.paymentsCollected as number)
    : committedRevenue;
  const revenueSource: "payments" | "committed" = usePayments ? "payments" : "committed";

  const netRaised = totalRaised - expenses;
  const goalProgressPct =
    goalAmount > 0 ? Math.min(100, Math.round((totalRaised / goalAmount) * 100)) : 0;
  const guestCount = Math.max(0, Math.trunc(input.guestCount || 0));

  const sponsorRecap =
    sponsorshipRevenue > 0
      ? `Sponsorship raised ${money(sponsorshipRevenue)} across committed packages. Send each sponsor their recap and fulfillment confirmation.`
      : "No sponsorship revenue recorded for this event yet.";

  const boardReportLines = [
    `Fundraising recap: ${input.eventName}`,
    input.eventDate ? `Date: ${new Date(input.eventDate).toLocaleDateString("en-US")}` : null,
    "",
    `Goal: ${money(goalAmount)}`,
    `Total raised: ${money(totalRaised)} (${goalProgressPct}% of goal, source: ${revenueSource})`,
    `  - Sponsorship: ${money(sponsorshipRevenue)}`,
    `  - Tickets / tables: ${money(ticketRevenue)}`,
    `  - Donations: ${money(donationsTotal)} (${Math.max(0, Math.trunc(input.donationCount || 0))} gifts)`,
    auctionAvailable ? `  - Auction (paid): ${money(auctionRevenue)}` : null,
    `Expenses (budget): ${money(expenses)}`,
    `Net raised: ${money(netRaised)}`,
    `Guests: ${guestCount}`,
  ].filter((l): l is string => l !== null);

  return {
    eventName: input.eventName,
    eventKind: input.eventKind,
    eventDate: input.eventDate,
    goalAmount,
    sponsorshipRevenue,
    ticketRevenue,
    auctionRevenue,
    auctionAvailable,
    donationsTotal,
    donationCount: Math.max(0, Math.trunc(input.donationCount || 0)),
    committedRevenue,
    totalRaised,
    revenueSource,
    expenses,
    netRaised,
    goalProgressPct,
    guestCount,
    sponsorRecap,
    boardReport: boardReportLines.join("\n"),
  };
}
