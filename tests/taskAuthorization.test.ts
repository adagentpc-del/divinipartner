/**
 * Regression tests for task status self-service (lib/taskAuthorization.ts,
 * Part 23). Locks in which real event roles may self-serve a task's
 * STATUS-ONLY update from EventDayMode's collaborative "Today's tasks"
 * checklist.
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSelfServeTaskStatus } from "../server/src/lib/taskAuthorization.ts";
import { EVENT_ROLES, type EventRole } from "../server/src/lib/eventRoles.ts";

test("no role (not a real event participant) cannot self-serve", () => {
  assert.equal(canSelfServeTaskStatus(null), false);
});

test("sponsor cannot self-serve task status -- the command center already treats sponsors as having no task visibility", () => {
  assert.equal(canSelfServeTaskStatus("sponsor"), false);
});

test("read_only cannot self-serve task status", () => {
  assert.equal(canSelfServeTaskStatus("read_only"), false);
});

test("every other real event role can self-serve task status", () => {
  const excluded = new Set<EventRole>(["sponsor", "read_only"]);
  for (const role of EVENT_ROLES) {
    if (excluded.has(role)) continue;
    assert.equal(canSelfServeTaskStatus(role), true, `expected ${role} to self-serve`);
  }
});
