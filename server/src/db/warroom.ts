/**
 * Intelligence Moat - F3 AI Event War Room data-access layer.
 *
 * Mirrors server/src/db/event-intel.ts conventions: every read/write is gated
 * through the events repo getEvent(), which throws NotFound/Forbidden, so a
 * scan or a state change can only happen against an event the actor can
 * already see (IDOR-safe). pool q/q1 helpers, Actor from db.ts.
 *
 *   - runScan(actor, eventId)
 *       Gathers the war-room signals (reusing gatherEventReadinessSignals from
 *       the Friction Elimination phase for the seven base readiness booleans,
 *       then layering operational counts), runs the pure scanner
 *       (lib/eventWarRoom.scanEvent), and merges any persisted snooze/resolve
 *       state from event_alert_states by alert code. No alert math lives here.
 *
 *   - setAlertState(actor, eventId, code, status, note)
 *       Upserts the operator's disposition (open|snoozed|resolved) for one
 *       alert code on one event.
 *
 * The alert set itself is computed live and never stored; only the disposition
 * persists (db/schema-im-warroom.sql).
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { gatherEventReadinessSignals } from "./event-intel.js";
import {
  scanEvent,
  SEVERITY_RANK,
  type WarRoomSignals,
  type WarRoomAlert,
  type AlertSeverity,
} from "../lib/eventWarRoom.js";

/** Persisted disposition of an alert code (open is the implicit default). */
export type AlertStatus = "open" | "snoozed" | "resolved";

/** An alert as returned to the client: the computed alert plus its persisted state. */
export type WarRoomAlertView = WarRoomAlert & {
  status: AlertStatus;
  note: string | null;
  updatedAt: string | null;
};

export type WarRoomResult = {
  eventId: string;
  scannedAt: string;
  counts: { critical: number; warning: number; info: number; open: number };
  alerts: WarRoomAlertView[];
};

type AlertStateRow = {
  alert_code: string;
  status: AlertStatus;
  note: string | null;
  updated_at: string | null;
};

const VALID_STATUS = new Set<AlertStatus>(["open", "snoozed", "resolved"]);

