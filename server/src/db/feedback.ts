/**
 * Phase 8 - Feedback + Feature Requests data-access layer (blueprint 36).
 *
 * CRUD over `feedback_items` from db/schema.sql (extended in
 * db/schema-phase8.sql with title / organization_id / votes / updated_at).
 *
 * Includes a deterministic "AI pattern note" (`patternSummary`) that simply
 * counts items by type / status / top-voted - no model call, no fabrication,
 * just a transparent roll-up an admin can read at a glance.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

export const FEEDBACK_TYPES = [
  "bug",
  "feature_request",
  "improvement",
  "praise",
  "complaint",
  "other",
] as const;

export type FeedbackStatus =
  | "new"
  | "reviewing"
  | "planned"
  | "in_progress"
  | "shipped"
  | "declined";

export const FEEDBACK_STATUSES: { key: FeedbackStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In progress" },
  { key: "shipped", label: "Shipped" },
  { key: "declined", label: "Declined" },
];

const STATUS_KEYS = new Set<string>(FEEDBACK_STATUSES.map((s) => s.key));
export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}

export type FeedbackRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  type: string | null;
  title: string | null;
  priority: string | null;
  description: string | null;
  related_object_type: string | null;
  related_object_id: string | null;
  status: string | null;
  admin_notes: string | null;
  votes: number | null;
  created_at: string;
  updated_at: string | null;
};

function isAdminActor(actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** List feedback: own items for users, all for admins. Optional type filter. */
export async function listFeedback(
  actor: Actor,
  isAdmin: boolean,
  filter: { type?: string; status?: string } = {},
): Promise<FeedbackRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.user.id);
    where.push(`user_id = $${params.length}`);
  }
  if (filter.type) {
    params.push(filter.type);
    where.push(`type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  return q<FeedbackRow>(
    `select * from feedback_items
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by votes desc nulls last, created_at desc
      limit 500`,
    params,
  );
}

/** Submit a feedback item / feature request. */
export async function createFeedback(
  actor: Actor,
  body: {
    type?: string;
    title?: string;
    priority?: string;
    description?: string;
    related_object_type?: string;
    related_object_id?: string;
  },
): Promise<FeedbackRow> {
  const row = await q1<FeedbackRow>(
    `insert into feedback_items
       (user_id, organization_id, type, title, priority, description,
        related_object_type, related_object_id, status, votes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'new',0)
     returning *`,
    [
      actor.user.id,
      actor.org?.id ?? null,
      body.type ?? "other",
      body.title ?? null,
      body.priority ?? "normal",
      body.description ?? null,
      body.related_object_type ?? null,
      body.related_object_id ?? null,
    ],
  );
  return row as FeedbackRow;
}

async function getRowOrThrow(id: string): Promise<FeedbackRow> {
  const row = await q1<FeedbackRow>(`select * from feedback_items where id = $1`, [id]);
  if (!row) throw new NotFoundError("feedback not found");
  return row;
}

/** Add a vote (any signed-in user). */
export async function voteFeedback(id: string): Promise<FeedbackRow> {
  await getRowOrThrow(id);
  const row = await q1<FeedbackRow>(
    `update feedback_items set votes = coalesce(votes,0) + 1, updated_at = now()
      where id = $1 returning *`,
    [id],
  );
  return row as FeedbackRow;
}

/** Update status + admin notes (admin only). */
export async function setStatus(
  actor: Actor,
  isAdmin: boolean,
  id: string,
  status: FeedbackStatus,
  adminNotes?: string,
): Promise<{ prev: FeedbackRow; next: FeedbackRow }> {
  if (!isAdminActor(actor, isAdmin)) throw new ForbiddenError("admins only");
  const prev = await getRowOrThrow(id);
  const next = await q1<FeedbackRow>(
    `update feedback_items
        set status = $2, admin_notes = coalesce($3, admin_notes), updated_at = now()
      where id = $1 returning *`,
    [id, status, adminNotes ?? null],
  );
  return { prev, next: next as FeedbackRow };
}

export interface FeedbackPattern {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  topVoted: { id: string; title: string | null; type: string | null; votes: number }[];
  note: string;
}

/**
 * Deterministic pattern summary (NOT a model call). Counts items by type and
 * status and surfaces the most-voted requests, then writes a plain English note
 * describing the largest cluster so an admin can triage at a glance.
 */
export async function patternSummary(): Promise<FeedbackPattern> {
  const byType = await q<{ type: string; count: number }>(
    `select coalesce(type,'other') as type, count(*)::int as count
       from feedback_items group by 1 order by 2 desc`,
  );
  const byStatus = await q<{ status: string; count: number }>(
    `select coalesce(status,'new') as status, count(*)::int as count
       from feedback_items group by 1 order by 2 desc`,
  );
  const topVoted = await q<{ id: string; title: string | null; type: string | null; votes: number }>(
    `select id, title, type, coalesce(votes,0)::int as votes
       from feedback_items order by votes desc nulls last, created_at desc limit 5`,
  );
  const total = byType.reduce((s, r) => s + r.count, 0);
  const top = byType[0];
  const note =
    total === 0
      ? "No feedback submitted yet."
      : `${total} item${total === 1 ? "" : "s"} on record. The largest cluster is "${top.type}" with ${top.count} (${Math.round((top.count / total) * 100)}% of all feedback).`;
  return { total, byType, byStatus, topVoted, note };
}
