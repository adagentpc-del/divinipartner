/**
 * Event Closeout: vendor completion attestation + closing readiness gate
 * (live-ops phase, Part 25-27, 2026-08-09).
 *
 * Part 26 (vendor completion): event_vendor_completions is a per-vendor-
 * org attestation ("our participation here is done"), distinct from
 * event_check_ins's per-person arrival/departure timestamp (Part 7-8).
 * Only the vendor org's own member (vendor_owner/vendor_staff) may mark
 * their own org's row; owner/planner/venue can view the whole roster.
 * listVendorCompletions() LEFT JOINs event_vendors so an org with no
 * attestation row yet reads as the honest default 'pending', never a
 * fabricated pre-seeded row.
 *
 * Part 25 (closing transition): computeCloseoutReadiness() is the same
 * deterministic-checks-from-real-data pattern as db/readiness.ts's
 * computeReadiness() (Start Event's gate), reused for the OTHER end of
 * the lifecycle -- db/events.ts's setEventStatus() gates the event_day ->
 * completed transition on this exactly the way it already gates inquiry
 * -> event_day on computeReadiness(), including the same audited-override
 * escape hatch. Blocking: any vendor still 'pending' completion, or any
 * open high/critical incident (RESOLVE before CLOSE). Warning-only:
 * unresolved inventory count issues, incomplete sponsor activations, and
 * incomplete day-of tasks -- all legitimately still open at CLOSE time and
 * expected to finish during RECONCILE, never a reason to block closing.
 *
 * Part 27 (closeout dashboard): the closeout readiness report plus the
 * vendor completion roster IS the closeout dashboard's data -- no second,
 * duplicate aggregator; CloseoutTab.tsx (frontend) renders these two
 * calls directly.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor, ForbiddenError, NotFoundError } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { listIncidents } from "./incidents.js";
import { listInventoryCounts } from "./eventInventory.js";
import { listActivations } from "./eventSponsorActivation.js";
import { listTasks } from "./tasks.js";
import { recordActivity } from "./eventActivity.js";

export type VendorCompletionStatus = "pending" | "complete" | "issue";
export const VENDOR_COMPLETION_STATUSES: VendorCompletionStatus[] = ["pending", "complete", "issue"];

export type VendorCompletionRow = {
  vendor_org_id: string;
  vendor_name: string;
  status: VendorCompletionStatus;
  notes: string | null;
  marked_by: string | null;
  marked_at: string | null;
};

/** Full vendor roster with completion status, defaulting any org with no
 *  attestation row yet to 'pending' -- never fabricated, always derived
 *  from the real event_vendors attachment plus whatever completion rows
 *  actually exist. */
export async function listVendorCompletions(actor: Actor, eventId: string): Promise<VendorCompletionRow[]> {
  await getEvent(actor, eventId);
  return q<VendorCompletionRow>(
    `select ev.organization_id as vendor_org_id,
            coalesce(o.name, 'Vendor') as vendor_name,
            coalesce(c.status, 'pending') as status,
            c.notes,
            c.marked_by,
            c.marked_at::text as marked_at
       from event_vendors ev
       left join organizations o on o.id = ev.organization_id
       left join event_vendor_completions c on c.event_id = ev.event_id and c.vendor_org_id = ev.organization_id
      where ev.event_id = $1
      order by vendor_name asc`,
    [eventId],
  );
}

export type MarkVendorCompletionInput = {
  status: VendorCompletionStatus;
  notes?: string | null;
};

/** Only the vendor org's own member may mark their own org's completion
 *  (or the event owner/planner, for a vendor who cannot self-report). */
export async function markVendorCompletion(
  actor: Actor,
  eventId: string,
  vendorOrgId: string,
  input: MarkVendorCompletionInput,
): Promise<VendorCompletionRow> {
  await getEvent(actor, eventId);
  const isManager = await canManageEvent(actor, eventId);
  if (!isManager) {
    const role = await getEventRole(actor, eventId);
    const isOwnVendorOrg = (role === "vendor_owner" || role === "vendor_staff") && actor.org?.id === vendorOrgId;
    if (!isOwnVendorOrg) {
      throw new ForbiddenError("only the vendor's own org or the event owner/planner can mark vendor completion");
    }
  }
  const attached = await q1<{ ok: boolean }>(
    `select true as ok from event_vendors where event_id = $1 and organization_id = $2`,
    [eventId, vendorOrgId],
  );
  if (!attached?.ok) throw new NotFoundError("vendor is not attached to this event");
  if (!VENDOR_COMPLETION_STATUSES.includes(input.status)) throw new ForbiddenError("invalid completion status");

  await q1(
    `insert into event_vendor_completions (event_id, vendor_org_id, status, notes, marked_by, marked_at)
     values ($1,$2,$3,$4,$5,now())
     on conflict (event_id, vendor_org_id) do update
       set status = excluded.status, notes = coalesce(excluded.notes, event_vendor_completions.notes),
           marked_by = excluded.marked_by, marked_at = now(), updated_at = now()`,
    [eventId, vendorOrgId, input.status, input.notes ?? null, actor.user.id],
  );

  await recordActivity(actor, eventId, {
    category: "closeout",
    message: `Vendor completion: ${input.status.replace(/_/g, " ")}`,
    relatedEntityType: "vendor_completion",
    relatedEntityId: vendorOrgId,
    severity: input.status === "issue" ? "warning" : "info",
  });

  const rows = await listVendorCompletions(actor, eventId);
  const row = rows.find((r) => r.vendor_org_id === vendorOrgId);
  if (!row) throw new NotFoundError("vendor completion not found after update");
  return row;
}

