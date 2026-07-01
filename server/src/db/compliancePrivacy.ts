/**
 * Module 7 - Privacy / data-subject compliance data-access.
 *
 * Backed by db/schema-rev-compliance.sql:
 *   - privacy_requests      (access / deletion / export / correction workflow)
 *   - consent_records       (append-only consent ledger)
 *   - data_retention_policies (per-object retention declarations)
 *
 * NOTE ON NAMING: the contract asked for `server/src/db/compliance.ts`, but a
 * prior phase already owns that filename for an UNRELATED feature (COI / W-9 /
 * e-sign / availability). To avoid clobbering that work this module lives in
 * `compliancePrivacy.ts`. Integration mounts it under /api/compliance-privacy.
 *
 * IMPORTANT: a deletion request never hard-deletes user data here. It is a
 * workflow record a super-admin reviews and processes deliberately.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, type Actor } from "../db.js";

export type PrivacyKind = "access" | "deletion" | "export" | "correction";
export type PrivacyStatus = "received" | "in_progress" | "completed" | "rejected";

export const PRIVACY_KINDS: PrivacyKind[] = ["access", "deletion", "export", "correction"];
export const PRIVACY_STATUSES: PrivacyStatus[] = ["received", "in_progress", "completed", "rejected"];

export type PrivacyRequestRow = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  requester_email: string | null;
  kind: string;
  status: string;
  detail: string | null;
  resolution_note: string | null;
  handled_by: string | null;
  created_at: string;
  completed_at: string | null;
};

const REQUEST_COLS = `id, organization_id, user_id, requester_email, kind, status,
  detail, resolution_note, handled_by, created_at, completed_at`;

/**
 * Submit a privacy request. Scoped to the acting user/org so a submission is
 * always attributable. Returns the created row.
 */
export async function submitPrivacyRequest(
  actor: Actor,
  body: { kind?: string; detail?: string; requester_email?: string },
): Promise<PrivacyRequestRow> {
  const kind = PRIVACY_KINDS.includes(body.kind as PrivacyKind)
    ? (body.kind as PrivacyKind)
    : null;
  if (!kind) throw new NotFoundError("kind must be one of access|deletion|export|correction");
  const row = await q1<PrivacyRequestRow>(
    `insert into privacy_requests
       (organization_id, user_id, requester_email, kind, status, detail)
     values ($1,$2,$3,$4,'received',$5)
     returning ${REQUEST_COLS}`,
    [
      actor.org?.id ?? null,
      actor.user.id,
      body.requester_email ?? actor.user.email ?? null,
      kind,
      body.detail ?? null,
    ],
  );
  return row as PrivacyRequestRow;
}

/** List privacy requests (super-admin: all; otherwise: the actor's own/org). */
export async function listPrivacyRequests(
  actor: Actor,
  isAdmin: boolean,
  filter: { status?: string; kind?: string } = {},
): Promise<PrivacyRequestRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdmin) {
    params.push(actor.user.id, actor.org?.id ?? null);
    where.push(`(user_id = $1 or organization_id = $2)`);
  }
  if (filter.status && PRIVACY_STATUSES.includes(filter.status as PrivacyStatus)) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.kind && PRIVACY_KINDS.includes(filter.kind as PrivacyKind)) {
    params.push(filter.kind);
    where.push(`kind = $${params.length}`);
  }
  return q<PrivacyRequestRow>(
    `select ${REQUEST_COLS}
       from privacy_requests
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc
      limit 500`,
    params,
  );
}

/**
 * Advance a privacy request's status (super-admin only - the route gates this).
 * Captures who handled it and a resolution note; sets completed_at when the
 * request reaches a terminal state. Returns { prev, next } for audit logging.
 */
export async function advancePrivacyRequest(
  actor: Actor,
  id: string,
  status: PrivacyStatus,
  resolutionNote?: string,
): Promise<{ prev: PrivacyRequestRow; next: PrivacyRequestRow }> {
  const prev = await q1<PrivacyRequestRow>(
    `select ${REQUEST_COLS} from privacy_requests where id = $1`,
    [id],
  );
  if (!prev) throw new NotFoundError("privacy request not found");
  const terminal = status === "completed" || status === "rejected";
  const next = await q1<PrivacyRequestRow>(
    `update privacy_requests
        set status = $2,
            resolution_note = coalesce($3, resolution_note),
            handled_by = $4,
            completed_at = case when $5 then now() else completed_at end
      where id = $1
      returning ${REQUEST_COLS}`,
    [id, status, resolutionNote ?? null, actor.user.id, terminal],
  );
  return { prev, next: next as PrivacyRequestRow };
}

