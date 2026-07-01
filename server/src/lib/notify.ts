/**
 * Notifications. `deliver()` now sends real email when an email provider is
 * configured (see lib/email.ts); when it is not, it logs (the prior stub
 * behavior) so call sites are unchanged in every environment.
 */
import { sendEmail } from "./email.js";

export type NotifyKind =
  | "bid_posted"
  | "bid_invited"
  | "quote_submitted"
  | "quote_decision"
  | "message_posted"
  | "event_status_changed"
  | "welcome"
  | "support_received"
  | "feature_request_received"
  | "invoice_sent"
  | "payment_received"
  | "guest_list_updated"
  | "intake_assigned"
  | "quote_needs_review"
  | "pm_approval_needed"
  | "client_approved_quote"
  | "sponsor_interest"
  | "sponsor_purchased"
  | "sponsor_missing_asset"
  | "sponsor_fulfillment_due"
  | "guest_list_incomplete"
  | "vendor_task_overdue"
  | "donation_received"
  | "post_event_followup_due"
  | "auction_item_added"
  | "auction_won"
  | "auction_payment_due"
  | "volunteer_registered"
  | "volunteer_assigned"
  | "volunteer_shift_reminder"
  | "donor_receipt"
  | "donor_thank_you"
  | "monthly_giving_invite"
  | "board_report_ready"
  | "recap_ready"
  | "donor_prospect_identified"
  | "vendor_scorecard_updated"
  // ---- Final addendum kinds (revenue share + referral + security + compliance) ----
  | "referral_converted"
  | "referral_credit_earned"
  | "partner_commission_earned"
  | "partner_payout_sent"
  | "circumvention_flagged"
  | "login_alert"
  | "security_event"
  | "privacy_request_received"
  | "revenue_share_updated";

export interface NotifyPayload {
  kind: NotifyKind;
  to: string | string[];
  subject: string;
  /** Plain context for the future template renderer. */
  context?: Record<string, unknown>;
}

/**
 * The single seam a future phase replaces with the real sender. For now it logs.
 * Returns the payload so callers can assert/inspect in tests.
 */
export async function deliver(payload: NotifyPayload): Promise<NotifyPayload> {
  const recipients = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
  // eslint-disable-next-line no-console
  console.log(
    `[notify] kind=${payload.kind} to=${recipients} subject="${payload.subject}"`,
    payload.context ?? {},
  );
  // Build a simple text body from the subject + any link/message in context.
  const ctx = payload.context ?? {};
  const url = typeof ctx.url === "string" ? ctx.url : typeof ctx.link === "string" ? ctx.link : "";
  const note = typeof ctx.message === "string" ? ctx.message : "";
  const text = [payload.subject, note, url ? `Open Divini Partners: ${url}` : ""].filter(Boolean).join("\n\n");
  await sendEmail({ to: payload.to, subject: payload.subject, text }).catch(() => null);
  return payload;
}

