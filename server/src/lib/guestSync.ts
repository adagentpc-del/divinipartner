/**
 * Venue Intelligence Addendum (Phase 6) - guest-list to vendor auto-sync.
 *
 * When the client changes the guest list on an event (add / update / delete /
 * import a guest), the vendors who opted in to guest-list or headcount updates
 * for that event should hear about it. A vendor opts in by setting
 * needs_guest_list or needs_headcount on their vendor_event_requirements row
 * (server/src/db/vendor-event-requirements.ts).
 *
 * onGuestListChanged(eventId, summary):
 *   1. finds vendor_event_requirements for the event where needs_guest_list or
 *      needs_headcount is true,
 *   2. resolves each subscribed vendor's org contact emails via lib/recipients,
 *   3. notifies them with notify.guestListUpdated (lib/notify).
 *
 * It is BEST-EFFORT: every step swallows its own errors and the whole function
 * is wrapped so it can never throw and never block the guest mutation that
 * triggered it. Call sites should still fire-and-forget with .catch().
 *
 * Zero em dashes.
 */
import { q } from "../pool.js";
import { orgEmails, eventName } from "./recipients.js";
import { notify } from "./notify.js";

/** A short, human summary of the guest-list change (counts and the action). */
export interface GuestListChangeSummary {
  action?: "add" | "update" | "delete" | "import" | "rsvp" | "check_in";
  total?: number | null;
  confirmed?: number | null;
  heads?: number | null;
  added?: number | null;
}

/** Org ids for the vendors that opted in to guest-list / headcount updates. */
async function subscribedVendorOrgIds(eventId: string): Promise<string[]> {
  const rows = await q<{ organization_id: string | null }>(
    `select v.organization_id
       from vendor_event_requirements r
       join vendors v on v.id = r.vendor_id
      where r.event_id = $1
        and (r.needs_guest_list is true or r.needs_headcount is true)`,
    [eventId],
  ).catch(() => [] as Array<{ organization_id: string | null }>);
  const out = new Set<string>();
  for (const r of rows) if (r.organization_id) out.add(r.organization_id);
  return [...out];
}

/** Build a single readable summary line from the change summary, or "". */
function summaryLine(summary?: GuestListChangeSummary): string {
  if (!summary) return "";
  const bits: string[] = [];
  if (typeof summary.total === "number") bits.push(`${summary.total} guests`);
  if (typeof summary.confirmed === "number") bits.push(`${summary.confirmed} confirmed`);
  if (typeof summary.heads === "number") bits.push(`${summary.heads} expected heads`);
  if (typeof summary.added === "number" && summary.added > 0) {
    bits.push(`${summary.added} just added`);
  }
  return bits.length ? `Current count: ${bits.join(", ")}.` : "";
}

/**
 * Notify opted-in vendors that an event's guest list changed. Best-effort:
 * resolves nothing-to-send cases quietly and never throws.
 */
export async function onGuestListChanged(
  eventId: string,
  summary?: GuestListChangeSummary,
): Promise<void> {
  try {
    if (!eventId) return;
    const orgIds = await subscribedVendorOrgIds(eventId);
    if (orgIds.length === 0) return;
    const [emails, name] = await Promise.all([
      orgEmails(orgIds).catch(() => [] as string[]),
      eventName(eventId).catch(() => null),
    ]);
    if (emails.length === 0) return;
    await notify
      .guestListUpdated(emails, name || "your event", summaryLine(summary), {
        eventId,
        action: summary?.action ?? null,
      })
      .catch(() => null);
  } catch {
    // Best-effort: never block or break the triggering guest mutation.
  }
}

export const guestSync = { onGuestListChanged };
