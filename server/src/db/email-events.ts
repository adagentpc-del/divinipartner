/**
 * Self-hosted email open/click analytics. Backed by the existing email_events
 * table (db/schema.sql + db/apply-all.sql):
 *
 *   id, message_ref, recipient, kind in ('open','click'), url, ip_address,
 *   user_agent, created_at
 *
 * An invisible 1x1 pixel records opens; a tracked redirect records clicks. The
 * message_ref is the claim_outreach row id, so opens and clicks tie back to the
 * exact outreach send. No third-party analytics are involved.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { q, q1 } from "../pool.js";

export type EmailEventKind = "open" | "click";

export type EmailEvent = {
  id: string;
  message_ref: string | null;
  recipient: string | null;
  kind: EmailEventKind | null;
  url: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/** Record a single open or click event. Best-effort: callers swallow failures. */
export async function recordEmailEvent(e: {
  messageRef: string;
  recipient?: string | null;
  kind: EmailEventKind;
  url?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<EmailEvent | null> {
  if (!e.messageRef || (e.kind !== "open" && e.kind !== "click")) return null;
  const cap = (v: string | null | undefined, n: number): string | null =>
    typeof v === "string" && v.trim() ? v.slice(0, n) : null;
  const row = await q1<EmailEvent>(
    `insert into email_events
       (message_ref, recipient, kind, url, ip_address, user_agent)
     values ($1,$2,$3,$4,$5,$6)
     returning id, message_ref, recipient, kind, url, ip_address, user_agent, created_at`,
    [
      e.messageRef.slice(0, 256),
      cap(e.recipient, 320),
      e.kind,
      cap(e.url, 2048),
      cap(e.ip, 128),
      cap(e.userAgent, 1024),
    ],
  );
  return row;
}

export type EventCounts = { openCount: number; clickCount: number };

/**
 * Per-ref open/click counts for a set of message refs, keyed by message_ref.
 * Refs with no events are omitted from the map.
 */
export async function countsByRef(refs: string[]): Promise<Record<string, EventCounts>> {
  const out: Record<string, EventCounts> = {};
  const clean = [...new Set(refs.filter((r) => typeof r === "string" && r.trim()))];
  if (!clean.length) return out;
  const rows = await q<{ message_ref: string; kind: string; n: string }>(
    `select message_ref, kind, count(*)::text as n
       from email_events
      where message_ref = any($1)
      group by message_ref, kind`,
    [clean],
  );
  for (const r of rows) {
    const ref = r.message_ref;
    if (!out[ref]) out[ref] = { openCount: 0, clickCount: 0 };
    if (r.kind === "open") out[ref].openCount = Number(r.n);
    else if (r.kind === "click") out[ref].clickCount = Number(r.n);
  }
  return out;
}

/**
 * Aggregate open/click totals across all tracked email. Used by the claim
 * metrics rollup so the admin dashboard shows real open/click counts.
 */
export async function totals(): Promise<EventCounts> {
  const rows = await q<{ kind: string; n: string }>(
    `select kind, count(*)::text as n from email_events group by kind`,
  );
  const out: EventCounts = { openCount: 0, clickCount: 0 };
  for (const r of rows) {
    if (r.kind === "open") out.openCount = Number(r.n);
    else if (r.kind === "click") out.clickCount = Number(r.n);
  }
  return out;
}

/**
 * Open/click totals scoped to message refs that exist in claim_outreach. This
 * keeps the claim dashboard's open/click numbers tied to claim outreach only,
 * even if other senders ever start tracking through the same table.
 */
export async function claimTotals(): Promise<EventCounts> {
  const rows = await q<{ kind: string; n: string }>(
    `select e.kind, count(*)::text as n
       from email_events e
       join claim_outreach o on o.id::text = e.message_ref
      where e.kind in ('open','click')
      group by e.kind`,
  );
  const out: EventCounts = { openCount: 0, clickCount: 0 };
  for (const r of rows) {
    if (r.kind === "open") out.openCount = Number(r.n);
    else if (r.kind === "click") out.clickCount = Number(r.n);
  }
  return out;
}
