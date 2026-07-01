/**
 * Phase 8 - Audit trail writer + reader (blueprint section 42).
 *
 * A thin, dependency-free helper over the `audit_logs` table from db/schema.sql
 * (plus the `summary` + `actor_email` columns added in db/schema-phase8.sql).
 * Every consequential admin / lifecycle action should call `logAction` so the
 * platform keeps an immutable, queryable history of who changed what, with the
 * previous and new state captured as jsonb.
 *
 * Writes are best-effort: a failure to log must never break the action it
 * accompanies, so `logAction` swallows its own errors (and logs them to the
 * console) rather than throwing.
 */
import { q, q1 } from "../pool.js";
import type { Actor } from "../db.js";

export type AuditActor = {
  /** users.id (uuid) of the acting user, when known. */
  id: string | null;
  email?: string | null;
};

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  summary: string | null;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
}

/** Normalize either an `Actor` or a bare `{ id, email }` into AuditActor. */
function toAuditActor(actor: Actor | AuditActor | null): AuditActor {
  if (!actor) return { id: null, email: null };
  if ("user" in actor) {
    return { id: actor.user.id, email: actor.user.email ?? null };
  }
  return { id: actor.id ?? null, email: actor.email ?? null };
}

/**
 * Record one audit entry. Best-effort: never throws.
 *
 * @param actor      the acting user (Actor or { id, email })
 * @param action     a stable verb, e.g. "dispute.status_changed"
 * @param objectType the entity kind, e.g. "dispute", "organization"
 * @param objectId   the entity id (uuid) or null
 * @param prev       the previous state (any json-serializable value) or null
 * @param next       the new state (any json-serializable value) or null
 * @param opts       optional summary + ip
 */
export async function logAction(
  actor: Actor | AuditActor | null,
  action: string,
  objectType: string | null,
  objectId: string | null,
  prev: unknown = null,
  next: unknown = null,
  opts: { summary?: string | null; ip?: string | null } = {},
): Promise<void> {
  const a = toAuditActor(actor);
  try {
    await q1(
      `insert into audit_logs
         (actor_id, actor_email, action, object_type, object_id,
          previous_value, new_value, summary, ip_address)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        a.id,
        a.email ?? null,
        action,
        objectType,
        objectId,
        prev == null ? null : JSON.stringify(prev),
        next == null ? null : JSON.stringify(next),
        opts.summary ?? null,
        opts.ip ?? null,
      ],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write entry", action, (e as Error)?.message);
  }
}

export interface AuditQuery {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  limit?: number;
  offset?: number;
}

/** Read audit entries newest-first with optional filters (admin reader). */
export async function readAudit(filter: AuditQuery = {}): Promise<AuditEntry[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.actorId) {
    params.push(filter.actorId);
    where.push(`actor_id = $${params.length}`);
  }
  if (filter.action) {
    params.push(filter.action);
    where.push(`action = $${params.length}`);
  }
  if (filter.objectType) {
    params.push(filter.objectType);
    where.push(`object_type = $${params.length}`);
  }
  if (filter.objectId) {
    params.push(filter.objectId);
    where.push(`object_id = $${params.length}`);
  }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);
  params.push(limit, offset);

  const rows = await q<AuditEntry>(
    `select id, actor_id, actor_email, action, object_type, object_id,
            summary, previous_value, new_value, ip_address, created_at
       from audit_logs
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return rows;
}

/** Distinct action verbs seen in the log (for the viewer's filter dropdown). */
export async function auditActions(): Promise<string[]> {
  const rows = await q<{ action: string }>(
    `select distinct action from audit_logs where action is not null order by action asc limit 200`,
  );
  return rows.map((r) => r.action);
}
