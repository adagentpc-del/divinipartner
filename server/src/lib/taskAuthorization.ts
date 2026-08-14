/**
 * Task status self-service (live-ops phase, Part 23, 2026-08-09). Pure, no
 * DB -- matches the lib/eventRoles.ts / lib/inventoryMath.ts convention.
 *
 * EventDayMode's "Today's tasks" checklist (src/pages/event/EventDayMode.tsx)
 * shows every task to every operational participant on the ground and lets
 * any of them tap to mark one done -- a collaborative day-of checklist, not
 * per-person task ownership. db/tasks.ts's setTaskStatus() previously
 * enforced the same owner-only gate as addTask/updateTask/deleteTask, which
 * silently 403'd every non-owner tap on that checklist (a vendor or venue
 * rep could see the button but never actually use it). This narrows the
 * broadened access to STATUS ONLY -- name, assignment, due date, and
 * deletion remain owner/planner-only via requireOwner, unchanged.
 *
 * sponsor and read_only are deliberately excluded:
 *   - sponsor: the Command Center already treats sponsors as having no
 *     task visibility ("Sponsor own activation only" -- Part 24 gives
 *     sponsors their own activation checklist instead of generic ops
 *     tasks).
 *   - read_only: the role's name is the contract.
 * event_owner/planner already pass the pre-existing owns() check before
 * this is ever consulted, so they are not enumerated here.
 *
 * Zero em dashes.
 */
import type { EventRole } from "./eventRoles.js";

export function canSelfServeTaskStatus(role: EventRole | null): boolean {
  if (!role) return false;
  return role !== "sponsor" && role !== "read_only";
}
