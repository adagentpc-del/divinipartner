/**
 * Event Financial Reconciliation + Settlement (live-ops phase, Part
 * 28-31, 2026-08-09).
 *
 * Audited existing money infrastructure first (per the spec instruction)
 * rather than building a parallel system: this reuses the pre-existing
 * `invoices`, `payments`, and `change_orders` tables as the sole sources
 * of truth -- no new payment recording path, no new fee computation, and
 * NO money-moving action of any kind. Payments in this codebase are
 * already ledger-only (db/payments.ts: "NO real payment processor is
 * integrated... record amounts, compute fee breakdown, track payout
 * status"); actual Stripe transfers happen on a completely separate,
 * pre-existing rail (lib/stripe-connect.ts's createTransfer, driven by
 * payout_instructions) that this file does not touch. Reconciliation
 * here means exactly what db/closeout.ts's header already named it:
 * the RECONCILE step after CLOSE -- verifying the event's own invoices/
 * payments/change orders are internally consistent before SETTLE.
 *
 * Same deterministic-checks-from-real-data + audited-override pattern as
 * db/readiness.ts (Start Event) and db/closeout.ts (Close Event):
 *   - BLOCKING: any invoice in 'disputed' status; any change order
 *     'accepted' by the client but never rolled into an invoice (money
 *     agreed to but not yet billed is a real gap, not a stylistic one).
 *   - WARNING only: any invoice still carrying an outstanding balance --
 *     legitimately still being collected at this point, not a reason to
 *     block settlement on its own.
 *
 * Settlement (markEventSettled) is a one-time, audited attestation
 * ("the books are closed") recorded in event_settlements, gated on a
 * clean reconciliation (or an audited override, logged in audit_logs
 * exactly like Start/Close Event). The completion gate (Part 31) wires
 * this into db/events.ts's setEventStatus for the narrow completed ->
 * closed transition ONLY (never a blanket rule on every event reaching
 * 'closed' from any prior status elsewhere in the app -- that would
 * regress event flows that never entered this live-ops phase at all).
 *
 * Access: owner/planner (canManageEvent) or the 'finance' event role --
 * the same grouping vendorFinalQuantity.ts's affected_scopes and
 * packetDistribution.ts already use for financially-sensitive data. No
 * other role (venue, vendor, sponsor, event_staff) can see or act on
 * this.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor, ForbiddenError, NotFoundError } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { recordActivity } from "./eventActivity.js";

async function requireFinanceAccess(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId);
  if (await canManageEvent(actor, eventId)) return;
  const role = await getEventRole(actor, eventId);
  if (role === "finance") return;
  throw new ForbiddenError("only the event owner, planner, or finance can view event financial reconciliation");
}

type InvoiceMoney = { total: string | null; balance_due: string | null; status: string | null };
type PaymentMoney = { amount: string | null; platform_fee: string | null; processing_fee: string | null; net_payout: string | null };
type ChangeOrderMoney = { status: string | null };

function num(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type ReconciliationCheckSeverity = "blocking" | "warning";
export type ReconciliationCheck = {
  id: string;
  label: string;
  status: "complete" | "missing";
  severity: ReconciliationCheckSeverity;
  message: string;
};
export type ReconciliationState = "not_ready" | "needs_attention" | "ready" | "ready_with_warnings";

export type ReconciliationTotals = {
  invoiced_total: number;
  paid_total: number;
  outstanding_total: number;
  platform_fees_total: number;
  processing_fees_total: number;
  net_payable_total: number;
};

export type ReconciliationReport = {
  event_id: string;
  state: ReconciliationState;
  totals: ReconciliationTotals;
  blocking: ReconciliationCheck[];
  warnings: ReconciliationCheck[];
  completed: ReconciliationCheck[];
  generated_at: string;
};

function recCheck(
  id: string,
  label: string,
  ok: boolean,
  severity: ReconciliationCheckSeverity,
  okMessage: string,
  missingMessage: string,
): ReconciliationCheck {
  return { id, label, status: ok ? "complete" : "missing", severity, message: ok ? okMessage : missingMessage };
}

/** Deterministic, real-data reconciliation -- always fresh, never a
 *  stored counter that could drift from invoices/payments/change_orders
 *  as they keep changing. */
export async function computeEventReconciliation(actor: Actor, eventId: string): Promise<ReconciliationReport> {
  await requireFinanceAccess(actor, eventId);

  const [invoices, payments, changeOrders] = await Promise.all([
    q<InvoiceMoney>(`select total, balance_due, status from invoices where event_id = $1`, [eventId]),
    q<PaymentMoney>(`select amount, platform_fee, processing_fee, net_payout from payments where event_id = $1`, [eventId]),
    q<ChangeOrderMoney>(`select status from change_orders where event_id = $1`, [eventId]),
  ]);

  const totals: ReconciliationTotals = {
    invoiced_total: invoices.reduce((s, i) => s + num(i.total), 0),
    paid_total: payments.reduce((s, p) => s + num(p.amount), 0),
    outstanding_total: invoices
      .filter((i) => i.status !== "paid" && i.status !== "closed" && i.status !== "refunded")
      .reduce((s, i) => s + num(i.balance_due), 0),
    platform_fees_total: payments.reduce((s, p) => s + num(p.platform_fee), 0),
    processing_fees_total: payments.reduce((s, p) => s + num(p.processing_fee), 0),
    net_payable_total: payments.reduce((s, p) => s + num(p.net_payout), 0),
  };

  const checks: ReconciliationCheck[] = [];

  const disputed = invoices.filter((i) => i.status === "disputed");
  checks.push(
    recCheck(
      "invoices.no_disputed",
      "No disputed invoices",
      disputed.length === 0,
      "blocking",
      "No invoices are under dispute.",
      `${disputed.length} invoice(s) are under dispute and must be resolved before settling.`,
    ),
  );

  const unbilled = changeOrders.filter((c) => c.status === "accepted");
  checks.push(
    recCheck(
      "change_orders.billed",
      "Accepted change orders billed",
      unbilled.length === 0,
      "blocking",
      changeOrders.length > 0 ? "Every accepted change order has been added to an invoice." : "No change orders on this event.",
      `${unbilled.length} accepted change order(s) have not yet been added to an invoice.`,
    ),
  );

  const outstandingInvoices = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "closed" && i.status !== "refunded" && num(i.balance_due) > 0,
  );
  checks.push(
    recCheck(
      "invoices.no_outstanding",
      "No outstanding balances",
      outstandingInvoices.length === 0,
      "warning",
      invoices.length > 0 ? "Every invoice is fully paid." : "No invoices on this event.",
      `${outstandingInvoices.length} invoice(s) still carry an outstanding balance.`,
    ),
  );

  const completed = checks.filter((c) => c.status === "complete");
  const blocking = checks.filter((c) => c.status === "missing" && c.severity === "blocking");
  const warnings = checks.filter((c) => c.status === "missing" && c.severity === "warning");

  let state: ReconciliationState;
  if (blocking.length > 0) state = "not_ready";
  else if (warnings.length === 0) state = "ready";
  else state = "ready_with_warnings";

  return { event_id: eventId, state, totals, blocking, warnings, completed, generated_at: new Date().toISOString() };
}

