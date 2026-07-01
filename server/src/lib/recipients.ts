/**
 * Notification recipient resolution.
 *
 * Notifications must reach the right counterparty, not the person who triggered
 * the action. This module turns an event, bid, or quote into the correct set of
 * email addresses:
 *
 *   - eventOwnerEmails:  the demand side of an event (client, planner, the
 *                        organizing org, and the venue org). Used when a vendor
 *                        acts (posts/submits a quote) and the owner should hear.
 *   - eventVendorEmails: the supply side (vendor/supplier orgs attached to the
 *                        event via event_vendors).
 *   - eventParticipantEmails: owner side + vendor side (a full event audience).
 *   - orgEmails:         contacts for a set of organizations (invited vendors).
 *   - quoteVendorEmails: the vendor org that submitted a given quote. Used when
 *                        the client decides (accept/decline/revision).
 *   - eventName:         the event's display name for subject lines.
 *
 * Every resolver is best-effort: it swallows DB errors and returns an empty
 * array (or null for eventName) so a notification never blocks or breaks the
 * request that triggered it. Results are deduped, lowercased, and trimmed.
 *
 * An org's contacts are its billing_contact (when that is an email) plus the
 * emails of its member users. Seats are small and paid per head, so a member
 * fan-out is bounded and safe.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dedup + lowercase + trim + keep only valid-looking addresses. */
function clean(emails: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    if (!e) continue;
    const v = String(e).trim().toLowerCase();
    if (EMAIL_RE.test(v)) out.add(v);
  }
  return [...out];
}

/** Remove one address (case-insensitive) from a recipient list. */
export function excluding(list: string[], email: string | null | undefined): string[] {
  if (!email) return list;
  const drop = String(email).trim().toLowerCase();
  return list.filter((e) => e !== drop);
}

/** Emails for a set of user ids. */
async function userEmails(userIds: Array<string | null | undefined>): Promise<string[]> {
  const ids = userIds.filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  const rows = await q<{ email: string | null }>(
    `select email from users where id = any($1::uuid[])`,
    [ids],
  ).catch(() => [] as Array<{ email: string | null }>);
  return clean(rows.map((r) => r.email));
}

/** Contacts for a set of organizations: billing_contact + member emails. */
export async function orgEmails(orgIds: Array<string | null | undefined>): Promise<string[]> {
  const ids = orgIds.filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  const [billing, members] = await Promise.all([
    q<{ billing_contact: string | null }>(
      `select billing_contact from organizations where id = any($1::uuid[])`,
      [ids],
    ).catch(() => [] as Array<{ billing_contact: string | null }>),
    q<{ email: string | null }>(
      `select email from users where organization_id = any($1::uuid[])`,
      [ids],
    ).catch(() => [] as Array<{ email: string | null }>),
  ]);
  return clean([...billing.map((r) => r.billing_contact), ...members.map((r) => r.email)]);
}

/** The event's display name, for subject lines. Null when not found. */
export async function eventName(eventId: string): Promise<string | null> {
  const row = await q1<{ name: string | null }>(`select name from events where id = $1`, [eventId]).catch(
    () => null,
  );
  return row?.name ?? null;
}

/**
 * Demand side of an event: the client user, the planner user, the organizing
 * org, and the venue's org. This is who should hear when a vendor posts or
 * submits against their event.
 */
export async function eventOwnerEmails(eventId: string): Promise<string[]> {
  const ev = await q1<{
    client_id: string | null;
    planner_id: string | null;
    organization_id: string | null;
    venue_id: string | null;
  }>(`select client_id, planner_id, organization_id, venue_id from events where id = $1`, [eventId]).catch(
    () => null,
  );
  if (!ev) return [];
  let venueOrgId: string | null = null;
  if (ev.venue_id) {
    const v = await q1<{ organization_id: string | null }>(
      `select organization_id from venues where id = $1`,
      [ev.venue_id],
    ).catch(() => null);
    venueOrgId = v?.organization_id ?? null;
  }
  const [people, orgs] = await Promise.all([
    userEmails([ev.client_id, ev.planner_id]),
    orgEmails([ev.organization_id, venueOrgId]),
  ]);
  return clean([...people, ...orgs]);
}

/** Supply side of an event: vendor/supplier orgs attached via event_vendors. */
export async function eventVendorEmails(eventId: string): Promise<string[]> {
  const rows = await q<{ organization_id: string | null }>(
    `select organization_id from event_vendors where event_id = $1`,
    [eventId],
  ).catch(() => [] as Array<{ organization_id: string | null }>);
  return orgEmails(rows.map((r) => r.organization_id));
}

/** Full event audience: owner side + vendor side. */
export async function eventParticipantEmails(eventId: string): Promise<string[]> {
  const [owners, vendors] = await Promise.all([eventOwnerEmails(eventId), eventVendorEmails(eventId)]);
  return clean([...owners, ...vendors]);
}

/**
 * The vendor org that submitted a quote: quote.vendor_id -> vendors.organization_id
 * -> org contacts. Used when a client accepts/declines/requests revision.
 */
export async function quoteVendorEmails(quoteId: string): Promise<string[]> {
  const row = await q1<{ vendor_id: string | null }>(`select vendor_id from quotes where id = $1`, [
    quoteId,
  ]).catch(() => null);
  if (!row?.vendor_id) return [];
  const v = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [row.vendor_id],
  ).catch(() => null);
  return orgEmails([v?.organization_id ?? null]);
}

/** The event id a quote belongs to, for resolving owner emails on submit. */
export async function quoteEventId(quoteId: string): Promise<string | null> {
  const row = await q1<{ event_id: string | null }>(`select event_id from quotes where id = $1`, [
    quoteId,
  ]).catch(() => null);
  return row?.event_id ?? null;
}

export const recipients = {
  excluding,
  orgEmails,
  eventName,
  eventOwnerEmails,
  eventVendorEmails,
  eventParticipantEmails,
  quoteVendorEmails,
  quoteEventId,
};
