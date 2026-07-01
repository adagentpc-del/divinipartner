/**
 * Phase 8 - PRIVATE White-Label controls (blueprint section 5).
 *
 * ADMIN-ONLY. None of this is ever exposed to partners or the public site. The
 * record holds the internal sales pipeline (status, fit score, internal notes,
 * contract value) and the custom configuration applied once a deal is Active
 * (custom fee rate, seats, domain, branding flags).
 *
 * The lifecycle status is kept in sync between `whitelabel_records.status` and
 * `organizations.white_label_status` so the rest of the platform (which only
 * reads the org field) sees a consistent state.
 *
 * Every function here assumes the caller already passed `requireAdmin` at the
 * route layer; we re-check the actor role defensively anyway.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

export type WhiteLabelStatus =
  | "not_eligible"
  | "potential_fit"
  | "invited"
  | "proposal_sent"
  | "contract_pending"
  | "active"
  | "paused"
  | "cancelled";

export const WHITELABEL_STATUSES: { key: WhiteLabelStatus; label: string }[] = [
  { key: "not_eligible", label: "Not eligible" },
  { key: "potential_fit", label: "Potential fit" },
  { key: "invited", label: "Invited" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "contract_pending", label: "Contract pending" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_KEYS = new Set<string>(WHITELABEL_STATUSES.map((s) => s.key));
export function isWhiteLabelStatus(v: unknown): v is WhiteLabelStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}

export type WhiteLabelRow = {
  id: string;
  organization_id: string;
  status: string;
  fit_score: string | null;
  internal_notes: string | null;
  owner_admin: string | null;
  contract_value: string | null;
  custom_fee_rate: string | null;
  custom_seats: number | null;
  custom_domain: string | null;
  branding: unknown;
  domain_verified: boolean;
  branding_enabled: boolean;
  activated_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type WhiteLabelRecord = WhiteLabelRow & {
  organization_name: string | null;
  organization_tier: string | null;
};

function assertAdmin(actor: Actor): void {
  if (actor.user.role !== "super_admin" && actor.user.role !== "admin") {
    throw new ForbiddenError("admins only");
  }
}

/**
 * The white-label PIPELINE: every record joined to its org. Admin only.
 * Also surfaces orgs that have no record yet as implicit "not_eligible" rows so
 * the operator sees the full candidate field.
 */
export async function pipeline(actor: Actor): Promise<WhiteLabelRecord[]> {
  assertAdmin(actor);
  return q<WhiteLabelRecord>(
    `select o.id as organization_id,
            coalesce(w.id, '00000000-0000-0000-0000-000000000000'::uuid) as id,
            coalesce(w.status, o.white_label_status, 'not_eligible') as status,
            w.fit_score, w.internal_notes, w.owner_admin, w.contract_value,
            w.custom_fee_rate, w.custom_seats, w.custom_domain, w.branding,
            coalesce(w.domain_verified, false) as domain_verified,
            coalesce(w.branding_enabled, false) as branding_enabled,
            w.activated_at, w.cancelled_at,
            coalesce(w.created_at, o.created_at) as created_at, w.updated_at,
            o.name as organization_name, o.tier as organization_tier
       from organizations o
       left join whitelabel_records w on w.organization_id = o.id
      where o.tier <> 'client' or w.id is not null
      order by
        case coalesce(w.status, o.white_label_status, 'not_eligible')
          when 'active' then 0 when 'contract_pending' then 1
          when 'proposal_sent' then 2 when 'invited' then 3
          when 'potential_fit' then 4 when 'paused' then 5
          when 'cancelled' then 6 else 7 end,
        w.fit_score desc nulls last,
        o.name asc
      limit 500`,
  );
}

/** Single record by org id (creating an implicit shell if none exists). Admin only. */
export async function getForOrg(actor: Actor, orgId: string): Promise<WhiteLabelRecord> {
  assertAdmin(actor);
  const row = await q1<WhiteLabelRecord>(
    `select o.id as organization_id,
            coalesce(w.id, '00000000-0000-0000-0000-000000000000'::uuid) as id,
            coalesce(w.status, o.white_label_status, 'not_eligible') as status,
            w.fit_score, w.internal_notes, w.owner_admin, w.contract_value,
            w.custom_fee_rate, w.custom_seats, w.custom_domain, w.branding,
            coalesce(w.domain_verified, false) as domain_verified,
            coalesce(w.branding_enabled, false) as branding_enabled,
            w.activated_at, w.cancelled_at,
            coalesce(w.created_at, o.created_at) as created_at, w.updated_at,
            o.name as organization_name, o.tier as organization_tier
       from organizations o
       left join whitelabel_records w on w.organization_id = o.id
      where o.id = $1`,
    [orgId],
  );
  if (!row) throw new NotFoundError("organization not found");
  return row;
}

