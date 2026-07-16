/**
 * Phase 8 - Disputes / Refunds / Cancellations data-access (blueprint 32).
 *
 * CRUD over the NEW `disputes` table (db/schema-phase8.sql). A dispute is one of
 * three kinds: dispute | refund | cancellation. The opener (and the org it was
 * raised against) may view it; admins see all and own the resolution workflow.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

export const DISPUTE_KINDS = ["dispute", "refund", "cancellation"] as const;
export type DisputeKind = (typeof DISPUTE_KINDS)[number];

export const DISPUTE_CATEGORIES = [
  "quality",
  "non_delivery",
  "overcharge",
  "scheduling",
  "damage",
  "other",
] as const;

export type DisputeStatus =
  | "open"
  | "under_review"
  | "awaiting_response"
  | "escalated"
  | "resolved"
  | "refunded"
  | "denied"
  | "cancelled"
  | "closed";

export const DISPUTE_STATUSES: { key: DisputeStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "under_review", label: "Under review" },
  { key: "awaiting_response", label: "Awaiting response" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" },
  { key: "refunded", label: "Refunded" },
  { key: "denied", label: "Denied" },
  { key: "cancelled", label: "Cancelled" },
  { key: "closed", label: "Closed" },
];

const STATUS_KEYS = new Set<string>(DISPUTE_STATUSES.map((s) => s.key));
export function isDisputeStatus(v: unknown): v is DisputeStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}
export function isDisputeKind(v: unknown): v is DisputeKind {
  return typeof v === "string" && (DISPUTE_KINDS as readonly string[]).includes(v);
}

export type DisputeRow = {
  id: string;
  event_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  opened_by: string | null;
  organization_id: string | null;
  against_org_id: string | null;
  kind: string | null;
  category: string | null;
  reason: string | null;
  amount: string | null;
  resolution: string | null;
  resolution_amount: string | null;
  assigned_admin: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
};

function isAdminActor(actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** List disputes: own/against for the org, all for admins. */
export async function listDisputes(
  actor: Actor,
  isAdmin: boolean,
  filter: { status?: string; kind?: string } = {},
): Promise<DisputeRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.user.id, actor.org?.id ?? null);
    where.push(`(opened_by = $1 or organization_id = $2 or against_org_id = $2)`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    where.push(`kind = $${params.length}`);
  }
  return q<DisputeRow>(
    `select * from disputes
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc
      limit 500`,
    params,
  );
}

/** Open a dispute / refund / cancellation. */
export async function createDispute(
  actor: Actor,
  body: {
    kind?: string;
    category?: string;
    reason?: string;
    amount?: number;
    event_id?: string;
    invoice_id?: string;
    payment_id?: string;
    against_org_id?: string;
  },
): Promise<DisputeRow> {
  const kind = isDisputeKind(body.kind) ? body.kind : "dispute";
  const row = await q1<DisputeRow>(
    `insert into disputes
       (opened_by, organization_id, against_org_id, event_id, invoice_id, payment_id,
        kind, category, reason, amount, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')
     returning *`,
    [
      actor.user.id,
      actor.org?.id ?? null,
      body.against_org_id ?? null,
      body.event_id ?? null,
      body.invoice_id ?? null,
      body.payment_id ?? null,
      kind,
      body.category ?? "other",
      body.reason ?? null,
      body.amount ?? null,
    ],
  );
  return row as DisputeRow;
}

async function getRowOrThrow(id: string): Promise<DisputeRow> {
  const row = await q1<DisputeRow>(`select * from disputes where id = $1`, [id]);
  if (!row) throw new NotFoundError("dispute not found");
  return row;
}

/** Single dispute (party or admin). */
export async function getDispute(
  actor: Actor,
  isAdmin: boolean,
  id: string,
): Promise<DisputeRow> {
  const row = await getRowOrThrow(id);
  const orgId = actor.org?.id ?? null;
  const party =
    row.opened_by === actor.user.id ||
    (orgId != null && (row.organization_id === orgId || row.against_org_id === orgId));
  if (!isAdminActor(actor, isAdmin) && !party) {
    throw new ForbiddenError("not a party to this dispute");
  }
  return row;
}

/** Advance status + write resolution (admin owns resolution; party may add a response note via status awaiting_response/open only). */
export async function setStatus(
  actor: Actor,
  isAdmin: boolean,
  id: string,
  status: DisputeStatus,
  body: { resolution?: string; resolution_amount?: number } = {},
): Promise<{ prev: DisputeRow; next: DisputeRow }> {
  // IDOR gate: only a party to the dispute (or an admin) may change its status
  // or write a resolution. getDispute enforces party membership and throws
  // otherwise; the earlier getRowOrThrow did not, letting a non-party tamper
  // with any dispute's status/resolution by id.
  const prev = await getDispute(actor, isAdmin, id);
  const admin = isAdminActor(actor, isAdmin);
  const terminal = ["resolved", "refunded", "denied", "cancelled", "closed"].includes(status);
  if (!admin && terminal) {
    throw new ForbiddenError("only an admin can resolve a dispute");
  }
  const isResolved = terminal;
  const next = await q1<DisputeRow>(
    `update disputes
        set status = $2,
            resolution = coalesce($3, resolution),
            resolution_amount = coalesce($4, resolution_amount),
            assigned_admin = case when $5 then coalesce(assigned_admin, $6) else assigned_admin end,
            resolved_at = case when $7 then now() else resolved_at end,
            updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      status,
      body.resolution ?? null,
      body.resolution_amount ?? null,
      admin,
      actor.user.id,
      isResolved,
    ],
  );
  return { prev, next: next as DisputeRow };
}
