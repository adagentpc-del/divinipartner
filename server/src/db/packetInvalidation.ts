/**
 * Event Change -> Packet Invalidation (Final Event Schedule / Event
 * Execution Packet completion phase, Part 18, 2026-08-09).
 *
 * Do not silently leave an issued packet appearing current when
 * source-of-truth event data has changed after issuance. Callers that
 * mutate authoritative event data (updateEvent, setFinalCount,
 * submitVendorFinalQuantity) invoke checkAndMarkPacketStale() as a
 * best-effort side effect after their own write completes. It rebuilds a
 * live snapshot and runs it through the SAME diffPacketSnapshots() the
 * packet's own WHAT CHANGED feature uses against the current issued/final
 * packet version's stored snapshot; any real difference flips that
 * packet's status to the explicit 'update_required' state.
 *
 * Deliberately does NOT auto-generate a new version or auto-send it --
 * an uncontrolled auto-send on every event edit is exactly what the spec
 * warns against. Generating version N+1 stays an explicit planner action
 * (POST /execution-packet/event/:eventId/generate, unchanged).
 *
 * Imported via dynamic import() at each call site (events.ts,
 * finalCount.ts, vendorFinalQuantity.ts) rather than a static import,
 * because this module imports FROM executionPacket.ts, which itself
 * imports FROM events.ts -- a static import here would close that cycle
 * at module-load time. A dynamic import resolves at call time, once the
 * module graph is already loaded, so it never hits that problem.
 *
 * Zero em dashes.
 */
import { q1, pool } from "../pool.js";
import { buildExecutionPacket, diffPacketSnapshots, type ExecutionPacketSnapshot } from "./executionPacket.js";
import type { PacketDiffEntry } from "../lib/packetDiff.js";
import { SYSTEM_ACTOR } from "../lib/systemActor.js";

/**
 * A short, human-readable summary of WHY a packet went stale, e.g. "Run of
 * Show changed: DINNER SERVICE TIME: 7:15 PM -> 7:30 PM." (matches the
 * spec's mockup). Prefers a Run of Show change when one is present (the
 * most common day-of edit), otherwise the first real change, otherwise a
 * count of everything that changed.
 */
function summarizeReason(changes: PacketDiffEntry[]): string {
  const ros = changes.find((c) => c.label.startsWith("RUN OF SHOW:") || c.category === "schedule");
  const first = ros ?? changes[0];
  const prefix = ros ? "Run of Show changed: " : "";
  const label = first.label.startsWith("RUN OF SHOW:") ? first.label.slice("RUN OF SHOW:".length).trim() : first.label;
  const detail = `${label}: ${first.old_value} -> ${first.new_value}`;
  const rest = changes.length - 1;
  return rest > 0 ? `${prefix}${detail} (+${rest} more change${rest === 1 ? "" : "s"}).` : `${prefix}${detail}.`;
}

export async function checkAndMarkPacketStale(eventId: string): Promise<void> {
  try {
    const current = await q1<{ id: string; snapshot: ExecutionPacketSnapshot }>(
      `select id, snapshot from event_execution_packets
        where event_id = $1 and status in ('issued', 'final')
        order by version desc limit 1`,
      [eventId],
    );
    if (!current) return; // nothing issued yet, nothing to invalidate

    const live = await buildExecutionPacket(SYSTEM_ACTOR, eventId);
    const changes = diffPacketSnapshots(current.snapshot, live);
    if (changes.length === 0) return; // still matches, nothing to flag

    await pool.query(
      `update event_execution_packets set status = 'update_required', update_required_reason = $2 where id = $1`,
      [current.id, summarizeReason(changes)],
    );
  } catch {
    // Best-effort: a staleness-check failure must never undo or block the
    // actual authoritative-data write that triggered it.
  }
}
