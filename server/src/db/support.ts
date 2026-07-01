/**
 * Phase 8 - Support / Help Desk data-access layer (blueprint section 37).
 *
 * CRUD over the `support_tickets` table from db/schema.sql (extended in
 * db/schema-phase8.sql with subject / resolution / updated_at / resolved_at).
 *
 * Authorization model:
 *   - any signed-in user may open a ticket and see / update their own tickets;
 *   - admins (Actor.user.role super_admin/admin OR Actor passed with isAdmin)
 *     see every ticket and may assign, change status, and resolve.
 * Routes pass an `isAdmin` flag through; reads/writes here scope accordingly.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

export const TICKET_STATUSES: { key: TicketStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_on_user", label: "Waiting on user" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export const TICKET_CATEGORIES = [
  "account",
  "billing",
  "events",
  "bids_quotes",
  "payments",
  "technical",
  "other",
] as const;

export const TICKET_URGENCIES = ["low", "normal", "high", "urgent"] as const;

const STATUS_KEYS = new Set<string>(TICKET_STATUSES.map((s) => s.key));
export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}

export type TicketRow = {
  id: string;
  user_id: string | null;
  event_id: string | null;
  organization_id: string | null;
  subject: string | null;
  category: string | null;
  urgency: string | null;
  description: string | null;
  attachments: unknown;
  status: string | null;
  assigned_admin: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
};

function isAdminActor(actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** List tickets: own tickets for users, all tickets for admins. */
export async function listTickets(
  actor: Actor,
  isAdmin: boolean,
  filter: { status?: string } = {},
): Promise<TicketRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!isAdminActor(actor, isAdmin)) {
    params.push(actor.user.id);
    where.push(`user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  return q<TicketRow>(
    `select * from support_tickets
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc
      limit 500`,
    params,
  );
}

/** Create a ticket owned by the actor. */
export async function createTicket(
  actor: Actor,
  body: {
    subject?: string;
    category?: string;
    urgency?: string;
    description?: string;
    event_id?: string;
    attachments?: unknown;
  },
): Promise<TicketRow> {
  const row = await q1<TicketRow>(
    `insert into support_tickets
       (user_id, organization_id, event_id, subject, category, urgency,
        description, attachments, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'open')
     returning *`,
    [
      actor.user.id,
      actor.org?.id ?? null,
      body.event_id ?? null,
      body.subject ?? null,
      body.category ?? "other",
      body.urgency ?? "normal",
      body.description ?? null,
      body.attachments ? JSON.stringify(body.attachments) : null,
    ],
  );
  return row as TicketRow;
}

async function getRowOrThrow(id: string): Promise<TicketRow> {
  const row = await q1<TicketRow>(`select * from support_tickets where id = $1`, [id]);
  if (!row) throw new NotFoundError("ticket not found");
  return row;
}

/** Single ticket (owner or admin). */
export async function getTicket(
  actor: Actor,
  isAdmin: boolean,
  id: string,
): Promise<TicketRow> {
  const row = await getRowOrThrow(id);
  if (!isAdminActor(actor, isAdmin) && row.user_id !== actor.user.id) {
    throw new ForbiddenError("not your ticket");
  }
  return row;
}

/** Set status (owner may close their own; admins may set any status). */
export async function setStatus(
  actor: Actor,
  isAdmin: boolean,
  id: string,
  status: TicketStatus,
  resolution?: string,
): Promise<{ prev: TicketRow; next: TicketRow }> {
  const prev = await getRowOrThrow(id);
  const admin = isAdminActor(actor, isAdmin);
  if (!admin && prev.user_id !== actor.user.id) throw new ForbiddenError("not your ticket");
  // non-admins may only close/reopen their own ticket
  if (!admin && !["open", "closed"].includes(status)) {
    throw new ForbiddenError("only an admin can set that status");
  }
  const resolved = status === "resolved" || status === "closed";
  const next = await q1<TicketRow>(
    `update support_tickets
        set status = $2,
            resolution = coalesce($3, resolution),
            resolved_at = case when $4 then now() else resolved_at end,
            updated_at = now()
      where id = $1
      returning *`,
    [id, status, resolution ?? null, resolved],
  );
  return { prev, next: next as TicketRow };
}

/** Assign a ticket to an admin (admin only). */
export async function assignTicket(
  actor: Actor,
  isAdmin: boolean,
  id: string,
  adminUserId: string,
): Promise<{ prev: TicketRow; next: TicketRow }> {
  if (!isAdminActor(actor, isAdmin)) throw new ForbiddenError("admins only");
  const prev = await getRowOrThrow(id);
  const next = await q1<TicketRow>(
    `update support_tickets set assigned_admin = $2, updated_at = now()
      where id = $1 returning *`,
    [id, adminUserId],
  );
  return { prev, next: next as TicketRow };
}
