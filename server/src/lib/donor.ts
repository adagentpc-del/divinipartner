/**
 * Nonprofit donor + follow-up helpers (Phase 2).
 *
 * Pure, deterministic helpers shared by the donor repo + routes. No DB work, no
 * randomness: the same inputs always yield the same output.
 *
 *   * Enum guards for donation status / method and the follow-up task kind +
 *     status (used by the routes/repo to reject bad input before a write).
 *   * FOLLOWUP_WORKFLOW: the canonical, ordered set of follow-up task kinds that
 *     the post-event follow-up generator creates for a fundraising event.
 */

// ---- Donation enum guards ---------------------------------------------------

export const DONATION_STATUSES = ["recorded", "received", "refunded"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];
const DONATION_STATUS_SET = new Set<string>(DONATION_STATUSES);
export function isDonationStatus(v: unknown): v is DonationStatus {
  return typeof v === "string" && DONATION_STATUS_SET.has(v);
}

// ---- Follow-up task enum guards --------------------------------------------

export const FOLLOWUP_KINDS = [
  "thank_you",
  "donor_receipt",
  "sponsor_recap",
  "monthly_giving_invite",
  "next_event_invite",
  "volunteer_thanks",
  "board_report",
  "fundraising_summary",
] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];
const FOLLOWUP_KIND_SET = new Set<string>(FOLLOWUP_KINDS);
export function isFollowupKind(v: unknown): v is FollowupKind {
  return typeof v === "string" && FOLLOWUP_KIND_SET.has(v);
}

export const FOLLOWUP_STATUSES = ["pending", "sent", "done", "skipped"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];
const FOLLOWUP_STATUS_SET = new Set<string>(FOLLOWUP_STATUSES);
export function isFollowupStatus(v: unknown): v is FollowupStatus {
  return typeof v === "string" && FOLLOWUP_STATUS_SET.has(v);
}

// ---- Post-event follow-up workflow -----------------------------------------

/** Human label for each follow-up kind (used for the generated task target/name). */
export const FOLLOWUP_LABELS: Record<FollowupKind, string> = {
  thank_you: "Send thank-you messages to attendees",
  donor_receipt: "Issue tax-deductible donor receipts",
  sponsor_recap: "Send sponsors their recap and fulfillment summary",
  monthly_giving_invite: "Invite donors to the monthly giving program",
  next_event_invite: "Invite attendees to the next event",
  volunteer_thanks: "Thank volunteers and staff",
  board_report: "Prepare the board report",
  fundraising_summary: "Publish the fundraising summary",
};

/**
 * The canonical, ordered set of follow-up task kinds the post-event workflow
 * generator creates for a fundraising event. Order is the recommended sequence.
 */
export const FOLLOWUP_WORKFLOW: readonly FollowupKind[] = FOLLOWUP_KINDS;
