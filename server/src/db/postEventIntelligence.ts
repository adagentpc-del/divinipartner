/**
 * Post-Event Intelligence Digest (live-ops phase, Part 37-38, 2026-08-09).
 *
 * A single, read-only aggregator over systems that already exist and
 * already self-scope their own visibility -- vendor performance
 * (db/vendorEventPerformance.ts, Part 32-33), sponsor fulfillment
 * (db/eventSponsorActivation.ts, Part 23-24), incidents
 * (db/incidents.ts, Part 15-16), reconciliation totals
 * (db/reconciliation.ts, Part 28-31, finance-only), and the activity
 * timeline (db/eventActivity.ts, Part 11-12). Nothing here computes a
 * NEW number -- every field is a direct call into a system that already
 * derives it correctly and already enforces its own role-based
 * visibility, so this module adds zero new authorization surface for
 * those fields. The one section that IS genuinely gated further here is
 * reconciliation: it throws for anyone who is not owner/planner/finance,
 * so it is simply omitted from the digest for every other viewer rather
 * than letting that error propagate and break the whole digest.
 *
 * Distinct from the pre-existing archival hooks (db/completion.ts's
 * recordEventArchive -> event_memory/event_history): those are a
 * point-in-time SNAPSHOT taken once, on terminal status, for permanent
 * record-keeping. This digest is a live, re-runnable READ any time
 * during CLOSE/RECONCILE (or later), always fresh, never stored.
 *
 * Zero em dashes.
 */
import { type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { listVendorEventPerformance, type VendorEventPerformanceRow } from "./vendorEventPerformance.js";
import { listActivations, activationSummary } from "./eventSponsorActivation.js";
import type { SponsorActivationRow, SponsorActivationSummary } from "./eventSponsorActivation.js";
import { listIncidents } from "./incidents.js";
import { computeEventReconciliation, type ReconciliationReport } from "./reconciliation.js";
import { listActivity } from "./eventActivity.js";

export type SponsorFulfillmentReport = {
  summary: SponsorActivationSummary;
  /** Average minutes from an activation item's creation to its completion,
   *  across every item this viewer can see that has actually completed --
   *  a real, derived duration, never a fabricated ROI/impressions figure
   *  (no such data exists anywhere in this codebase for a live, executed
   *  main-events sponsorship -- see server/src/db/postEventIntelligence.ts's
   *  header). null when nothing has completed yet. */
  avg_completion_minutes: number | null;
};

export type PostEventDigest = {
  event_id: string;
  event_name: string;
  event_status: string | null;
  vendor_performance: VendorEventPerformanceRow[];
  sponsor_fulfillment: SponsorFulfillmentReport;
  incidents: { total: number; open: number; high_priority: number };
  reconciliation: ReconciliationReport | null;
  recent_activity: Array<{ at: string; label: string; kind: string }>;
  generated_at: string;
};

function avgCompletionMinutes(items: SponsorActivationRow[]): number | null {
  const durations: number[] = [];
  for (const item of items) {
    if (item.completed_at && item.created_at) {
      const ms = new Date(item.completed_at).getTime() - new Date(item.created_at).getTime();
      if (Number.isFinite(ms) && ms >= 0) durations.push(ms / 60_000);
    }
  }
  if (durations.length === 0) return null;
  return Math.round((durations.reduce((s, n) => s + n, 0) / durations.length) * 10) / 10;
}

export async function buildPostEventDigest(actor: Actor, eventId: string): Promise<PostEventDigest> {
  const ev = await getEvent(actor, eventId);

  const [vendorPerformance, activations, sponsorSummary, incidents, activity] = await Promise.all([
    listVendorEventPerformance(actor, eventId),
    listActivations(actor, eventId),
    activationSummary(actor, eventId),
    listIncidents(actor, eventId),
    listActivity(actor, eventId, 15),
  ]);

  let reconciliation: ReconciliationReport | null = null;
  try {
    reconciliation = await computeEventReconciliation(actor, eventId);
  } catch {
    reconciliation = null;
  }

  const openIncidents = incidents.filter((i) => i.status !== "resolved" && i.status !== "closed");

  return {
    event_id: ev.id,
    event_name: ev.name,
    event_status: ev.status,
    vendor_performance: vendorPerformance,
    sponsor_fulfillment: {
      summary: sponsorSummary,
      avg_completion_minutes: avgCompletionMinutes(activations),
    },
    incidents: {
      total: incidents.length,
      open: openIncidents.length,
      high_priority: openIncidents.filter((i) => i.severity === "high" || i.severity === "critical").length,
    },
    reconciliation,
    recent_activity: activity.map((a) => ({ at: a.created_at, label: a.message, kind: a.category })),
    generated_at: new Date().toISOString(),
  };
}