// ----------------------------------------------------------------------------
// CONSENT
// ----------------------------------------------------------------------------
export type ConsentRow = {
  id: string;
  user_id: string | null;
  consent_type: string;
  granted: boolean;
  source: string | null;
  ip_address: string | null;
  created_at: string;
};

/** Record a consent grant/withdraw event for the acting user (append-only). */
export async function recordConsent(
  actor: Actor,
  body: { consent_type?: string; granted?: boolean; source?: string },
  ip?: string | null,
): Promise<ConsentRow> {
  if (!body.consent_type || typeof body.consent_type !== "string") {
    throw new NotFoundError("consent_type required");
  }
  const row = await q1<ConsentRow>(
    `insert into consent_records (user_id, consent_type, granted, source, ip_address)
     values ($1,$2,$3,$4,$5)
     returning id, user_id, consent_type, granted, source, ip_address, created_at`,
    [
      actor.user.id,
      body.consent_type,
      body.granted === true,
      body.source ?? "user",
      ip ?? null,
    ],
  );
  return row as ConsentRow;
}

/** The acting user's current consent state (latest row per consent_type). */
export async function myConsents(actor: Actor): Promise<ConsentRow[]> {
  return q<ConsentRow>(
    `select distinct on (consent_type)
            id, user_id, consent_type, granted, source, ip_address, created_at
       from consent_records
      where user_id = $1
      order by consent_type, created_at desc`,
    [actor.user.id],
  );
}

// ----------------------------------------------------------------------------
// DATA RETENTION POLICIES
// ----------------------------------------------------------------------------
export type RetentionRow = {
  id: string;
  organization_id: string | null;
  object_type: string;
  retention_days: number;
  note: string | null;
  created_at: string;
};

/** List retention policies (super-admin: all; otherwise: org + platform defaults). */
export async function listRetentionPolicies(
  actor: Actor,
  isAdmin: boolean,
): Promise<RetentionRow[]> {
  if (isAdmin) {
    return q<RetentionRow>(
      `select id, organization_id, object_type, retention_days, note, created_at
         from data_retention_policies
        order by organization_id nulls first, object_type asc
        limit 500`,
    );
  }
  return q<RetentionRow>(
    `select id, organization_id, object_type, retention_days, note, created_at
       from data_retention_policies
      where organization_id is null or organization_id = $1
      order by object_type asc
      limit 500`,
    [actor.org?.id ?? null],
  );
}

/**
 * Set (upsert by org+object_type) a retention policy. Super-admin can set a
 * platform default (organization_id null) or an org-specific override; the
 * route gates who may call this.
 */
export async function setRetentionPolicy(
  body: { organization_id?: string | null; object_type?: string; retention_days?: number; note?: string },
): Promise<RetentionRow> {
  if (!body.object_type || typeof body.object_type !== "string") {
    throw new NotFoundError("object_type required");
  }
  const days = Number(body.retention_days);
  if (!Number.isFinite(days) || days < 0) throw new NotFoundError("retention_days must be >= 0");
  const orgId = body.organization_id ?? null;

  // Manual upsert (no unique constraint declared, so match on org+object_type).
  const existing = await q1<RetentionRow>(
    `select id, organization_id, object_type, retention_days, note, created_at
       from data_retention_policies
      where object_type = $1 and organization_id is not distinct from $2
      limit 1`,
    [body.object_type, orgId],
  );
  if (existing) {
    const updated = await q1<RetentionRow>(
      `update data_retention_policies
          set retention_days = $2, note = coalesce($3, note)
        where id = $1
        returning id, organization_id, object_type, retention_days, note, created_at`,
      [existing.id, Math.round(days), body.note ?? null],
    );
    return updated as RetentionRow;
  }
  const row = await q1<RetentionRow>(
    `insert into data_retention_policies (organization_id, object_type, retention_days, note)
     values ($1,$2,$3,$4)
     returning id, organization_id, object_type, retention_days, note, created_at`,
    [orgId, body.object_type, Math.round(days), body.note ?? null],
  );
  return row as RetentionRow;
}
