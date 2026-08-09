/**
 * Timezone-aware Execution Packet distribution scheduling (Final Event
 * Schedule / Event Execution Packet completion phase, Part 7-8, 2026-08-09).
 *
 * Pure, no DB, no config, no external timezone library -- uses only
 * Intl.DateTimeFormat (built into Node) to resolve a IANA timezone's actual
 * UTC offset at a given instant, which correctly accounts for DST. Matches
 * the lib/scheduleWindows.ts convention (that file's existing itinerary-
 * email distribution stays untouched; this is a distinct job for Execution
 * Packet distribution, added alongside it in lib/scheduler.ts, not a new
 * scheduler).
 *
 * Honesty note: computeSendMoment resolves the timezone offset using a
 * same-calendar-day UTC approximation of the target moment. This can be off
 * by the DST delta (usually 1 hour) in the rare case where the target
 * send-time-of-day falls within the same local day as a DST transition
 * itself (typically 2am local) -- an acceptable approximation for a
 * business scheduling feature, not a precision timekeeping requirement.
 *
 * Zero em dashes.
 */

export type DistributionPreset = "14d" | "10d" | "7d" | "5d" | "72h" | "48h" | "24h" | "custom";

export const DISTRIBUTION_PRESETS: DistributionPreset[] = [
  "14d", "10d", "7d", "5d", "72h", "48h", "24h", "custom",
];

const PRESET_MINUTES: Record<Exclude<DistributionPreset, "custom">, number> = {
  "14d": 14 * 24 * 60,
  "10d": 10 * 24 * 60,
  "7d": 7 * 24 * 60,
  "5d": 5 * 24 * 60,
  "72h": 72 * 60,
  "48h": 48 * 60,
  "24h": 24 * 60,
};

export function isDistributionPreset(v: unknown): v is DistributionPreset {
  return typeof v === "string" && (DISTRIBUTION_PRESETS as string[]).includes(v);
}

/** Resolve a preset (or explicit custom minutes) to a minutes-before-event offset. */
export function resolveOffsetMinutes(preset: DistributionPreset, customMinutes: number | null): number {
  if (preset === "custom") {
    return typeof customMinutes === "number" && customMinutes > 0 ? customMinutes : 24 * 60;
  }
  return PRESET_MINUTES[preset];
}

/** The IANA timezone's UTC offset (ms) at the given instant, DST-correct. */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/**
 * The UTC instant corresponding to `sendTimeOfDay` ("HH:mm") local wall-clock
 * time, on the calendar date `offsetMinutes` before `eventDateTime` (also
 * read in `timezone`).
 */
export function computeSendMoment(
  eventDateTime: Date,
  offsetMinutes: number,
  timezone: string,
  sendTimeOfDay: string,
): Date {
  const targetDayUtc = new Date(eventDateTime.getTime() - offsetMinutes * 60_000);
  const [hh, mm] = sendTimeOfDay.split(":").map((n) => Number(n));
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(targetDayUtc);
  const y = Number(dateParts.find((p) => p.type === "year")!.value);
  const m = Number(dateParts.find((p) => p.type === "month")!.value);
  const d = Number(dateParts.find((p) => p.type === "day")!.value);
  const utcGuess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const offsetMs = tzOffsetMs(timezone, new Date(utcGuess));
  return new Date(utcGuess - offsetMs);
}

/**
 * True when the configured send moment has passed but the event itself has
 * not yet started. The actual "have we already sent this" guarantee lives
 * in the DB (event_packet_deliveries, claimed via insert-on-conflict), so a
 * wide predicate here (true for the rest of the window, not just an instant)
 * is safe -- same rationale as lib/scheduleWindows.ts.
 */
export function isDueForDistribution(
  eventDateTime: Date,
  offsetMinutes: number,
  timezone: string,
  sendTimeOfDay: string,
  now: Date = new Date(),
): boolean {
  if (eventDateTime.getTime() <= now.getTime()) return false;
  const sendMoment = computeSendMoment(eventDateTime, offsetMinutes, timezone, sendTimeOfDay);
  return now.getTime() >= sendMoment.getTime();
}
