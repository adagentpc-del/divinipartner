/**
 * Intelligence Moat - F3 AI Event War Room.
 *
 * Pure, deterministic per-event health scanner. Given a set of signals
 * gathered from the event record (see server/src/db/warroom.ts), it returns a
 * list of alerts, each with a stable code, a severity, a human message, and a
 * specific recommended next action. No DB calls, no network, no AI. The same
 * inputs always produce the same output, so the war room is reproducible and
 * testable.
 *
 * The seven base readiness signals are reused verbatim from the Friction
 * Elimination phase (lib/eventReadiness.ts, ReadinessSignals). The war room
 * layers richer operational signals on top (insurance/contract/approval/
 * payment specifics, document expiry, permit deadlines, vendor gaps, timeline,
 * capacity, budget, sponsor deliverables, guest experience). Scoring math is
 * NOT duplicated here; the war room is about actionable alerts, not a number.
 *
 * Alert codes are stable strings so the persistence layer
 * (event_alert_states.alert_code) can carry snooze/resolve state across scans.
 * Do not rename a code once shipped.
 */

import type { ReadinessSignals } from "./eventReadiness.js";

/** Alert severity, ordered low -> high for grouping and sorting. */
export type AlertSeverity = "info" | "warning" | "critical";

/** A single computed health alert for an event. */
export type WarRoomAlert = {
  code: string;
  severity: AlertSeverity;
  message: string;
  recommendation: string;
};

/**
 * Everything the scanner needs, gathered deterministically by the DB layer.
 * Extends the seven readiness booleans with counts and the operational facts
 * the richer alert checks need. All optional richer fields default to a safe
 * value in the scanner so partial inputs never throw.
 */
export type WarRoomSignals = ReadinessSignals & {
  // ---- timing -------------------------------------------------------------
  /** Whole days until the event starts. Negative once the event is in the past. Null when no date is set. */
  daysToEvent: number | null;
  /** Lifecycle status from events.status, when known. */
  status: string | null;

  // ---- vendors ------------------------------------------------------------
  /** Distinct vendors attached (event_vendors). */
  vendorCount: number;
  /** Required service slots declared on the event (events.required_services length). */
  requiredServiceCount: number;
  /** How many of the required service slots still have no attached vendor. */
  unfilledServiceCount: number;

  // ---- money --------------------------------------------------------------
  /** Sum of invoice totals for the event. */
  invoicedTotal: number;
  /** Sum of recorded payments for the event. */
  paidTotal: number;
  /** Sum of outstanding balance_due across the event's invoices. */
  balanceDue: number;
  /** The event's planned budget (events.budget), when set. */
  budget: number | null;
  /** Whether any invoice is in an 'overdue' state. */
  hasOverdueInvoice: boolean;
  /** Whether any payment is disputed. */
  hasDisputedPayment: boolean;

  // ---- documents / compliance --------------------------------------------
  /** Count of event-related documents whose expiration_date has passed. */
  expiredDocCount: number;
  /** Count of event-related documents expiring within the alert horizon (30 days). */
  expiringSoonDocCount: number;
  /** Insurance is required by the venue twin for this event's venue. */
  insuranceRequired: boolean;

  // ---- approvals ----------------------------------------------------------
  /** Count of documents related to the event that are still pending approval. */
  pendingApprovalCount: number;
  /** Count of documents related to the event that were rejected / require revision. */
  rejectedApprovalCount: number;

  // ---- permits / engineering (from venue twin) ---------------------------
  /** Venue twin flags a permit is required for this venue. */
  permitRequired: boolean;
  /** Venue twin flags engineering sign-off is required. */
  engineeringRequired: boolean;
  /** Venue twin flags fire-marshal sign-off is required. */
  fireMarshalRequired: boolean;

  // ---- capacity -----------------------------------------------------------
  /** Expected guest count (events.guest_count), when set. */
  guestCount: number | null;
  /** Venue capacity from the venue twin, when known. */
  venueCapacity: number | null;

  // ---- timeline / install -------------------------------------------------
  /** At least one installation row is scheduled for the event. */
  hasInstallation: boolean;
  /** An installation exists but the venue has not approved it. */
  installationNeedsVenueApproval: boolean;

  // ---- sponsors -----------------------------------------------------------
  /** Sponsorship opportunities tied to the event's venue that are still open (unsold inventory / unfulfilled). */
  openSponsorDeliverableCount: number;

  // ---- guest experience ---------------------------------------------------
  /** Itinerary / run-of-show exists (alias of timelineBuilt, kept explicit for guest-experience checks). */
  hasItinerary: boolean;
};

/** Horizon (days) within which a future deadline becomes a warning. */
const DEADLINE_HORIZON_DAYS = 30;
/** Tighter horizon (days) that escalates a deadline to critical. */
const DEADLINE_CRITICAL_DAYS = 14;

/** Severity rank for sorting (critical first). */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Run the full deterministic scan. Returns alerts sorted critical -> info,
 * then by code for stable ordering. Callers merge persisted snooze/resolve
 * state on top by matching alert.code.
 */
