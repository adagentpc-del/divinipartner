/**
 * Counterparty Event Invitations (Divini Partners 63-section Event
 * Operations spec, Phase A item 1, 2026-08-09).
 *
 * Event-scoped invitation lifecycle (pending/accepted/declined/expired/
 * revoked), distinct from platform_invites (db/invites.ts), which invites a
 * person to REGISTER on Divini generally, not to join a specific event. The
 * token/email/accept pattern mirrors platform_invites deliberately (proven
 * shape); the underlying table and semantics do not, because event
 * participation must never auto-create a platform-wide identity or
 * marketplace profile the way accepting a platform invite does.
 *
 * Accepting an invitation creates/reactivates an event_members row
 * (db/eventMembers.ts). It never fabricates an event_vendors row -- that
 * still only happens via the owner-only events.addEventVendor path or a
 * vendor's own quote-submission self-attach (db/quotes.ts::createQuote).
 *
 * Zero em dashes.
 */
import { randomUUID } from "node:crypto";
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, actorOwns } from "./events.js";
import { upsertEventMember, type EventMemberRow } from "./eventMembers.js";
import {
  isInvitableEventRole,
  isInvitationRecipient,
  isInvitationExpired,
  type EventRole,
} from "../lib/eventRoles.js";

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

export type EventInvitationRow = {
  id: string;
  event_id: string;
  inviter_user_id: string | null;
  inviter_org_id: string | null;
  recipient_email: string;
  recipient_user_id: string | null;
  recipient_org_id: string | null;
  recipient_vendor_id: string | null;
  intended_role: EventRole;
  intended_scope: unknown;
  token: string;
  status: InvitationStatus;
  message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

// Event invitations outlive the 24h/1h auth tokens used for email
// verification and password resets: events are planned weeks in advance, and
// an invitee (especially an external one who has to register first) needs
// realistic time to respond.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolve an existing Divini user/org/vendor identity from the recipient
 * email, server-side only. The inviter never supplies a user_id/org_id/
 * vendor_id directly for the recipient -- same IDOR-prevention pattern as
 * the vendor_id resolution fix in db/quotes.ts::createQuote. Trusting a
 * client-supplied id here would let one actor attribute an invitation (and
 * the event access it grants on acceptance) to an identity they do not
 * control.
 */
async function resolveRecipient(
  email: string,
): Promise<{ user_id: string | null; org_id: string | null; vendor_id: string | null }> {
  const user = await q1<{ id: string; organization_id: string | null }>(
    `select id, organization_id from users where lower(email) = lower($1)`,
    [email],
  );
  if (!user) return { user_id: null, org_id: null, vendor_id: null };
  let vendorId: string | null = null;
  if (user.organization_id) {
    const vendor = await q1<{ id: string }>(
      `select id from vendors where organization_id = $1`,
      [user.organization_id],
    );
    vendorId = vendor?.id ?? null;
  }
  return { user_id: user.id, org_id: user.organization_id, vendor_id: vendorId };
}

export type CreateInvitationInput = {
  email: string;
  role: string;
  scope?: unknown;
  message?: string | null;
};

/** Send (create) an event invitation. Owner-only, matching addEventVendor. */
export async function createInvitation(
  actor: Actor,
  eventId: string,
  input: CreateInvitationInput,
): Promise<EventInvitationRow> {
  await getEvent(actor, eventId);
  if (!(await actorOwns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can send invitations");
  }
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ForbiddenError("valid email required");
  if (!isInvitableEventRole(input.role)) {
    throw new ForbiddenError("invalid role");
  }
  // Superseding re-invite: revoke any still-open invite to the same address
  // on this event first, so the partial unique index on (event_id,
  // lower(email)) where status='pending' never blocks a legitimate resend.
  await pool.query(
    `update event_invitations set status = 'revoked', updated_at = now()
      where event_id = $1 and lower(recipient_email) = $2 and status = 'pending'`,
    [eventId, email],
  );
  const resolved = await resolveRecipient(email);
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const row = await q1<EventInvitationRow>(
    `insert into event_invitations
       (event_id, inviter_user_id, inviter_org_id, recipient_email, recipient_user_id,
        recipient_org_id, recipient_vendor_id, intended_role, intended_scope, token,
        message, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning *`,
    [
      eventId,
      actor.user.id,
      actor.org?.id ?? null,
      email,
      resolved.user_id,
      resolved.org_id,
      resolved.vendor_id,
      input.role,
      input.scope ?? null,
      token,
      input.message?.trim() || null,
      new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    ],
  );
  return row as EventInvitationRow;
}

/** List invitations for an event. Owner-only. */
export async function listInvitations(actor: Actor, eventId: string): Promise<EventInvitationRow[]> {
  await getEvent(actor, eventId);
  if (!(await actorOwns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can view invitations");
  }
  return q<EventInvitationRow>(
    `select * from event_invitations where event_id = $1 order by created_at desc`,
    [eventId],
  );
}

/** Public token lookup (pre-auth) for the accept/decline landing page. Lazily expires. */
export async function getInvitationByToken(token: string): Promise<EventInvitationRow | null> {
  const row = await q1<EventInvitationRow>(`select * from event_invitations where token = $1`, [token]);
  if (!row) return null;
  if (row.status === "pending" && isInvitationExpired(row.expires_at)) {
    await pool
      .query(
        `update event_invitations set status = 'expired', updated_at = now()
          where id = $1 and status = 'pending'`,
        [row.id],
      )
      .catch(() => undefined);
    return { ...row, status: "expired" };
  }
  return row;
}

/** Revoke a still-pending invitation. Owner-only. */
export async function revokeInvitation(actor: Actor, eventId: string, id: string): Promise<void> {
  await getEvent(actor, eventId);
  if (!(await actorOwns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can revoke invitations");
  }
  const rows = await q(
    `update event_invitations set status = 'revoked', updated_at = now()
      where id = $1 and event_id = $2 and status = 'pending'
      returning id`,
    [id, eventId],
  );
  if (!rows.length) throw new NotFoundError("invitation not found or not pending");
}

/** Assert the signed-in actor is who this invitation was actually sent to
 *  (see lib/eventRoles.ts::isInvitationRecipient for the matching rules). */
function assertIsRecipient(actor: Actor, row: EventInvitationRow): void {
  const matches = isInvitationRecipient({
    actorUserId: actor.user.id,
    actorEmail: actor.user.email ?? null,
    recipientUserId: row.recipient_user_id,
    recipientEmail: row.recipient_email,
  });
  if (!matches) {
    throw new ForbiddenError("this invitation was not sent to your account");
  }
}

/**
 * Accept an invitation: creates/reactivates the event_members row for the
 * now-signed-in actor. The event/role/scope all come from the stored
 * invitation row, never from the request body, so an accept call cannot be
 * used to grant a different role than what was actually sent.
 */
export async function acceptInvitation(actor: Actor, token: string): Promise<EventMemberRow> {
  const row = await getInvitationByToken(token);
  if (!row) throw new NotFoundError("invitation not found");
  if (row.status !== "pending") throw new ForbiddenError(`invitation is ${row.status}`);
  assertIsRecipient(actor, row);
  const updated = await q1<EventInvitationRow>(
    `update event_invitations set status = 'accepted', updated_at = now(), responded_at = now()
      where id = $1 and status = 'pending'
      returning *`,
    [row.id],
  );
  if (!updated) throw new ForbiddenError("invitation is no longer pending");
  return upsertEventMember({
    event_id: row.event_id,
    user_id: actor.user.id,
    organization_id: actor.org?.id ?? row.recipient_org_id ?? null,
    vendor_id: row.recipient_vendor_id ?? null,
    role: row.intended_role,
    invited_by: row.inviter_user_id,
    invitation_id: row.id,
    status: "active",
  });
}

/** Decline an invitation. */
export async function declineInvitation(actor: Actor, token: string): Promise<EventInvitationRow> {
  const row = await getInvitationByToken(token);
  if (!row) throw new NotFoundError("invitation not found");
  if (row.status !== "pending") throw new ForbiddenError(`invitation is ${row.status}`);
  assertIsRecipient(actor, row);
  const updated = await q1<EventInvitationRow>(
    `update event_invitations set status = 'declined', updated_at = now(), responded_at = now()
      where id = $1 and status = 'pending'
      returning *`,
    [row.id],
  );
  if (!updated) throw new ForbiddenError("invitation is no longer pending");
  return updated;
}
