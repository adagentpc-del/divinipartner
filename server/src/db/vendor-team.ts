/**
 * Vendor Teams + Account Ownership + Quote Approval - data-access layer
 * (Phase 1, Workstream A).
 *
 * Org-scoped, IDOR-safe CRUD over the tables created in db/schema-vt-p1.sql:
 *   - vendor_team_members        (list / get / create / update / remove)
 *   - vendor_account_assignments (list / assign / unassign + owner resolution)
 *   - quote_approvals            (chain read / seed / decide for a quote_draft)
 *
 * Authorization mirrors server/src/db/vendor-requirements.ts: the boundary is the
 * organization that owns the row (organization_id). An actor may read/write when
 * their org owns the row, or they are an admin / super_admin. Every id is
 * re-derived and asserted against the actor's org before any write so a forged id
 * from another tenant is rejected (ForbiddenError) rather than acted on.
 *
 * The vendor sub-role permission gate (vendorCan) lives in the lib helpers, which
 * resolve the ACTING user's team-member row to a vendor_role; this module is the
 * raw, org-scoped persistence underneath them.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { VENDOR_TEAM_ROLES, type VendorTeamRole } from "../lib/vendorPermissions.js";

// ---- Row types --------------------------------------------------------------

export type VendorTeamMemberRow = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  email: string | null;
  name: string | null;
  vendor_role: string | null;
  status: string | null;
  created_at: string;
};

export type SubjectType = "venue" | "client" | "event";
export type AssignmentRole = "owner" | "collaborator" | "backup";

export type VendorAccountAssignmentRow = {
  id: string;
  organization_id: string | null;
  member_id: string | null;
  subject_type: SubjectType | null;
  subject_id: string | null;
  role: AssignmentRole | null;
  assigned_by: string | null;
  created_at: string;
};

export type ApprovalStage = "sales" | "pm" | "vendor";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type QuoteApprovalRow = {
  id: string;
  quote_draft_id: string | null;
  organization_id: string | null;
  stage: ApprovalStage | null;
  status: ApprovalStatus | null;
  approver_member_id: string | null;
  note: string | null;
  decided_at: string | null;
  created_at: string;
};

// ---- Constants --------------------------------------------------------------

const SUBJECT_TYPES = new Set<string>(["venue", "client", "event"]);
const ASSIGNMENT_ROLES = new Set<string>(["owner", "collaborator", "backup"]);
const APPROVAL_STAGES: ApprovalStage[] = ["sales", "pm", "vendor"];
const VALID_ROLES = new Set<string>(VENDOR_TEAM_ROLES);

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** The actor's own org id, or throw when they have none (cannot act on a team). */
function requireOrg(actor: Actor): string {
  if (!actor.org?.id) throw new ForbiddenError("no organization for this actor");
  return actor.org.id;
}

/** Assert the actor may act on a row owned by `orgId` (their org, or admin). */
function assertOrgAccess(actor: Actor, orgId: string | null): void {
  if (isAdmin(actor)) return;
  if (!orgId || !actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this resource");
  }
}

// ============================================================================
// vendor_team_members
// ============================================================================

/** List team members for the actor's org (active + invited), newest first. */
export async function listTeamMembers(actor: Actor): Promise<VendorTeamMemberRow[]> {
  const orgId = requireOrg(actor);
  return q<VendorTeamMemberRow>(
    `select * from vendor_team_members
      where organization_id = $1 and status <> 'removed'
      order by created_at asc`,
    [orgId],
  );
}