/**
 * Upsert the record's internal fields + custom config (admin only). Returns the
 * previous + next record so the route can write an audit entry.
 */
export async function upsertRecord(
  actor: Actor,
  orgId: string,
  patch: {
    fit_score?: number;
    internal_notes?: string;
    contract_value?: number;
    custom_fee_rate?: number;
    custom_seats?: number;
    custom_domain?: string;
    branding?: unknown;
    domain_verified?: boolean;
    branding_enabled?: boolean;
  },
): Promise<{ prev: WhiteLabelRecord; next: WhiteLabelRecord }> {
  assertAdmin(actor);
  const prev = await getForOrg(actor, orgId);
  await q1(
    `insert into whitelabel_records
       (organization_id, owner_admin, fit_score, internal_notes, contract_value,
        custom_fee_rate, custom_seats, custom_domain, branding,
        domain_verified, branding_enabled)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,false),coalesce($11,false))
     on conflict (organization_id) do update set
       owner_admin = coalesce(whitelabel_records.owner_admin, excluded.owner_admin),
       fit_score = coalesce(excluded.fit_score, whitelabel_records.fit_score),
       internal_notes = coalesce(excluded.internal_notes, whitelabel_records.internal_notes),
       contract_value = coalesce(excluded.contract_value, whitelabel_records.contract_value),
       custom_fee_rate = coalesce(excluded.custom_fee_rate, whitelabel_records.custom_fee_rate),
       custom_seats = coalesce(excluded.custom_seats, whitelabel_records.custom_seats),
       custom_domain = coalesce(excluded.custom_domain, whitelabel_records.custom_domain),
       branding = coalesce(excluded.branding, whitelabel_records.branding),
       domain_verified = excluded.domain_verified,
       branding_enabled = excluded.branding_enabled,
       updated_at = now()`,
    [
      orgId,
      actor.user.id,
      patch.fit_score ?? null,
      patch.internal_notes ?? null,
      patch.contract_value ?? null,
      patch.custom_fee_rate ?? null,
      patch.custom_seats ?? null,
      patch.custom_domain ?? null,
      patch.branding != null ? JSON.stringify(patch.branding) : null,
      patch.domain_verified ?? null,
      patch.branding_enabled ?? null,
    ],
  );
  const next = await getForOrg(actor, orgId);
  return { prev, next };
}

/**
 * Move a record through the lifecycle. Keeps organizations.white_label_status
 * (and, on Active, the org tier) in sync inside one transaction. Admin only.
 */
export async function setStatus(
  actor: Actor,
  orgId: string,
  status: WhiteLabelStatus,
): Promise<{ prev: WhiteLabelRecord; next: WhiteLabelRecord }> {
  assertAdmin(actor);
  const prev = await getForOrg(actor, orgId);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into whitelabel_records (organization_id, owner_admin, status,
          activated_at, cancelled_at)
       values ($1,$2,$3,
          case when $3 = 'active' then now() else null end,
          case when $3 = 'cancelled' then now() else null end)
       on conflict (organization_id) do update set
         status = excluded.status,
         owner_admin = coalesce(whitelabel_records.owner_admin, excluded.owner_admin),
         activated_at = case when $3 = 'active'
           then coalesce(whitelabel_records.activated_at, now()) else whitelabel_records.activated_at end,
         cancelled_at = case when $3 = 'cancelled' then now() else whitelabel_records.cancelled_at end,
         updated_at = now()`,
      [orgId, actor.user.id, status],
    );
    // mirror onto the org enum + promote tier when activated
    await client.query(
      `update organizations
          set white_label_status = $2,
              tier = case when $2 = 'active' then 'white_label' else tier end,
              updated_at = now()
        where id = $1`,
      [orgId, status],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  const next = await getForOrg(actor, orgId);
  return { prev, next };
}
