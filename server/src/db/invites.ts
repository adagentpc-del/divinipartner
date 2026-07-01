/**
 * Platform invites: a venue or partner invites a vendor or client to create a
 * free Divini Partners profile. Each invite is attributed to the inviter (the
 * referral). Accepting an invite leads to free registration; on register the new
 * org id is recorded in accepted_org_id.
 *
 * Backed by the platform_invites table (db/schema.sql). Surfaced from /network
 * (vendor-network + invite panel) and /join/:token.
 *
 * Zero em dashes.
 */
import { randomUUID } from "node:crypto";
import { q, q1 } from "../pool.js";

export type InviteRole = "vendor" | "client" | "venue" | "planner";
export type InviteStatus = "sent" | "opened" | "accepted" | "revoked";

export type InviteRow = {
  id: string;
  inviter_org_id: string | null;
  inviter_user_id: string | null;
  invitee_email: string;
  invitee_name: string | null;
  role: InviteRole;
  token: string;
  status: InviteStatus;
  accepted_org_id: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

const COLS = `
  id, inviter_org_id, inviter_user_id, invitee_email, invitee_name, role,
  token, status, accepted_org_id, message, created_at, updated_at
`;

function normalizeRole(role?: string | null): InviteRole {
  return role === "client" || role === "venue" || role === "planner" ? role : "vendor";
}

/** Create an invite with a fresh random token. Returns the inserted row. */
export async function createInvite(
  inviterOrgId: string,
  inviterUserId: string | null,
  input: { email: string; name?: string | null; role?: string | null; message?: string | null },
): Promise<InviteRow> {
  const token = randomUUID().replace(/-/g, "");
  const row = await q1<InviteRow>(
    `insert into platform_invites
       (inviter_org_id, inviter_user_id, invitee_email, invitee_name, role, token, status, message)
     values ($1,$2,$3,$4,$5,$6,'sent',$7)
     returning ${COLS}`,
    [
      inviterOrgId,
      inviterUserId,
      String(input.email).trim().toLowerCase(),
      input.name?.trim() || null,
      normalizeRole(input.role),
      token,
      input.message?.trim() || null,
    ],
  );
  return row as InviteRow;
}

/** An existing still-open invite from this org to this email, if any (dedupe). */
export async function findPendingInvite(orgId: string, email: string): Promise<InviteRow | null> {
  return q1<InviteRow>(
    `select ${COLS} from platform_invites
      where inviter_org_id = $1 and invitee_email = $2 and status in ('sent','opened')
      order by created_at desc limit 1`,
    [orgId, String(email).trim().toLowerCase()],
  );
}

/** How many invites this org created since the given ISO timestamp (rate cap). */
export async function countInvitesByOrgSince(orgId: string, sinceIso: string): Promise<number> {
  const r = await q1<{ c: string }>(
    `select count(*)::int as c from platform_invites where inviter_org_id = $1 and created_at > $2`,
    [orgId, sinceIso],
  );
  return Number(r?.c ?? 0);
}

/** How many invites this user created since the given ISO timestamp (rate cap). */
export async function countInvitesByUserSince(userId: string, sinceIso: string): Promise<number> {
  const r = await q1<{ c: string }>(
    `select count(*)::int as c from platform_invites where inviter_user_id = $1 and created_at > $2`,
    [userId, sinceIso],
  );
  return Number(r?.c ?? 0);
}

/** All invites this org has sent, newest first. */
export async function listInvitesByOrg(orgId: string): Promise<InviteRow[]> {
  return q<InviteRow>(
    `select ${COLS} from platform_invites
      where inviter_org_id = $1
      order by created_at desc`,
    [orgId],
  );
}

/** Look up an invite by its public token (or null). */
export async function getInviteByToken(token: string): Promise<InviteRow | null> {
  return q1<InviteRow>(
    `select ${COLS} from platform_invites where token = $1`,
    [token],
  );
}

/**
 * Mark an invite as opened (the landing page was viewed). Only advances a
 * still-sent invite so an accepted or revoked status is never overwritten.
 */
export async function markOpened(token: string): Promise<InviteRow | null> {
  return q1<InviteRow>(
    `update platform_invites
        set status = 'opened', updated_at = now()
      where token = $1 and status = 'sent'
      returning ${COLS}`,
    [token],
  );
}

/**
 * Accept an invite, recording the new org id. Best-effort: only a non-revoked
 * invite that has not already been accepted is advanced.
 */
export async function acceptInvite(token: string, acceptedOrgId: string): Promise<InviteRow | null> {
  return q1<InviteRow>(
    `update platform_invites
        set status = 'accepted', accepted_org_id = $2, updated_at = now()
      where token = $1 and status in ('sent','opened')
      returning ${COLS}`,
    [token, acceptedOrgId],
  );
}

/** Revoke an invite the org has sent. Returns true when a row was revoked. */
export async function revokeInvite(orgId: string, id: string): Promise<boolean> {
  const rows = await q(
    `update platform_invites
        set status = 'revoked', updated_at = now()
      where id = $1 and inviter_org_id = $2 and status in ('sent','opened')
      returning id`,
    [id, orgId],
  );
  return rows.length > 0;
}
