/**
 * ICS calendar feed generation tests (server/src/lib/ics.ts). Pure and
 * deterministic; no DB, no network.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcsCalendar } from "../server/src/lib/ics.ts";

test("produces a well-formed VCALENDAR with CRLF line endings", () => {
  const ics = buildIcsCalendar("Test Venue", [
    {
      id: "evt-1",
      title: "Smith Wedding",
      startsAt: "2026-09-01T18:00:00.000Z",
      endsAt: "2026-09-01T23:00:00.000Z",
      status: "confirmed",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trim().endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("VERSION:2.0\r\n"));
  assert.ok(ics.includes("BEGIN:VEVENT\r\n"));
  assert.ok(ics.includes("END:VEVENT\r\n"));
  assert.ok(ics.includes("UID:evt-1@divinipartners.com\r\n"));
  assert.ok(ics.includes("DTSTART:20260901T180000Z\r\n"));
  assert.ok(ics.includes("DTEND:20260901T230000Z\r\n"));
  assert.ok(ics.includes("SUMMARY:Smith Wedding\r\n"));
  assert.ok(ics.includes("STATUS:CONFIRMED\r\n"));
  // Every line other than folded continuations must end CRLF, never bare LF.
  assert.equal(/(?<!\r)\n/.test(ics), false, "no bare LF anywhere in the output");
});

test("all-day events use VALUE=DATE, not a timestamp", () => {
  const ics = buildIcsCalendar("Test Venue", [
    { id: "evt-2", title: "Load-in day", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-02T00:00:00.000Z", allDay: true },
  ]);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260901\r\n"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20260902\r\n"));
});

test("cancelled events are included with STATUS:CANCELLED, not omitted", () => {
  const ics = buildIcsCalendar("Test Venue", [
    { id: "evt-3", title: "Cancelled hold", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-02T00:00:00.000Z", status: "cancelled" },
  ]);
  assert.ok(ics.includes("BEGIN:VEVENT\r\n"));
  assert.ok(ics.includes("STATUS:CANCELLED\r\n"));
});

test("special characters in title/description are escaped per RFC 5545", () => {
  const ics = buildIcsCalendar("Test Venue", [
    {
      id: "evt-4",
      title: "Smith, Jones; Doe",
      description: "Line one\nLine two, with a comma; and a semicolon",
      startsAt: "2026-09-01T18:00:00.000Z",
      endsAt: "2026-09-01T23:00:00.000Z",
    },
  ]);
  assert.ok(ics.includes("SUMMARY:Smith\\, Jones\\; Doe\r\n"));
  assert.ok(ics.includes("Line one\\nLine two\\, with a comma\\; and a semicolon"));
});

test("long lines are folded at 75 octets with a leading space continuation", () => {
  const longTitle = "A".repeat(120);
  const ics = buildIcsCalendar("Test Venue", [
    { id: "evt-5", title: longTitle, startsAt: "2026-09-01T18:00:00.000Z", endsAt: "2026-09-01T23:00:00.000Z" },
  ]);
  const summaryLineStart = ics.indexOf("SUMMARY:");
  const nextCrlf = ics.indexOf("\r\n", summaryLineStart);
  const firstPhysicalLine = ics.slice(summaryLineStart, nextCrlf);
  assert.ok(firstPhysicalLine.length <= 75, `first physical line should be <=75 chars, got ${firstPhysicalLine.length}`);
  // The continuation line must start with a single space per RFC 5545 folding.
  const afterFirstLine = ics.slice(nextCrlf + 2);
  assert.ok(afterFirstLine.startsWith(" "), "folded continuation must start with a space");
});

test("empty event list still produces a valid, empty calendar", () => {
  const ics = buildIcsCalendar("Empty Org", []);
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.equal(ics.includes("BEGIN:VEVENT"), false);
});