/** Get one team member (org-scoped). */
export async function getTeamMember(actor: Actor, id: string): Promise<VendorTeamMemberRow> {
  const row = await q1<VendorTeamMemberRow>(
    `select * from vendor_team_members where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("team member not found");
  assertOrgAccess(actor, row.organization_id);
  return row;
}

export type TeamMemberInput = {
  email?: string | null;
  name?: string | null;
  vendor_role?: string | null;
  user_id?: string | null;
  status?: string | null;
};

/** Create a team member in the actor's org. vendor_role is validated. */
export async function createTeamMember(
  actor: Actor,
  input: TeamMemberInput,
): Promise<VendorTeamMemberRow> {
  const orgId = requireOrg(actor);
  const role = (input.vendor_role ?? "").trim();
  if (role && !VALID_ROLES.has(role)) {
    throw new ForbiddenError("invalid vendor_role");
  }
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  if (!email && !name) {
    throw new ForbiddenError("email or name required");
  }
  const status = input.status === "invited" ? "invited" : "active";
  const row = await q1<VendorTeamMemberRow>(
    `insert into vendor_team_members (organization_id, user_id, email, name, vendor_role, status)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [orgId, input.user_id ?? null, email, name, role || null, status],
  );
  return row as VendorTeamMemberRow;
}

/** Patch a team member (org-scoped). vendor_role, when supplied, is validated. */
export async function updateTeamMember(
  actor: Actor,
  id: string,
  patch: TeamMemberInput,
): Promise<VendorTeamMemberRow> {
  await getTeamMember(actor, id);
  if (patch.vendor_role != null && patch.vendor_role.trim()) {
    if (!VALID_ROLES.has(patch.vendor_role.trim())) {
      throw new ForbiddenError("invalid vendor_role");
    }
  }
  const row = await q1<VendorTeamMemberRow>(
    `update vendor_team_members set
        email = coalesce($2, email),
        name = coalesce($3, name),
        vendor_role = coalesce($4, vendor_role),
        status = coalesce($5, status),
        user_id = coalesce($6, user_id)
      where id = $1
      returning *`,
    [
      id,
      patch.email != null ? patch.email.trim().toLowerCase() : null,
      patch.name != null ? patch.name.trim() : null,
      patch.vendor_role != null && patch.vendor_role.trim() ? patch.vendor_role.trim() : null,
      patch.status ?? null,
      patch.user_id ?? null,
    ],
  );
  return row as VendorTeamMemberRow;
}

/** Soft-remove a team member (status = 'removed'), org-scoped. */
export async function removeTeamMember(actor: Actor, id: string): Promise<void> {
  await getTeamMember(actor, id);
  await pool.query(
    `update vendor_team_members set status = 'removed' where id = $1`,
    [id],
  );
}

/**
 * Resolve the ACTING user's team-member row in their org, so the lib helpers can
 * read their vendor_role for permission checks. Returns null when the user is not
 * on a team (matched by user_id first, then by email). Admins have no member row
 * and are handled separately (they bypass the matrix).
 */
export async function actingMember(actor: Actor): Promise<VendorTeamMemberRow | null> {
  if (!actor.org?.id) return null;
  const byUser = await q1<VendorTeamMemberRow>(
    `select * from vendor_team_members
      where organization_id = $1 and user_id = $2 and status <> 'removed'
      order by created_at asc limit 1`,
    [actor.org.id, actor.user.id],
  );
  if (byUser) return byUser;
  const email = actor.user.email?.trim().toLowerCase();
  if (!email) return null;
  return q1<VendorTeamMemberRow>(
    `select * from vendor_team_members
      where organization_id = $1 and lower(email) = $2 and status <> 'removed'
      order by created_at asc limit 1`,
    [actor.org.id, email],
  );
}

// ============================================================================
// vendor_account_assignments
// ============================================================================

/** List assignments for the actor's org, optionally filtered by subject. */
export async function listAssignments(
  actor: Actor,
  filter?: { subject_type?: string | null; subject_id?: string | null; member_id?: string | null },
): Promise<VendorAccountAssignmentRow[]> {
  const orgId = requireOrg(actor);
  const st = filter?.subject_type && SUBJECT_TYPES.has(filter.subject_type) ? filter.subject_type : null;
  const sid = filter?.subject_id ?? null;
  const mid = filter?.member_id ?? null;
  return q<VendorAccountAssignmentRow>(
    `select * from vendor_account_assignments
      where organization_id = $1
        and ($2::text is null or subject_type = $2)
        and ($3::uuid is null or subject_id = $3)
        and ($4::uuid is null or member_id = $4)
      order by created_at desc`,
    [orgId, st, sid, mid],
  );
}

