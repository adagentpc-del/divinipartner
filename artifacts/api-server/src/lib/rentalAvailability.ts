import { db, inventoryTable, inventoryReservationsTable, inventoryBlackoutsTable, eventsTable } from "@workspace/db";
import { and, eq, sql, isNull, or, lte, gte } from "drizzle-orm";

/**
 * Section 27: date-aware availability for a single inventory row.
 *
 * Computes how many units are usable for an arbitrary date range [start, end],
 * factoring in:
 *   - the row's totalQuantity
 *   - permanently-unavailable buckets: damaged + retired
 *   - in_use (currently checked out, no end date stored — treated as ongoing)
 *   - inventory_reservations whose [startDate,endDate] overlaps the window
 *     (rows with NULL dates fall back to inventoryTable.reserved counter so
 *      legacy reservations still subtract — see "legacyReservedFloor" below)
 *   - inventory_blackouts whose [startDate,endDate] overlaps the window
 *
 * If start/end are omitted we report instantaneous availability (today),
 * which matches what the existing list views already expect.
 */
export type RangeAvailability = {
  inventoryId: number;
  totalQuantity: number;
  damaged: number;
  retired: number;
  inUse: number;
  reservedInWindow: number;
  blackedOutInWindow: number;
  available: number;
  conflicts: Array<{
    kind: "reservation" | "blackout";
    id: number;
    quantity: number;
    startDate: string | null;
    endDate: string | null;
    eventId: number | null;
    reason: string | null;
    note: string | null;
  }>;
  status: "available" | "partial" | "fully_booked" | "blacked_out";
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getInventoryAvailabilityForRange(
  inventoryId: number,
  startDate?: string | null,
  endDate?: string | null,
): Promise<RangeAvailability | null> {
  const start = startDate || todayIso();
  const end = endDate || start;

  const [row] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, inventoryId));
  if (!row) return null;

  // Overlap test: a record [s,e] overlaps [start,end] iff s <= end AND e >= start.
  // NULL-date reservations are treated as "covers all time" so they always count.
  const reservations = await db
    .select({
      id: inventoryReservationsTable.id,
      quantity: inventoryReservationsTable.quantity,
      startDate: inventoryReservationsTable.startDate,
      endDate: inventoryReservationsTable.endDate,
      eventId: inventoryReservationsTable.eventId,
      holdReason: inventoryReservationsTable.holdReason,
      notes: inventoryReservationsTable.notes,
      status: inventoryReservationsTable.status,
    })
    .from(inventoryReservationsTable)
    .where(and(
      eq(inventoryReservationsTable.inventoryId, inventoryId),
      eq(inventoryReservationsTable.status, "active"),
      or(
        and(isNull(inventoryReservationsTable.startDate), isNull(inventoryReservationsTable.endDate)),
        and(
          or(isNull(inventoryReservationsTable.startDate), lte(inventoryReservationsTable.startDate, end)),
          or(isNull(inventoryReservationsTable.endDate), gte(inventoryReservationsTable.endDate, start)),
        ),
      ),
    ));

  const blackouts = await db
    .select()
    .from(inventoryBlackoutsTable)
    .where(and(
      eq(inventoryBlackoutsTable.inventoryId, inventoryId),
      lte(inventoryBlackoutsTable.startDate, end),
      gte(inventoryBlackoutsTable.endDate, start),
    ));

  // Window math is computed strictly from reservation rows so different date
  // windows see independent capacity. Date-bound rows count only when they
  // overlap the window; NULL-date rows are the legacy "covers all time"
  // path and always count. The rolling inventory.reserved counter is kept
  // updated for backward-compat with older code, but it is intentionally
  // NOT used here (mixing it in double-counted overlapping reservations).
  const reservedFromWindowed = reservations
    .filter(r => r.startDate || r.endDate)
    .reduce((s, r) => s + r.quantity, 0);
  const legacyReserved = reservations
    .filter(r => !r.startDate && !r.endDate)
    .reduce((s, r) => s + r.quantity, 0);
  const reservedInWindow = reservedFromWindowed + legacyReserved;

  const blackedOutInWindow = blackouts.reduce((s, b) => s + b.quantity, 0);

  const accounted = row.inUse + row.damaged + row.retired + reservedInWindow + blackedOutInWindow;
  const available = Math.max(0, row.totalQuantity - accounted);

  let status: RangeAvailability["status"];
  if (row.totalQuantity > 0 && blackedOutInWindow >= row.totalQuantity) status = "blacked_out";
  else if (available === 0) status = "fully_booked";
  else if (available < row.totalQuantity) status = "partial";
  else status = "available";

  return {
    inventoryId,
    totalQuantity: row.totalQuantity,
    damaged: row.damaged,
    retired: row.retired,
    inUse: row.inUse,
    reservedInWindow,
    blackedOutInWindow,
    available,
    status,
    conflicts: [
      ...reservations.map(r => ({
        kind: "reservation" as const, id: r.id, quantity: r.quantity,
        startDate: r.startDate, endDate: r.endDate, eventId: r.eventId,
        reason: r.holdReason, note: r.notes,
      })),
      ...blackouts.map(b => ({
        kind: "blackout" as const, id: b.id, quantity: b.quantity,
        startDate: b.startDate, endDate: b.endDate, eventId: b.eventId,
        reason: b.reason, note: b.reasonNote,
      })),
    ],
  };
}

