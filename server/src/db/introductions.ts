/**
 * Anti-Circumvention (Module 4) - data-access layer for `introductions`.
 *
 * An introduction records that two organizations (party A + party B) formed a
 * relationship THROUGH Divini Partners, with a non-circumvention window
 * (window_months, default 24) running from introduced_at. The platform never
 * hard-deletes a row: flag / suspend only change `status`, so the trail remains
 * the evidence.
 *
 * Authorization posture (IDOR-safe):
 *   - recordIntroduction: internal helper + POST; creator is the actor's org.
 *   - listForActor: super admins see all (with optional filters); a regular org
 *     sees ONLY rows it is a party to (party_a / party_b / source_partner /
 *     organization_id), read-only.
 *   - getForActor: same visibility rule, single row.
 *   - flag / clear / suspend: SUPER-ADMIN ONLY (the route enforces requireAdmin;
 *     these helpers also re-check isSuper and throw ForbiddenError otherwise).
 *
 * Degrades gracefully: when the introductions table is absent (schema not yet
 * applied), reads return [] / null rather than throwing.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { readAudit, type AuditEntry } from "../lib/audit.js";

export type IntroStatus = "active" | "flagged" | "cleared" | "suspended";
export type SubjectType = "venue" | "vendor" | "sponsor" | "exhibitor" | "client";

export interface IntroductionRow {
  id: string;
  organization_id: string | null;
  source_partner_id: string | null;
  party_a_org_id: string | null;
  party_b_org_id: string | null;
  subject_type: SubjectType | null;
  subject_id: string | null;
  introduced_at: string;
  window_months: number;
  status: IntroStatus;
  note: string | null;
  created_at: string;
}

const SUBJECT_TYPES: SubjectType[] = ["venue", "vendor", "sponsor", "exhibitor", "client"];

/** A super admin (ADMIN_ALLOWED_EMAILS) or a super_admin/admin role row. */
export function isSuper(actor: Actor, authIsAdmin: boolean): boolean {
  if (authIsAdmin) return true;
  const role = actor.user.role ?? "";
  return role === "super_admin" || role === "admin";
}