export function scanEvent(signals: WarRoomSignals): WarRoomAlert[] {
  const s = signals;
  const alerts: WarRoomAlert[] = [];
  const add = (a: WarRoomAlert) => alerts.push(a);

  const near = s.daysToEvent != null && s.daysToEvent >= 0 && s.daysToEvent <= DEADLINE_HORIZON_DAYS;
  const veryNear = s.daysToEvent != null && s.daysToEvent >= 0 && s.daysToEvent <= DEADLINE_CRITICAL_DAYS;

  // ---- vendors ------------------------------------------------------------
  if (!s.vendorsSelected || s.vendorCount === 0) {
    add({
      code: "missing_vendors",
      severity: veryNear ? "critical" : "warning",
      message: "No vendors are attached to this event yet.",
      recommendation: "Add the vendors the event needs, or post the open scopes to the bid board.",
    });
  } else if (s.unfilledServiceCount > 0) {
    add({
      code: "vendor_gaps",
      severity: veryNear ? "critical" : "warning",
      message: `${s.unfilledServiceCount} required service slot${s.unfilledServiceCount === 1 ? "" : "s"} still ${s.unfilledServiceCount === 1 ? "has" : "have"} no vendor.`,
      recommendation: "Fill the remaining service slots or remove them from the required list.",
    });
  }

  // ---- insurance ----------------------------------------------------------
  if (!s.insuranceUploaded) {
    add({
      code: "missing_insurance",
      severity: s.insuranceRequired || veryNear ? "critical" : "warning",
      message: s.insuranceRequired
        ? "The venue requires insurance and no certificate of insurance is on file."
        : "No certificate of insurance is on file for this event.",
      recommendation: "Upload the certificate(s) of insurance (COI) and route them for venue approval.",
    });
  }

  // ---- contracts ----------------------------------------------------------
  if (!s.contractsSigned) {
    add({
      code: "missing_contracts",
      severity: veryNear ? "critical" : "warning",
      message: "No signed contracts or accepted quotes are recorded for this event.",
      recommendation: "Get vendor quotes accepted and contracts signed before locking the event.",
    });
  }

  // ---- approvals ----------------------------------------------------------
  if (s.rejectedApprovalCount > 0) {
    add({
      code: "rejected_approvals",
      severity: "critical",
      message: `${s.rejectedApprovalCount} document${s.rejectedApprovalCount === 1 ? "" : "s"} ${s.rejectedApprovalCount === 1 ? "was" : "were"} rejected or need revision.`,
      recommendation: "Revise and resubmit the rejected documents, then re-route for approval.",
    });
  }
  if (s.pendingApprovalCount > 0) {
    add({
      code: "missing_approvals",
      severity: near ? "warning" : "info",
      message: `${s.pendingApprovalCount} document${s.pendingApprovalCount === 1 ? "" : "s"} ${s.pendingApprovalCount === 1 ? "is" : "are"} still awaiting approval.`,
      recommendation: "Follow up with the approvers to clear the pending items.",
    });
  }

  // ---- payments -----------------------------------------------------------
  if (s.hasDisputedPayment) {
    add({
      code: "disputed_payment",
      severity: "critical",
      message: "A payment on this event is disputed.",
      recommendation: "Open the dispute, reconcile the charge, and resolve it before the event date.",
    });
  }
  if (s.hasOverdueInvoice || (s.balanceDue > 0 && veryNear)) {
    add({
      code: "missing_payments",
      severity: s.hasOverdueInvoice ? "critical" : "warning",
      message: s.hasOverdueInvoice
        ? "An invoice on this event is overdue."
        : `There is an outstanding balance of ${formatMoney(s.balanceDue)} with the event approaching.`,
      recommendation: "Collect the outstanding balance or record the payment before the event date.",
    });
  } else if (!s.paymentsMade && s.invoicedTotal > 0) {
    add({
      code: "no_payments_recorded",
      severity: near ? "warning" : "info",
      message: "Invoices exist but no payments have been recorded.",
      recommendation: "Record deposits and payments so the money trail matches the invoices.",
    });
  }

  // ---- documents: expiry --------------------------------------------------
  if (s.expiredDocCount > 0) {
    add({
      code: "expired_documents",
      severity: "critical",
      message: `${s.expiredDocCount} document${s.expiredDocCount === 1 ? "" : "s"} on this event ${s.expiredDocCount === 1 ? "has" : "have"} expired.`,
      recommendation: "Replace the expired documents with current versions before the event.",
    });
  } else if (s.expiringSoonDocCount > 0) {
    add({
      code: "expiring_documents",
      severity: "warning",
      message: `${s.expiringSoonDocCount} document${s.expiringSoonDocCount === 1 ? "" : "s"} ${s.expiringSoonDocCount === 1 ? "expires" : "expire"} within ${DEADLINE_HORIZON_DAYS} days.`,
      recommendation: "Renew the expiring documents so coverage stays valid through the event.",
    });
  }

  // ---- permit / engineering / fire deadlines ------------------------------
  if (s.permitRequired && near) {
    add({
      code: "permit_deadline",
      severity: veryNear ? "critical" : "warning",
      message: `The venue requires a permit and the event is ${deadlinePhrase(s.daysToEvent)}.`,
      recommendation: "Confirm the permit application is filed and approved well before load-in.",
    });
  }
  if (s.engineeringRequired && near) {
    add({
      code: "engineering_deadline",
      severity: veryNear ? "critical" : "warning",
      message: `The venue requires engineering sign-off and the event is ${deadlinePhrase(s.daysToEvent)}.`,
      recommendation: "Get stamped engineering drawings approved before any rigging or install.",
    });
  }
  if (s.fireMarshalRequired && near) {
    add({
      code: "fire_marshal_deadline",
      severity: veryNear ? "critical" : "warning",
      message: `The venue requires fire-marshal approval and the event is ${deadlinePhrase(s.daysToEvent)}.`,
      recommendation: "Schedule the fire-marshal walkthrough and submit the layout for sign-off.",
    });
  }

  // ---- timeline risk ------------------------------------------------------
  if (!s.timelineBuilt) {
    add({
      code: "timeline_risk",
      severity: veryNear ? "critical" : near ? "warning" : "info",
      message: s.daysToEvent != null && s.daysToEvent >= 0
        ? `No run-of-show is built and the event is ${deadlinePhrase(s.daysToEvent)}.`
        : "No run-of-show / timeline has been built for this event.",
      recommendation: "Build the event timeline so install, event-day, and teardown windows are locked.",
    });
  }
  if (s.hasInstallation && s.installationNeedsVenueApproval) {
    add({
      code: "install_not_approved",
      severity: near ? "warning" : "info",
      message: "An installation is scheduled but the venue has not approved it.",
      recommendation: "Submit the install plan to the venue and confirm approval before load-in.",
    });
  }

  // ---- capacity risk ------------------------------------------------------
  if (s.guestCount != null && s.venueCapacity != null && s.venueCapacity > 0) {
    if (s.guestCount > s.venueCapacity) {
      add({
        code: "capacity_risk",
        severity: "critical",
        message: `Expected guests (${s.guestCount}) exceed venue capacity (${s.venueCapacity}).`,
        recommendation: "Reduce the guest count or move to a larger space; the venue cannot host this headcount.",
      });
    } else if (s.guestCount >= Math.floor(s.venueCapacity * 0.95)) {
      add({
        code: "capacity_tight",
        severity: "warning",
        message: `Expected guests (${s.guestCount}) are at or near venue capacity (${s.venueCapacity}).`,
        recommendation: "Confirm the final headcount and the venue's hard limit; leave margin for staff and vendors.",
      });
    }
  }

  // ---- budget risk --------------------------------------------------------
  if (s.budget != null && s.budget > 0 && s.invoicedTotal > s.budget) {
    const over = s.invoicedTotal - s.budget;
    add({
      code: "budget_risk",
      severity: s.invoicedTotal > s.budget * 1.1 ? "critical" : "warning",
      message: `Invoiced total (${formatMoney(s.invoicedTotal)}) is over the ${formatMoney(s.budget)} budget by ${formatMoney(over)}.`,
      recommendation: "Review line items for overages or get the client to approve a revised budget.",
    });
  }

  // ---- sponsor deliverables ----------------------------------------------
  if (s.openSponsorDeliverableCount > 0) {
    add({
      code: "sponsor_deliverables",
      severity: near ? "warning" : "info",
      message: `${s.openSponsorDeliverableCount} sponsor deliverable${s.openSponsorDeliverableCount === 1 ? "" : "s"} at this venue ${s.openSponsorDeliverableCount === 1 ? "is" : "are"} still open.`,
      recommendation: "Confirm sponsor inventory is sold and fulfilled, or close it out before the event.",
    });
  }

  // ---- guest experience ---------------------------------------------------
  if (!s.guestListComplete) {
    add({
      code: "guest_list_incomplete",
      severity: near ? "warning" : "info",
      message: "The guest list is not built out toward the expected count.",
      recommendation: "Finish the guest list so RSVPs, seating, and check-in are accurate.",
    });
  }
  if (s.guestListComplete && !s.hasItinerary) {
    add({
      code: "guest_experience_gap",
      severity: "info",
      message: "Guests are confirmed but there is no run-of-show to guide their experience.",
      recommendation: "Publish a guest-facing timeline so arrivals, sessions, and flow are clear.",
    });
  }

  alerts.sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return r !== 0 ? r : a.code.localeCompare(b.code);
  });
  return alerts;
}

/** Round to whole dollars with a $ prefix; deterministic, locale-free. */
function formatMoney(n: number): string {
  const v = Math.round(n);
  return `$${v.toLocaleString("en-US")}`;
}

/** Human phrase for a non-negative days-to-event count. */
function deadlinePhrase(days: number | null): string {
  if (days == null) return "approaching";
  if (days <= 0) return "today or in the past";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
