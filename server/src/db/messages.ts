/**
 * Phase 3 - Messaging data-access layer.
 *
 * CRUD over the `messages` table from db/schema.sql. Messages hang off an event
 * and carry a thread_type (event-wide, venue/client, vendor/client, bid thread,
 * quote thread, invoice thread, direct, internal notes) plus a visibility scope.
 * Visibility rules follow blueprint section 7.2: a viewer sees a message when
 * its visibility includes their relationship to the event.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

export const THREAD_TYPES = [
  "event", // event-wide
  "venue_client", // venue <-> client
  "vendor_client", // vendor <-> client
  "bid", // a bid thread
  "quote", // a quote thread
  "invoice", // an invoice thread
  "direct", // direct message
  "internal", // internal notes (Divini staff)
] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

/** Visibility scopes a message can carry (blueprint 7.2). */
export const VISIBILITY_SCOPES = [
  "event_wide",
  "venue_client",
  "vendor_client",
  "bid_thread",
  "invoice_thread",
  "internal",
] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export type MessageRow = {
  id: string;
  event_id: string;
  thread_type: ThreadType | null;
  thread_ref?: string | null;
  sender_id: string | null;
  recipients: unknown;
  body: string | null;
  attachments: unknown;
  visibility: VisibilityScope | string | null;
  read_status: boolean;
  created_at: string;
};

/** The viewer's relationship roles toward an event, used to test visibility. */
async function viewerScopes(actor: Actor, eventId: string): Promise<Set<string>> {
  const scopes = new Set<string>(["event_wide"]);
  if (actor.user.role === "super_admin" || actor.user.role === "admin") {
    scopes.add("internal");
    scopes.add("venue_client");
    scopes.add("vendor_client");
    scopes.add("bid_thread");
    scopes.add("invoice_thread");
    return scopes;
  }
  const ev = await q1<{ client_id: string | null; planner_id: string | null; org: string | null }>(
    `select client_id, planner_id, organization_id as org from events where id = $1`,
    [eventId],
  );
  if (!ev) return scopes;
  const isClientSide = ev.client_id === actor.user.id || ev.planner_id === actor.user.id;
  if (isClientSide) {
    scopes.add("venue_client");
    scopes.add("vendor_client");
    scopes.add("bid_thread");
    scopes.add("invoice_thread");
  }
  // Vendor / venue orgs attached to the event.
  const attached = await q1<{ ok: boolean }>(
    `select true as ok from event_vendors where event_id = $1 and organization_id = $2 limit 1`,
    [eventId, actor.org?.id ?? null],
  );
  if (attached?.ok || ev.org === actor.org?.id) {
    scopes.add("vendor_client");
    scopes.add("venue_client");
    scopes.add("bid_thread");
    scopes.add("invoice_thread");
  }
  return scopes;
}

/** All messages on an event the viewer is allowed to see, oldest first. */
export async function listEventMessages(actor: Actor, eventId: string): Promise<MessageRow[]> {
  await getEvent(actor, eventId); // access check
  const scopes = await viewerScopes(actor, eventId);
  const rows = await q<MessageRow>(
    `select * from messages where event_id = $1 order by created_at asc`,
    [eventId],
  );
  return rows.filter((m) => {
    const v = (m.visibility as string) ?? "event_wide";
    if (v === "internal") return scopes.has("internal");
    if (v === "event_wide") return true; // everyone with event access
    return scopes.has(v);
  });
}

/** Distinct threads on an event (grouped by thread_type + ref) with counts. */
export async function listThreads(actor: Actor, eventId: string) {
  const msgs = await listEventMessages(actor, eventId);
  const map = new Map<string, { thread_type: string; thread_ref: string | null; count: number; last_at: string; unread: number }>();
  for (const m of msgs) {
    const tt = m.thread_type ?? "event";
    const ref = m.thread_ref ?? null;
    const key = `${tt}:${ref ?? ""}`;
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.last_at = m.created_at;
      if (!m.read_status) cur.unread += 1;
    } else {
      map.set(key, {
        thread_type: tt,
        thread_ref: ref,
        count: 1,
        last_at: m.created_at,
        unread: m.read_status ? 0 : 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
}

export type PostMessageInput = {
  event_id: string;
  body: string;
  thread_type?: ThreadType;
  thread_ref?: string | null;
  visibility?: VisibilityScope;
  recipients?: string[];
  attachments?: unknown[];
};

/** Post a message to an event thread (viewer must have access to the event). */
export async function postMessage(actor: Actor, input: PostMessageInput): Promise<MessageRow> {
  await getEvent(actor, input.event_id); // access check
  if (!input.body || !input.body.trim()) throw new ForbiddenError("message body required");
  const row = await q1<MessageRow>(
    `insert into messages
       (event_id, thread_type, thread_ref, sender_id, recipients, body, attachments, visibility, read_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,false)
     returning *`,
    [
      input.event_id,
      input.thread_type ?? "event",
      input.thread_ref ?? null,
      actor.user.id,
      JSON.stringify(input.recipients ?? []),
      input.body.trim(),
      JSON.stringify(input.attachments ?? []),
      input.visibility ?? "event_wide",
    ],
  );
  return row as MessageRow;
}

/** Mark a single message read. */
export async function markRead(actor: Actor, messageId: string): Promise<MessageRow> {
  const msg = await q1<MessageRow>(`select * from messages where id = $1`, [messageId]);
  if (!msg) throw new NotFoundError("message not found");
  await getEvent(actor, msg.event_id); // access check
  const row = await q1<MessageRow>(
    `update messages set read_status = true where id = $1 returning *`,
    [messageId],
  );
  return row as MessageRow;
}
