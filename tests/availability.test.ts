/**
 * Calendar availability math tests (server/src/lib/availability.ts). Pure and
 * deterministic; no DB, no network.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBusyWindows, windowsOverlap } from "../server/src/lib/availability.ts";

test("non-overlapping windows pass through unchanged, sorted by start", () => {
  const merged = mergeBusyWindows([
    { starts_at: "2026-09-10T00:00:00Z", ends_at: "2026-09-11T00:00:00Z" },
    { starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-02T00:00:00Z" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].startsAt, new Date("2026-09-01T00:00:00Z").toISOString());
  assert.equal(merged[1].startsAt, new Date("2026-09-10T00:00:00Z").toISOString());
});

test("overlapping windows merge into one", () => {
  const merged = mergeBusyWindows([
    { starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T14:00:00Z" },
    { starts_at: "2026-09-01T12:00:00Z", ends_at: "2026-09-01T18:00:00Z" },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].startsAt, new Date("2026-09-01T10:00:00Z").toISOString());
  assert.equal(merged[0].endsAt, new Date("2026-09-01T18:00:00Z").toISOString());
});

test("adjacent windows (touching endpoints) merge into one continuous block", () => {
  const merged = mergeBusyWindows([
    { starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T14:00:00Z" },
    { starts_at: "2026-09-01T14:00:00Z", ends_at: "2026-09-01T18:00:00Z" },
  ]);
  assert.equal(merged.length, 1);
});

test("cancelled events never block availability", () => {
  const merged = mergeBusyWindows([
    { starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T14:00:00Z", status: "cancelled" },
  ]);
  assert.equal(merged.length, 0);
});

test("tentative and confirmed both count as busy", () => {
  const merged = mergeBusyWindows([
    { starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T14:00:00Z", status: "tentative" },
    { starts_at: "2026-09-02T10:00:00Z", ends_at: "2026-09-02T14:00:00Z", status: "confirmed" },
  ]);
  assert.equal(merged.length, 2);
});

test("windowsOverlap: touching endpoints are not an overlap", () => {
  assert.equal(
    windowsOverlap("2026-09-01T10:00:00Z", "2026-09-01T14:00:00Z", "2026-09-01T14:00:00Z", "2026-09-01T18:00:00Z"),
    false,
  );
});

test("windowsOverlap: genuine overlap is detected", () => {
  assert.equal(
    windowsOverlap("2026-09-01T10:00:00Z", "2026-09-01T14:00:00Z", "2026-09-01T12:00:00Z", "2026-09-01T18:00:00Z"),
    true,
  );
});

test("windowsOverlap: one window fully containing another is an overlap", () => {
  assert.equal(
    windowsOverlap("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", "2026-09-01T10:00:00Z", "2026-09-01T14:00:00Z"),
    true,
  );
});