export type EventSettlementRow = {
  id: string;
  event_id: string;
  settled_by: string | null;
  invoiced_total: string;
  paid_total: string;
  outstanding_total: string;
  platform_fees_total: string;
  processing_fees_total: string;
  net_payable_total: string;
  state: string;
  overrode_blocking: boolean;
  notes: string | null;
  created_at: string;
};

export async function getEventSettlement(actor: Actor, eventId: string): Promise<EventSettlementRow | null> {
  await requireFinanceAccess(actor, eventId);
  return q1<EventSettlementRow>(`select * from event_settlements where event_id = $1`, [eventId]);
}

/** Thrown when a caller tries to settle an event with blocking
 *  reconciliation issues outstanding and no override -- mirrors
 *  ReadinessBlockedError/CloseoutBlockedError exactly. */
export class ReconciliationBlockedError extends Error {
  status = 409;
  blocking: ReconciliationCheck[];
  state: ReconciliationState;
  constructor(report: ReconciliationReport) {
    super(`event is not ready to settle: ${report.blocking.length} blocking issue(s)`);
    this.name = "ReconciliationBlockedError";
    this.blocking = report.blocking;
    this.state = report.state;
  }
}

/** One-time, audited attestation that the event's books are settled.
 *  Never moves money -- purely a snapshot + sign-off record. */
export async function markEventSettled(
  actor: Actor,
  eventId: string,
  input: { notes?: string | null; override?: boolean },
): Promise<EventSettlementRow> {
  await requireFinanceAccess(actor, eventId);
  const existing = await q1<{ id: string }>(`select id from event_settlements where event_id = $1`, [eventId]);
  if (existing) throw new ForbiddenError("this event has already been settled");

  const report = await computeEventReconciliation(actor, eventId);
  let overrode = false;
  if (report.blocking.length > 0) {
    if (!input.override) throw new ReconciliationBlockedError(report);
    overrode = true;
  }

  // The existence check above is a TOCTOU race under real concurrency --
  // two simultaneous settle requests can both pass it before either
  // commits its insert. The unique constraint on event_settlements.event_id
  // is the actual source of truth that prevents a duplicate row (verified
  // live: concurrent settle attempts always leave exactly one row), but
  // without this catch the loser saw a raw, unhandled 23505 as a 500
  // instead of the same clean "already settled" message the pre-check
  // gives a caller who loses a slower race.
  let row: EventSettlementRow | null;
  try {
    row = await q1<EventSettlementRow>(
      `insert into event_settlements
         (event_id, settled_by, invoiced_total, paid_total, outstanding_total,
          platform_fees_total, processing_fees_total, net_payable_total, state, overrode_blocking, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        eventId,
        actor.user.id,
        report.totals.invoiced_total,
        report.totals.paid_total,
        report.totals.outstanding_total,
        report.totals.platform_fees_total,
        report.totals.processing_fees_total,
        report.totals.net_payable_total,
        report.state,
        overrode,
        input.notes ?? null,
      ],
    );
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      throw new ForbiddenError("this event has already been settled");
    }
    throw e;
  }
  const settlement = row as EventSettlementRow;

  await recordActivity(actor, eventId, {
    category: "closeout",
    message: overrode
      ? `Event settled with ${report.blocking.length} blocking reconciliation issue(s) overridden`
      : "Event settled",
    relatedEntityType: "event_settlement",
    relatedEntityId: settlement.id,
    severity: overrode ? "warning" : "info",
  });

  return settlement;
}

/** True when the event has a settlement record -- used by db/events.ts's
 *  setEventStatus() to gate the completed -> closed transition (Part 31's
 *  completion gate). */
export async function isEventSettled(eventId: string): Promise<boolean> {
  const row = await q1<{ id: string }>(`select id from event_settlements where event_id = $1`, [eventId]);
  return !!row;
}

/** Thrown by db/events.ts's setEventStatus() when a caller tries to move
 *  an event from completed to closed with no event_settlements record yet
 *  and no override (Part 31's completion gate). Once a settlement exists
 *  -- clean or overridden -- this never fires again, since settling
 *  itself is already the audited checkpoint. */
export class NotSettledError extends Error {
  status = 409;
  constructor() {
    super("event has not been financially settled yet");
    this.name = "NotSettledError";
  }
}