/** Convenience builders so routes do not assemble subjects inline. */
export const notify = {
  bidPosted: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "bid_posted", to, subject: `New bid posted for ${eventName}`, context: ctx }),
  bidInvited: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "bid_invited", to, subject: `You were invited to bid on ${eventName}`, context: ctx }),
  quoteSubmitted: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "quote_submitted", to, subject: `New quote for ${eventName}`, context: ctx }),
  quoteDecision: (to: string | string[], decision: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "quote_decision", to, subject: `Quote ${decision}`, context: ctx }),
  messagePosted: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "message_posted", to, subject: `New message on ${eventName}`, context: ctx }),
  eventStatusChanged: (to: string | string[], eventName: string, status: string, ctx?: Record<string, unknown>) =>
    deliver({
      kind: "event_status_changed",
      to,
      subject: `${eventName} is now ${status}`,
      context: ctx,
    }),

  /**
   * Registration + terms-acceptance confirmation. Welcomes the new partner and
   * records, in plain language, that they accepted the platform policies on
   * signup. Sent best-effort right after the org and user are created.
   */
  welcome: (to: string | string[], orgName: string, ctx?: Record<string, unknown>) =>
    deliver({
      kind: "welcome",
      to,
      subject: `Welcome to Divini Partners, ${orgName}`,
      context: {
        ...ctx,
        message: [
          `Welcome to Divini Partners. Your account for ${orgName} is ready.`,
          "You accepted the Terms, Privacy, Payment, and Non-Circumvention policies on signup.",
          "Sign in any time to complete your profile, list your offering, and connect with partners.",
        ].join("\n\n"),
      },
    }),

  /** Confirms a support ticket was received, with a short reference. */
  supportReceived: (to: string | string[], ticketRef: string, ctx?: Record<string, unknown>) =>
    deliver({
      kind: "support_received",
      to,
      subject: `We received your support request (${ticketRef})`,
      context: {
        ...ctx,
        message: [
          `Thank you for reaching out. Your support request has been received and logged under reference ${ticketRef}.`,
          "Our team will review it and follow up. You can reply to this message or check your dashboard for updates.",
        ].join("\n\n"),
      },
    }),

  /** Confirms a feature request or feedback submission was received. */
  featureRequestReceived: (to: string | string[], ctx?: Record<string, unknown>) =>
    deliver({
      kind: "feature_request_received",
      to,
      subject: "We received your feature request",
      context: {
        ...ctx,
        message: [
          "Thank you for sharing your idea. Your feature request has been received and added to our review queue.",
          "We weigh every request as we shape the roadmap, and we will keep you posted on its progress.",
        ].join("\n\n"),
      },
    }),

  /** Notifies a recipient that an invoice has been issued to them. */
  invoiceSent: (to: string | string[], invoiceNumber: string, ctx?: Record<string, unknown>) =>
    deliver({
      kind: "invoice_sent",
      to,
      subject: `Invoice ${invoiceNumber} from Divini Partners`,
      context: {
        ...ctx,
        message: [
          `Invoice ${invoiceNumber} has been issued and is ready for your review.`,
          "You can view the full invoice, including line items and payment terms, from your dashboard.",
        ].join("\n\n"),
      },
    }),

  /** Confirms a payment was received against an invoice or balance. */
  paymentReceived: (to: string | string[], amount: string, ctx?: Record<string, unknown>) =>
    deliver({
      kind: "payment_received",
      to,
      subject: `Payment received: ${amount}`,
      context: {
        ...ctx,
        message: [
          `We have received your payment of ${amount}. Thank you.`,
          "Your account and invoice records have been updated to reflect this payment.",
        ].join("\n\n"),
      },
    }),

  /**
   * Notifies a vendor org that the guest list for an event they opted into has
   * changed. Sent best-effort from the guest-list sync hook to vendors whose
   * vendor_event_requirements row has needs_guest_list or needs_headcount set.
   * The optional summary line carries the new headcount so the vendor can act
   * without opening the app.
   */
  guestListUpdated: (
    to: string | string[],
    eventName: string,
    summaryLine?: string,
    ctx?: Record<string, unknown>,
  ) =>
    deliver({
      kind: "guest_list_updated",
      to,
      subject: `Guest list updated for ${eventName}`,
      context: {
        ...ctx,
        message: [
          `The guest list for ${eventName} has changed.`,
          summaryLine || "",
          "Open Divini Partners to review the latest headcount and details for your scope.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    }),

  // ---- Phase 1 platform-upgrade kinds (vendor pipeline + sponsorship + nonprofit) ----

  /** A new intake/lead was assigned to an account exec on a vendor team. */
  intakeAssigned: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "intake_assigned", to, subject: `New intake assigned: ${eventName}`, context: ctx }),

  /** A drafted quote needs sales-manager review before it goes to the client. */
  quoteNeedsReview: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "quote_needs_review", to, subject: `Quote needs review for ${eventName}`, context: ctx }),

  /** A project manager approval is required to advance the job. */
  pmApprovalNeeded: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "pm_approval_needed", to, subject: `PM approval needed for ${eventName}`, context: ctx }),

  /** The client approved the quote; the vendor team can proceed. */
  clientApprovedQuote: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "client_approved_quote", to, subject: `Client approved the quote for ${eventName}`, context: ctx }),

  /** A sponsor expressed interest in an event package. */
  sponsorInterest: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "sponsor_interest", to, subject: `New sponsor interest in ${eventName}`, context: ctx }),

  /** A sponsor purchased a sponsorship package. */
  sponsorPurchased: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "sponsor_purchased", to, subject: `Sponsorship purchased for ${eventName}`, context: ctx }),

  /** A sponsor still owes a fulfillment asset (logo, copy, artwork). */
  sponsorMissingAsset: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "sponsor_missing_asset", to, subject: `Missing sponsor asset for ${eventName}`, context: ctx }),

  /** A sponsorship fulfillment deliverable is due. */
  sponsorFulfillmentDue: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "sponsor_fulfillment_due", to, subject: `Sponsor fulfillment due for ${eventName}`, context: ctx }),

  /** The guest list for an event is incomplete and blocks downstream work. */
  guestListIncomplete: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "guest_list_incomplete", to, subject: `Guest list incomplete for ${eventName}`, context: ctx }),

  /** A vendor team task has passed its due date. */
  vendorTaskOverdue: (to: string | string[], taskName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "vendor_task_overdue", to, subject: `Task overdue: ${taskName}`, context: ctx }),

  /** A donation was received for a nonprofit fundraising campaign. */
  donationReceived: (to: string | string[], amount: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "donation_received", to, subject: `Donation received: ${amount}`, context: ctx }),

  /** A post-event follow-up (recap, thank-you, renewal) is due. */
  postEventFollowupDue: (to: string | string[], eventName: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "post_event_followup_due", to, subject: `Post-event follow-up due for ${eventName}`, context: ctx }),

  // ---- Phase 2/3 platform-upgrade kinds (auction + volunteer + donor + reporting) ----

  /** A new item was added to a fundraising auction. */
  auctionItemAdded: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "auction_item_added", to, subject: `New auction item added: ${label}`, context: ctx }),

  /** A bidder won an auction item. */
  auctionWon: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "auction_won", to, subject: `You won the auction for ${label}`, context: ctx }),

  /** Payment is due on a won auction item. */
  auctionPaymentDue: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "auction_payment_due", to, subject: `Payment due for ${label}`, context: ctx }),

  /** A volunteer registered for an event. */
  volunteerRegistered: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "volunteer_registered", to, subject: `Volunteer registered: ${label}`, context: ctx }),

  /** A volunteer was assigned to a role or shift. */
  volunteerAssigned: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "volunteer_assigned", to, subject: `Volunteer assignment: ${label}`, context: ctx }),

  /** A reminder for an upcoming volunteer shift. */
  volunteerShiftReminder: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "volunteer_shift_reminder", to, subject: `Upcoming volunteer shift: ${label}`, context: ctx }),

  /** A tax-deductible donation receipt for the donor. */
  donorReceipt: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "donor_receipt", to, subject: `Your donation receipt: ${label}`, context: ctx }),

  /** A thank-you message sent to a donor. */
  donorThankYou: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "donor_thank_you", to, subject: `Thank you from ${label}`, context: ctx }),

  /** An invitation to join a monthly recurring giving program. */
  monthlyGivingInvite: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "monthly_giving_invite", to, subject: `Become a monthly supporter of ${label}`, context: ctx }),

  /** A board report is ready for review. */
  boardReportReady: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "board_report_ready", to, subject: `Board report ready: ${label}`, context: ctx }),

  /** A post-event or campaign recap is ready. */
  recapReady: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "recap_ready", to, subject: `Recap ready: ${label}`, context: ctx }),

  /** A potential major-gift donor prospect was identified. */
  donorProspectIdentified: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "donor_prospect_identified", to, subject: `New donor prospect identified: ${label}`, context: ctx }),

  /** A vendor performance scorecard was updated. */
  vendorScorecardUpdated: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "vendor_scorecard_updated", to, subject: `Vendor scorecard updated: ${label}`, context: ctx }),

  // ---- Final addendum kinds (revenue share + referral + security + compliance) ----

  /** A referred lead converted into a paying account or first transaction. */
  referralConverted: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "referral_converted", to, subject: `Your referral converted: ${label}`, context: ctx }),

  /** A referral credit was earned and applied to the referrer's account. */
  referralCreditEarned: (to: string | string[], amount: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "referral_credit_earned", to, subject: `Referral credit earned: ${amount}`, context: ctx }),

  /** A partner commission (revenue share) was earned on a transaction. */
  partnerCommissionEarned: (to: string | string[], amount: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "partner_commission_earned", to, subject: `Commission earned: ${amount}`, context: ctx }),

  /** A partner payout for earned commissions or credits was sent. */
  partnerPayoutSent: (to: string | string[], amount: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "partner_payout_sent", to, subject: `Payout sent: ${amount}`, context: ctx }),

  /** A possible anti-circumvention (off-platform dealing) signal was flagged. */
  circumventionFlagged: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "circumvention_flagged", to, subject: `Circumvention flag raised: ${label}`, context: ctx }),

  /** A login from a new device, location, or unusual context was detected. */
  loginAlert: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "login_alert", to, subject: `New sign-in alert: ${label}`, context: ctx }),

  /** A security-relevant account event (password, MFA, key, role change). */
  securityEvent: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "security_event", to, subject: `Security event: ${label}`, context: ctx }),

  /** A privacy or data-subject request (export, deletion) was received. */
  privacyRequestReceived: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "privacy_request_received", to, subject: `Privacy request received: ${label}`, context: ctx }),

  /** A revenue-share rate or commission agreement was updated. */
  revenueShareUpdated: (to: string | string[], label: string, ctx?: Record<string, unknown>) =>
    deliver({ kind: "revenue_share_updated", to, subject: `Revenue share updated: ${label}`, context: ctx }),
};