export type AssignmentInput = {
  member_id: string;
  subject_type: string;
  subject_id: string;
  role?: string | null;
};

/**
 * Assign a member as owner/collaborator/backup of a subject. Idempotent on
 * (member, subject_type, subject_id): re-assigning updates the role. The member
 * must belong to the actor's org (re-derived + asserted).
 */
export async function assignAccount(
  actor: Actor,
  input: AssignmentInput,
): Promise<VendorAccountAssignmentRow> {
  const orgId = requireOrg(actor);
  if (!input.member_id) throw new ForbiddenError("member_id required");
  if (!SUBJECT_TYPES.has(input.subject_type)) throw new ForbiddenError("invalid subject_type");
  if (!input.subject_id) throw new ForbiddenError("subject_id required");
  const role = input.role && ASSIGNMENT_ROLES.has(input.role) ? input.role : "owner";
  // IDOR: the member must be in the actor's org.
  const member = await getTeamMember(actor, input.member_id);
  if (member.organization_id !== orgId && !isAdmin(actor)) {
    throw new ForbiddenError("member is not in your organization");
  }
  const row = await q1<VendorAccountAssignmentRow>(
    `insert into vendor_account_assignments
       (organization_id, member_id, subject_type, subject_id, role, assigned_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (member_id, subject_type, subject_id) do update set
       role = excluded.role,
       assigned_by = excluded.assigned_by
     returning *`,
    [orgId, input.member_id, input.subject_type, input.subject_id, role, actor.user.id],
  );
  return row as VendorAccountAssignmentRow;
}

