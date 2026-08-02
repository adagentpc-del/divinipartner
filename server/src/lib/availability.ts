/**
 * Calendar availability math. PURE, dependency-free (no DB, no config, no node
 * modules) so it can be unit tested in isolation, same rationale as
 * pricingMath.ts / eventScope.ts / ics.ts.
 *
 * The PUBLIC availability view (routes/calendar.ts GET /:orgId/availability)
 * exposes only merged busy time windows, never event titles/descriptions/kind
 * - a client should be able to see a venue is booked on a date without seeing
 * what it's booked for.
 *
 * Zero em dashes.
 */

export type BusyWindow = { startsAt: string; endsAt: string };

type CalendarEventLike = {
  starts_at: string | Date;
  ends_at: string | Date;
  status?: string | null;
};

function toIso(v: string | Date): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/**
 * Merge overlapping/adjacent busy windows into the minimal sorted set.
 * Cancelled events never block availability. "Adjacent" (one ends exactly
 * when the next starts) is merged too, so a subscriber sees one continuous
 * block rather than two touching ones.
 */
export function mergeBusyWindows(events: CalendarEventLike[]): BusyWindow[] {
  const active = events
    .filter((e) => (e.status ?? "confirmed") !== "cancelled")
    .map((e) => ({ start: new Date(e.starts_at).getTime(), end: new Date(e.ends_at).getTime() }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const w of active) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }

  return merged.map((w) => ({ startsAt: toIso(new Date(w.start)), endsAt: toIso(new Date(w.end)) }));
}

/** True when [aStart, aEnd] overlaps [bStart, bEnd] (touching endpoints do not
 *  count as overlap, so a booking can start the instant another ends). */
export function windowsOverlap(
  aStart: string | Date,
  aEnd: string | Date,
  bStart: string | Date,
  bEnd: string | Date,
): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}
