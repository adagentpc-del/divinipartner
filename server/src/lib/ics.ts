/**
 * ICS (RFC 5545) calendar feed generation. PURE, dependency-free (no DB, no
 * config, no node modules) so it can be unit tested in isolation, same
 * rationale as pricingMath.ts and eventScope.ts.
 *
 * Powers the private, per-org .ics subscribe feed (webcal://): Apple/Google
 * Calendar subscribe to this URL and pull events on their own refresh
 * schedule. One-way only; nothing writes back from Apple/Google into this
 * app. See routes/calendar.ts.
 *
 * Zero em dashes.
 */

export type IcsEventInput = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  allDay?: boolean;
  status?: "confirmed" | "tentative" | "cancelled";
  updatedAt?: string | Date | null;
};

/** Fold lines longer than 75 octets per RFC 5545 (continuation lines start
 *  with a single space). Operates on the already-escaped property string. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

/** Escape TEXT values per RFC 5545 section 3.3.11 (backslash, semicolon,
 *  comma, then newlines to the literal \n escape). */
function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** UTC timestamp as YYYYMMDDTHHMMSSZ. */
function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** UTC date-only as YYYYMMDD (for all-day VALUE=DATE). */
function toUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Build a full VCALENDAR document (CRLF line endings, folded, escaped) for one
 * organization's calendar events. Cancelled events are still included with
 * STATUS:CANCELLED so a subscriber's calendar app reflects the cancellation
 * rather than silently keeping a stale event.
 */
export function buildIcsCalendar(calendarName: string, events: IcsEventInput[]): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Divini Partners//Calendar Feed//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`));
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  lines.push("X-PUBLISHED-TTL:PT1H");

  for (const ev of events) {
    const start = toDate(ev.startsAt);
    const end = toDate(ev.endsAt);
    const stamp = toDate(ev.updatedAt ?? new Date());
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${escapeText(ev.id)}@divinipartners.com`));
    lines.push(`DTSTAMP:${toUtcStamp(stamp)}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toUtcDate(start)}`);
      lines.push(`DTEND;VALUE=DATE:${toUtcDate(end)}`);
    } else {
      lines.push(`DTSTART:${toUtcStamp(start)}`);
      lines.push(`DTEND:${toUtcStamp(end)}`);
    }
    lines.push(foldLine(`SUMMARY:${escapeText(ev.title)}`));
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`));
    lines.push(`STATUS:${(ev.status ?? "confirmed").toUpperCase()}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