/** Whole days from now until the given timestamp (UTC-day granularity). Null when no date. */
function daysUntil(dateTime: string | null): number | null {
  if (!dateTime) return null;
  const t = Date.parse(dateTime);
  if (Number.isNaN(t)) return null;
  const ms = t - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Gather every signal the scanner needs for an event. Access-checked via
 * getEvent (through gatherEventReadinessSignals and again here implicitly by
 * the same actor + id). Reuses the Friction Elimination readiness signals and
 * adds the war-room operational facts.
 */
async function gatherWarRoomSignals(actor: Actor, eventId: string): Promise<WarRoomSignals> {
  // Seven base readiness booleans, reused verbatim (also serves as the access gate).
  const base = await gatherEventReadinessSignals(actor, eventId);
  const ev = await getEvent(actor, eventId);

  const guestCount = typeof ev.guest_count === "number" ? ev.guest_count : null;
  const budget = ev.budget != null && ev.budget !== "" ? Number(ev.budget) : null;
  const requiredServices = Array.isArray(ev.required_services) ? ev.required_services : [];

  // ---- vendors: count + unfilled required services -----------------------
  const vendorCountRow = await q1<{ n: number }>(
    `select count(distinct vendor_id)::int as n
       from event_vendors where event_id = $1 and vendor_id is not null`,
    [eventId],
  );
  const vendorCount = vendorCountRow?.n ?? 0;
  // A service slot is "filled" when an event_vendors row carries that role.
  const filledRolesRows = await q<{ role: string | null }>(
    `select distinct role from event_vendors where event_id = $1 and role is not null`,
    [eventId],
  );
  const filledRoles = new Set(filledRolesRows.map((r) => (r.role ?? "").toLowerCase()));
  const requiredServiceCount = requiredServices.length;
  const unfilledServiceCount = requiredServices.filter(
    (svc) => !filledRoles.has(String(svc).toLowerCase()),
  ).length;

  // ---- money: invoices + payments ----------------------------------------
  const moneyRow = await q1<{
    invoiced: number;
    balance: number;
    overdue: number;
  }>(
    `select
        coalesce(sum(coalesce(total, 0)), 0)::float8       as invoiced,
        coalesce(sum(coalesce(balance_due, 0)), 0)::float8 as balance,
        count(*) filter (where status = 'overdue')::int    as overdue
       from invoices where event_id = $1`,
    [eventId],
  );
  const payRow = await q1<{ paid: number; disputed: number }>(
    `select
        coalesce(sum(coalesce(p.amount, 0)), 0)::float8 as paid,
        count(*) filter (where p.status = 'disputed' or p.payout_status = 'disputed')::int as disputed
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.event_id = $1`,
    [eventId],
  );
  const invoicedTotal = moneyRow?.invoiced ?? 0;
  const balanceDue = moneyRow?.balance ?? 0;
  const paidTotal = payRow?.paid ?? 0;
  const hasOverdueInvoice = (moneyRow?.overdue ?? 0) > 0;
  const hasDisputedPayment = (payRow?.disputed ?? 0) > 0;

  // ---- documents: expiry + approvals -------------------------------------
  const docRow = await q1<{
    expired: number;
    expiring: number;
    pending: number;
    rejected: number;
  }>(
    `select
        count(*) filter (
          where expiration_date is not null and expiration_date < now()
        )::int as expired,
        count(*) filter (
          where expiration_date is not null
            and expiration_date >= now()
            and expiration_date < now() + interval '30 days'
        )::int as expiring,
        count(*) filter (where approval_status = 'pending')::int as pending,
        count(*) filter (
          where approval_status in ('rejected', 'requires_revision')
        )::int as rejected
       from documents where related_object_id = $1`,
    [eventId],
  );
  const expiredDocCount = docRow?.expired ?? 0;
  const expiringSoonDocCount = docRow?.expiring ?? 0;
  const pendingApprovalCount = docRow?.pending ?? 0;
  const rejectedApprovalCount = docRow?.rejected ?? 0;

  // ---- venue twin: insurance / permit / engineering / fire / capacity ----
  let insuranceRequired = false;
  let permitRequired = false;
  let engineeringRequired = false;
  let fireMarshalRequired = false;
  let venueCapacity: number | null = null;
  if (ev.venue_id) {
    const twinRow = await q1<{
      insurance_requirements: unknown;
      capacity: number | null;
    }>(
      `select insurance_requirements, capacity from venue_twin where venue_id = $1`,
      [ev.venue_id],
    );
    if (twinRow) {
      venueCapacity = typeof twinRow.capacity === "number" ? twinRow.capacity : null;
      insuranceRequired = twinRow.insurance_requirements != null;
    }
    // Permit / engineering / fire flags live on branding_opportunities for the venue.
    const reqRow = await q1<{ permit: number; engineering: number; fire: number; insurance: number }>(
      `select
          count(*) filter (where permit_required)::int        as permit,
          count(*) filter (where engineering_required)::int   as engineering,
          count(*) filter (where fire_marshal_required)::int  as fire,
          count(*) filter (where insurance_required)::int     as insurance
         from branding_opportunities where venue_id = $1`,
      [ev.venue_id],
    );
    if (reqRow) {
      permitRequired = (reqRow.permit ?? 0) > 0;
      engineeringRequired = (reqRow.engineering ?? 0) > 0;
      fireMarshalRequired = (reqRow.fire ?? 0) > 0;
      insuranceRequired = insuranceRequired || (reqRow.insurance ?? 0) > 0;
    }
  }

  // ---- installations ------------------------------------------------------
  const installRow = await q1<{ total: number; unapproved: number }>(
    `select
        count(*)::int                                       as total,
        count(*) filter (where venue_approved = false)::int as unapproved
       from installations where event_id = $1`,
    [eventId],
  );
  const hasInstallation = (installRow?.total ?? 0) > 0;
  const installationNeedsVenueApproval = (installRow?.unapproved ?? 0) > 0;

  // ---- sponsor deliverables (open inventory at the venue) ----------------
  let openSponsorDeliverableCount = 0;
  if (ev.venue_id) {
    const sponsorRow = await q1<{ n: number }>(
      `select count(*)::int as n
         from sponsorship_opportunities
        where venue_id = $1 and status = 'open'`,
      [ev.venue_id],
    );
    openSponsorDeliverableCount = sponsorRow?.n ?? 0;
  }

  return {
    ...base,
    daysToEvent: daysUntil(ev.date_time),
    status: ev.status ?? null,
    vendorCount,
    requiredServiceCount,
    unfilledServiceCount,
    invoicedTotal,
    paidTotal,
    balanceDue,
    budget: budget != null && !Number.isNaN(budget) ? budget : null,
    hasOverdueInvoice,
    hasDisputedPayment,
    expiredDocCount,
    expiringSoonDocCount,
    insuranceRequired,
    pendingApprovalCount,
    rejectedApprovalCount,
    permitRequired,
    engineeringRequired,
    fireMarshalRequired,
    guestCount,
    venueCapacity,
    hasInstallation,
    installationNeedsVenueApproval,
    openSponsorDeliverableCount,
    hasItinerary: base.timelineBuilt,
  };
}

/**
 * Run a full live scan for an event and merge persisted snooze/resolve state.
 * IDOR-safe (getEvent via the signal gatherer). Returns alerts sorted by
 * severity with open counts. Resolved/snoozed alerts are still returned (so the
 * UI can show them) but do not count toward the open total.
 */
export async function runScan(actor: Actor, eventId: string): Promise<WarRoomResult> {
  const signals = await gatherWarRoomSignals(actor, eventId);
  const alerts = scanEvent(signals);

  const stateRows = await q<AlertStateRow>(
    `select alert_code, status, note, updated_at
       from event_alert_states where event_id = $1`,
    [eventId],
  );
  const stateByCode = new Map<string, AlertStateRow>();
  for (const r of stateRows) stateByCode.set(r.alert_code, r);

  const counts = { critical: 0, warning: 0, info: 0, open: 0 };
  const views: WarRoomAlertView[] = alerts.map((a) => {
    const st = stateByCode.get(a.code);
    const status: AlertStatus = st?.status ?? "open";
    if (status === "open") {
      counts.open += 1;
      counts[a.severity] += 1;
    }
    return {
      ...a,
      status,
      note: st?.note ?? null,
      updatedAt: st?.updated_at ?? null,
    };
  });

  // Sort open alerts first, then by existing severity ordering from the scanner.
  views.sort((a, b) => {
    const ao = a.status === "open" ? 0 : 1;
    const bo = b.status === "open" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return r !== 0 ? r : a.code.localeCompare(b.code);
  });

  return {
    eventId,
    scannedAt: new Date().toISOString(),
    counts,
    alerts: views,
  };
}

/**
 * Upsert the operator's disposition for one alert code on one event.
 * Access-checked via getEvent (IDOR-safe). Validates status against the
 * allowed set. An empty/whitespace note is stored as null.
 */
export async function setAlertState(
  actor: Actor,
  eventId: string,
  code: string,
  status: AlertStatus,
  note: string | null,
): Promise<{ alert_code: string; status: AlertStatus; note: string | null; updated_at: string | null }> {
  await getEvent(actor, eventId); // access gate (IDOR-safe)

  const trimmedCode = String(code ?? "").trim();
  if (!trimmedCode) throw new Error("alert code is required");
  if (!VALID_STATUS.has(status)) throw new Error("invalid status");
  const cleanNote = note != null && String(note).trim() !== "" ? String(note).trim() : null;

  const row = await q1<{
    alert_code: string;
    status: AlertStatus;
    note: string | null;
    updated_at: string | null;
  }>(
    `insert into event_alert_states (event_id, alert_code, status, note, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, now())
     on conflict (event_id, alert_code)
       do update set status = excluded.status,
                     note = excluded.note,
                     updated_by = excluded.updated_by,
                     updated_at = now()
     returning alert_code, status, note, updated_at`,
    [eventId, trimmedCode, status, cleanNote, actor.user.id],
  );
  return row as { alert_code: string; status: AlertStatus; note: string | null; updated_at: string | null };
}

/** Re-exported for route-level typing convenience. */
export type { AlertSeverity };