/**
 * Resolve the date window for an event. Used to bind new reservations to the
 * event's actual dates rather than just storing an unbounded reservation. Falls
 * back to single-day if no end date exists.
 */
export async function getEventDateWindow(eventId: number): Promise<{ startDate: string; endDate: string } | null> {
  const [ev] = await db.select({
    eventDate: eventsTable.eventStartDate,
    installDate: eventsTable.installDate,
    teardownDate: eventsTable.teardownDate,
  }).from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!ev) return null;
  // Prefer install→teardown (the real on-site window) when present, else fall
  // back to the single event date.
  const start = (ev.installDate as any) || (ev.eventDate as any);
  const end = (ev.teardownDate as any) || (ev.eventDate as any) || start;
  if (!start) return null;
  const toIso = (d: any) => (typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10));
  return { startDate: toIso(start), endDate: toIso(end) };
}

/**
 * Check whether a given inventory row is eligible for a given event/city per
 * the partner-set eligibility rules.
 */
export function isEligibleForEvent(
  row: { eligibilityMode: string; eligibleEventIds: number[] | null; eligibleCityIds: number[] | null; cityId: number },
  eventId: number | null,
  eventCityId: number | null,
): boolean {
  if (row.eligibilityMode === "all") return true;
  // Allowlist mode: deny by default if we don't know the event. Otherwise
  // require the event to be in the allowlist. The city check is a separate
  // optional narrowing — if the partner set city restrictions, the event's
  // city must be on it.
  const eventList = row.eligibleEventIds ?? [];
  const cityList = row.eligibleCityIds ?? [];
  const okEvent = eventId != null && eventList.includes(eventId);
  const okCity = cityList.length === 0 || (eventCityId != null && cityList.includes(eventCityId));
  return okEvent && okCity;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Validate that a query string looks like an ISO date and that start <= end if both present. */
export function parseDateRange(start?: string | null, end?: string | null): { ok: true; start: string | null; end: string | null } | { ok: false; error: string } {
  if (start && !ISO_DATE_RE.test(start)) return { ok: false, error: "start must be YYYY-MM-DD" };
  if (end && !ISO_DATE_RE.test(end)) return { ok: false, error: "end must be YYYY-MM-DD" };
  const s = start || null;
  const e = end || s;
  if (s && e && s > e) return { ok: false, error: "start must be on or before end" };
  return { ok: true, start: s, end: e };
}