/** Remove an assignment (org-scoped). */
export async function unassignAccount(actor: Actor, id: string): Promise<void> {
  const row = await q1<VendorAccountAssignmentRow>(
    `select * from vendor_account_assignments where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("assignment not found");
  assertOrgAccess(actor, row.organization_id);
  await pool.query(`delete from vendor_account_assignments where id = $1`, [id]);
}

/**
 * Resolve assignments for a subject within an org, ordered by routing priority
 * (owner, then backup, then collaborator). Used by intake routing. Returns the
 * joined member rows so callers have email/name without a second query.
 */
export async function assignmentsForSubject(
  orgId: string,
  subjectType: SubjectType,
  subjectId: string,
): Promise<Array<VendorAccountAssignmentRow & { member: VendorTeamMemberRow | null }>> {
  const rows = await q<VendorAccountAssignmentRow & {
    m_id: string | null;
    m_org: string | null;
    m_user: string | null;
    m_email: string | null;
    m_name: string | null;
    m_role: string | null;
    m_status: string | null;
    m_created: string | null;
  }>(
    `select a.*,
            m.id as m_id, m.organization_id as m_org, m.user_id as m_user,
            m.email as m_email, m.name as m_name, m.vendor_role as m_role,
            m.status as m_status, m.created_at as m_created
       from vendor_account_assignments a
       left join vendor_team_members m on m.id = a.member_id
      where a.organization_id = $1 and a.subject_type = $2 and a.subject_id = $3
        and (m.status is null or m.status <> 'removed')
      order by case a.role when 'owner' then 0 when 'backup' then 1 else 2 end asc,
               a.created_at asc`,
    [orgId, subjectType, subjectId],
  );
  return rows.map((r) => ({
    id: r.id,
    organization_id: r.organization_id,
    member_id: r.member_id,
    subject_type: r.subject_type,
    subject_id: r.subject_id,
    role: r.role,
    assigned_by: r.assigned_by,
    created_at: r.created_at,
    member: r.m_id
      ? {
          id: r.m_id,
          organization_id: r.m_org,
          user_id: r.m_user,
          email: r.m_email,
          name: r.m_name,
          vendor_role: r.m_role,
          status: r.m_status,
          created_at: r.m_created ?? r.created_at,
        }
      : null,
  }));
}

/** Admin team members in an org (the intake-routing fallback). */
export async function adminMembers(orgId: string): Promise<VendorTeamMemberRow[]> {
  return q<VendorTeamMemberRow>(
    `select * from vendor_team_members
      where organization_id = $1 and vendor_role = 'admin' and status <> 'removed'
      order by created_at asc`,
    [orgId],
  );
}

// ============================================================================
// quote_approvals
// ============================================================================

/** The org id that owns a vendor row (the vendor-side authorization boundary). */
async function vendorOrgId(vendorId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [vendorId],
  );
  return row?.organization_id ?? null;
}

type DraftLite = { id: string; vendor_id: string | null; event_id: string | null };

/**
 * Load a quote_draft and assert the actor's org is the vendor on it (or admin).
 * This is the IDOR gate for the approval chain: only the vendor org that owns the
 * draft may read/seed/decide its internal approvals.
 */
export async function assertDraftVendorAccess(actor: Actor, draftId: string): Promise<DraftLite> {
  const draft = await q1<DraftLite>(
    `select id, vendor_id, event_id from quote_drafts where id = $1`,
    [draftId],
  );
  if (!draft) throw new NotFoundError("quote draft not found");
  if (isAdmin(actor)) return draft;
  if (!draft.vendor_id || !actor.org?.id) {
    throw new ForbiddenError("no access to this quote draft");
  }
  const ownerOrg = await vendorOrgId(draft.vendor_id);
  if (ownerOrg !== actor.org.id) {
    throw new ForbiddenError("no access to this quote draft");
  }
  return draft;
}

/** The approval chain for a draft (org-scoped via the draft's vendor). */
export async function chainForDraft(
  actor: Actor,
  draftId: string,
): Promise<QuoteApprovalRow[]> {
  await assertDraftVendorAccess(actor, draftId);
  return q<QuoteApprovalRow>(
    `select * from quote_approvals where quote_draft_id = $1
      order by case stage when 'sales' then 0 when 'pm' then 1 else 2 end asc,
               created_at asc`,
    [draftId],
  );
}

/**
 * Ensure the three stages (sales, pm, vendor) exist for a draft, creating any
 * that are missing as pending. Idempotent. Returns the full chain. The owning
 * org for each row is the acting vendor org (or the draft vendor's org).
 */
export async function ensureChain(actor: Actor, draftId: string): Promise<QuoteApprovalRow[]> {
  const draft = await assertDraftVendorAccess(actor, draftId);
  const orgId =
    actor.org?.id ?? (draft.vendor_id ? await vendorOrgId(draft.vendor_id) : null);
  const existing = await q<QuoteApprovalRow>(
    `select * from quote_approvals where quote_draft_id = $1`,
    [draftId],
  );
  const have = new Set(existing.map((r) => r.stage));
  for (const stage of APPROVAL_STAGES) {
    if (!have.has(stage)) {
      await pool.query(
        `insert into quote_approvals (quote_draft_id, organization_id, stage, status)
         values ($1,$2,$3,'pending')`,
        [draftId, orgId, stage],
      );
    }
  }
  return chainForDraft(actor, draftId);
}

/** Record a decision for a stage. Returns the updated row. */
export async function recordDecision(
  actor: Actor,
  draftId: string,
  stage: ApprovalStage,
  status: "approved" | "rejected",
  approverMemberId: string | null,
  note: string | null,
): Promise<QuoteApprovalRow> {
  await assertDraftVendorAccess(actor, draftId);
  const row = await q1<QuoteApprovalRow>(
    `update quote_approvals set
        status = $3,
        approver_member_id = $4,
        note = coalesce($5, note),
        decided_at = now()
      where quote_draft_id = $1 and stage = $2
      returning *`,
    [draftId, stage, status, approverMemberId, note],
  );
  if (!row) throw new NotFoundError("approval stage not found for this draft");
  return row;
}