export type CloseoutCheckSeverity = "blocking" | "warning";
export type CloseoutCheck = {
  id: string;
  label: string;
  status: "complete" | "missing";
  severity: CloseoutCheckSeverity;
  message: string;
};
export type CloseoutState = "not_ready" | "needs_attention" | "ready" | "ready_with_warnings";

export type CloseoutReport = {
  event_id: string;
  state: CloseoutState;
  blocking: CloseoutCheck[];
  warnings: CloseoutCheck[];
  completed: CloseoutCheck[];
  generated_at: string;
};

function closeoutCheck(
  id: string,
  label: string,
  ok: boolean,
  severity: CloseoutCheckSeverity,
  okMessage: string,
  missingMessage: string,
): CloseoutCheck {
  return { id, label, status: ok ? "complete" : "missing", severity, message: ok ? okMessage : missingMessage };
}

/** Deterministic, real-data closing readiness -- the "CLOSE" gate that
 *  sits opposite Start Event's readiness gate at the other end of the
 *  live-ops lifecycle. */
export async function computeCloseoutReadiness(actor: Actor, eventId: string): Promise<CloseoutReport> {
  await getEvent(actor, eventId);
  const checks: CloseoutCheck[] = [];

  const vendors = await listVendorCompletions(actor, eventId);
  const pendingVendors = vendors.filter((v) => v.status === "pending");
  checks.push(
    closeoutCheck(
      "vendors.complete",
      "All vendors marked complete",
      pendingVendors.length === 0,
      "blocking",
      vendors.length > 0
        ? `All ${vendors.length} vendor(s) have confirmed their participation is complete.`
        : "No vendors are attached to this event.",
      `${pendingVendors.length} of ${vendors.length} vendor(s) have not yet confirmed completion.`,
    ),
  );

  const incidents = await listIncidents(actor, eventId);
  const openHighPriority = incidents.filter(
    (i) => i.status !== "resolved" && i.status !== "closed" && (i.severity === "high" || i.severity === "critical"),
  );
  checks.push(
    closeoutCheck(
      "incidents.resolved",
      "No open high-priority incidents",
      openHighPriority.length === 0,
      "blocking",
      "No open high-priority or critical incidents.",
      `${openHighPriority.length} open high-priority or critical incident(s) still unresolved.`,
    ),
  );

  const counts = await listInventoryCounts(actor, eventId);
  const openCounts = counts.filter((c) => c.status !== "resolved");
  checks.push(
    closeoutCheck(
      "inventory.counts_resolved",
      "Inventory count issues resolved",
      openCounts.length === 0,
      "warning",
      "No open inventory count issues.",
      `${openCounts.length} inventory count issue(s) still open -- can be resolved during reconciliation.`,
    ),
  );

  const activations = await listActivations(actor, eventId);
  const incompleteActivations = activations.filter((a) => a.status !== "complete");
  checks.push(
    closeoutCheck(
      "sponsors.activations_complete",
      "Sponsor activations complete",
      incompleteActivations.length === 0,
      "warning",
      activations.length > 0 ? "All sponsor activation items are complete." : "No sponsor activation items on this event.",
      `${incompleteActivations.length} of ${activations.length} sponsor activation item(s) not yet complete.`,
    ),
  );

  const tasks = await listTasks(actor, eventId);
  const dayOfTasks = tasks.filter((t) => t.category === "day_of");
  const incompleteDayOf = dayOfTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  checks.push(
    closeoutCheck(
      "tasks.day_of_complete",
      "Day-of tasks complete",
      incompleteDayOf.length === 0,
      "warning",
      dayOfTasks.length > 0 ? "All day-of tasks are complete." : "No day-of tasks on this event.",
      `${incompleteDayOf.length} of ${dayOfTasks.length} day-of task(s) still open.`,
    ),
  );

  const completed = checks.filter((c) => c.status === "complete");
  const blocking = checks.filter((c) => c.status === "missing" && c.severity === "blocking");
  const warnings = checks.filter((c) => c.status === "missing" && c.severity === "warning");

  let state: CloseoutState;
  if (blocking.length > 0) state = "not_ready";
  else if (warnings.length === 0) state = "ready";
  else if (warnings.length > 2) state = "needs_attention";
  else state = "ready_with_warnings";

  return { event_id: eventId, state, blocking, warnings, completed, generated_at: new Date().toISOString() };
}

/** Thrown by db/events.ts's setEventStatus() when a caller tries to move
 *  an event from event_day to completed while blocking closeout issues
 *  are outstanding and no override was passed -- mirrors
 *  ReadinessBlockedError's shape and audited-override handling exactly. */
export class CloseoutBlockedError extends Error {
  status = 409;
  blocking: CloseoutCheck[];
  state: CloseoutState;
  constructor(report: CloseoutReport) {
    super(`event is not ready to close: ${report.blocking.length} blocking issue(s)`);
    this.name = "CloseoutBlockedError";
    this.blocking = report.blocking;
    this.state = report.state;
  }
}