/** True when the introductions relation exists (graceful degradation). */
async function tableExists(): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass('public.introductions') as reg`);
  return !!row?.reg;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize a raw DB row (window_months may arrive as a string). */
function normalize(r: IntroductionRow): IntroductionRow {
  return { ...r, window_months: num(r.window_months, 24) };
}

const SELECT = `
  select id, organization_id, source_partner_id, party_a_org_id, party_b_org_id,
         subject_type, subject_id, introduced_at, window_months, status, note, created_at
    from introductions`;

// ---- Write ------------------------------------------------------------------

export interface RecordIntroductionInput {
  partyAOrgId: string;
  partyBOrgId: string;
  subjectType?: SubjectType | null;
  subjectId?: string | null;
  sourcePartnerId?: string | null;
  windowMonths?: number | null;
  note?: string | null;
}

/**
 * Internal helper to record an introduction when a platform relationship forms.
 * Call from any flow that pairs two orgs (a quote acceptance, a sponsor match,
 * etc). `organization_id` is the acting org (the tenant that owns the record).
 * Returns the created row, or null when the table is absent.
 */
export async function recordIntroduction(
  actor: Actor,
  input: RecordIntroductionInput,
): Promise<IntroductionRow | null> {
  if (!(await tableExists())) return null;
  if (!input.partyAOrgId || !input.partyBOrgId) {
    throw new ForbiddenError("party_a_org_id and party_b_org_id are required");
  }
  const subjectType =
    input.subjectType && SUBJECT_TYPES.includes(input.subjectType) ? input.subjectType : null;
  const windowMonths =
    input.windowMonths != null && Number.isFinite(input.windowMonths) && input.windowMonths > 0
      ? Math.round(input.windowMonths)
      : 24;

  const row = await q1<IntroductionRow>(
    `insert into introductions
       (organization_id, source_partner_id, party_a_org_id, party_b_org_id,
        subject_type, subject_id, window_months, note, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'active')
     returning id, organization_id, source_partner_id, party_a_org_id, party_b_org_id,
               subject_type, subject_id, introduced_at, window_months, status, note, created_at`,
    [
      actor.org?.id ?? null,
      input.sourcePartnerId ?? actor.org?.id ?? null,
      input.partyAOrgId,
      input.partyBOrgId,
      subjectType,
      input.subjectId ?? null,
      windowMonths,
      input.note ?? null,
    ],
  );
  return row ? normalize(row) : null;
}

// ---- Read -------------------------------------------------------------------

export interface ListFilter {
  status?: IntroStatus;
  party?: string; // an org id; rows where party is A or B (or partner/owner)
}

/**
 * List introductions visible to the actor. Super admins see everything (with
 * optional status / party filters). A regular org sees ONLY rows it is a party
 * to. IDOR-safe: the org scope is derived from the actor, never the caller.
 */
export async function listForActor(
  actor: Actor,
  authIsAdmin: boolean,
  filter: ListFilter = {},
): Promise<IntroductionRow[]> {
  if (!(await tableExists())) return [];

  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  if (isSuper(actor, authIsAdmin)) {
    if (filter.party) {
      params.push(filter.party);
      const p = `$${params.length}`;
      where.push(
        `(party_a_org_id = ${p} or party_b_org_id = ${p} or source_partner_id = ${p} or organization_id = ${p})`,
      );
    }
  } else {
    const orgId = actor.org?.id ?? null;
    if (!orgId) return []; // a non-admin with no org is party to nothing
    params.push(orgId);
    const p = `$${params.length}`;
    where.push(
      `(party_a_org_id = ${p} or party_b_org_id = ${p} or source_partner_id = ${p} or organization_id = ${p})`,
    );
  }

  const rows = await q<IntroductionRow>(
    `${SELECT} ${where.length ? `where ${where.join(" and ")}` : ""}
      order by introduced_at desc
      limit 500`,
    params,
  );
  return rows.map(normalize);
}

/**
 * Fetch a single introduction, enforcing the same visibility rule as the list.
 * Throws NotFoundError when it does not exist or the actor cannot see it.
 */
export async function getForActor(
  actor: Actor,
  authIsAdmin: boolean,
  id: string,
): Promise<IntroductionRow> {
  if (!(await tableExists())) throw new NotFoundError("introduction not found");
  const row = await q1<IntroductionRow>(`${SELECT} where id = $1`, [id]);
  if (!row) throw new NotFoundError("introduction not found");

  if (!isSuper(actor, authIsAdmin)) {
    const orgId = actor.org?.id ?? null;
    const isParty =
      orgId != null &&
      [row.party_a_org_id, row.party_b_org_id, row.source_partner_id, row.organization_id].includes(orgId);
    if (!isParty) throw new NotFoundError("introduction not found");
  }
  return normalize(row);
}

// ---- Super-admin status transitions (never hard-delete) ---------------------

/** Set status on an introduction. SUPER-ADMIN ONLY. Returns prev + next rows. */
async function setStatus(
  actor: Actor,
  authIsAdmin: boolean,
  id: string,
  status: IntroStatus,
  note?: string | null,
): Promise<{ prev: IntroductionRow; next: IntroductionRow }> {
  if (!isSuper(actor, authIsAdmin)) throw new ForbiddenError("super admin required");
  if (!(await tableExists())) throw new NotFoundError("introduction not found");

  const prev = await q1<IntroductionRow>(`${SELECT} where id = $1`, [id]);
  if (!prev) throw new NotFoundError("introduction not found");

  const next = await q1<IntroductionRow>(
    `update introductions
        set status = $2,
            note = coalesce($3, note)
      where id = $1
      returning id, organization_id, source_partner_id, party_a_org_id, party_b_org_id,
                subject_type, subject_id, introduced_at, window_months, status, note, created_at`,
    [id, status, note ?? null],
  );
  if (!next) throw new NotFoundError("introduction not found");
  return { prev: normalize(prev), next: normalize(next) };
}

/** Flag an introduction as circumvention. SUPER-ADMIN ONLY. */
export function flag(actor: Actor, authIsAdmin: boolean, id: string, note?: string | null) {
  return setStatus(actor, authIsAdmin, id, "flagged", note);
}

/** Clear a flag (back to active). SUPER-ADMIN ONLY. */
export function clear(actor: Actor, authIsAdmin: boolean, id: string, note?: string | null) {
  return setStatus(actor, authIsAdmin, id, "cleared", note);
}

/** Suspend the relationship on the introduction (soft). SUPER-ADMIN ONLY. */
export function suspend(actor: Actor, authIsAdmin: boolean, id: string, note?: string | null) {
  return setStatus(actor, authIsAdmin, id, "suspended", note);
}

// ---- Investigation ----------------------------------------------------------

export interface InvestigationResult {
  introduction: IntroductionRow;
  /** The audit trail filtered to this introduction. */
  audit: AuditEntry[];
  /** Other introductions involving either party (the related events). */
  related: IntroductionRow[];
}

/**
 * Investigate an introduction: return the row, its audit trail, and other
 * introductions that involve either party. SUPER-ADMIN ONLY (route gated; this
 * also re-checks). Audit reads are best-effort.
 */
export async function investigate(
  actor: Actor,
  authIsAdmin: boolean,
  id: string,
): Promise<InvestigationResult> {
  if (!isSuper(actor, authIsAdmin)) throw new ForbiddenError("super admin required");
  const introduction = await getForActor(actor, authIsAdmin, id);

  let audit: AuditEntry[] = [];
  try {
    audit = await readAudit({ objectType: "introduction", objectId: id, limit: 200 });
  } catch {
    audit = [];
  }

  let related: IntroductionRow[] = [];
  if (await tableExists()) {
    const ids = [introduction.party_a_org_id, introduction.party_b_org_id].filter(Boolean) as string[];
    if (ids.length) {
      const rows = await q<IntroductionRow>(
        `${SELECT}
          where id <> $1
            and (party_a_org_id = any($2) or party_b_org_id = any($2))
          order by introduced_at desc
          limit 100`,
        [id, ids],
      );
      related = rows.map(normalize);
    }
  }

  return { introduction, audit, related };
}
