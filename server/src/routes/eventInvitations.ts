/**
 * Counterparty Event Invitation routes. Mount base: /api/event-invitations.
 *
 * GET /token/:token is PUBLIC (pre-auth) so an invitee can see who invited
 * them and to what event before signing in or registering, mirroring
 * routes/invites.ts's public token lookup. Every other route requires a
 * signed-in user.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as invitations from "../db/eventInvitations.js";
import { listEventMembers, removeEventMember } from "../db/eventMembers.js";
import { q1 } from "../pool.js";
import { sendEmail } from "../lib/email.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function acceptLink(token: string): string {
  const base = `${PUBLIC_APP_URL}${BASE_PATH}`.replace(/\/$/, "");
  return `${base}/event-invitations/${token}`;
}

const router = Router();

// -------------------------------------------------------------------------
// PUBLIC: token lookup for the invite landing page (no auth required).
// -------------------------------------------------------------------------
router.get(
  "/token/:token",
  h(async (req, res) => {
    const row = await invitations.getInvitationByToken(req.params.token);
    if (!row) return res.status(404).json({ error: "invitation not found" });
    const [event, inviterOrg] = await Promise.all([
      q1<{ name: string }>(`select name from events where id = $1`, [row.event_id]),
      row.inviter_org_id
        ? q1<{ name: string }>(`select name from organizations where id = $1`, [row.inviter_org_id])
        : Promise.resolve(null),
    ]);
    res.json({
      invitation: {
        token: row.token,
        event_id: row.event_id,
        event_name: event?.name ?? null,
        recipient_email: row.recipient_email,
        intended_role: row.intended_role,
        intended_scope: row.intended_scope,
        status: row.status,
        message: row.message,
        inviter_name: inviterOrg?.name ?? null,
        expires_at: row.expires_at,
      },
    });
  }),
);

// Everything below requires a signed-in user.
router.use(requireUser);

/** Send an invitation for an event. Owner-only. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { email, role, scope, message } = req.body ?? {};
    const row = await invitations.createInvitation(a, req.params.eventId, {
      email,
      role,
      scope,
      message,
    });
    const link = acceptLink(row.token);
    const roleWord = row.intended_role.replace(/_/g, " ");
    await sendEmail({
      to: row.recipient_email,
      subject: `You have been invited to an event on Divini Partners`,
      text:
        `${a.org?.name || "An event organizer"} invited you to join an event on Divini Partners as ${roleWord}.\n\n` +
        (row.message ? `A note from the organizer:\n"${row.message}"\n\n` : "") +
        `View and respond to the invitation here:\n${link}\n\n` +
        `This invitation expires on ${new Date(row.expires_at).toDateString()}. ` +
        `If you did not expect this invitation you can safely ignore this email.`,
    }).catch(() => undefined);
    res.status(201).json({ invitation: row, link });
  }),
);

/** List invitations sent for an event. Owner-only. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const rows = await invitations.listInvitations(a, req.params.eventId);
    res.json({
      invitations: rows.map((r) => ({ ...r, link: acceptLink(r.token) })),
    });
  }),
);

/** Revoke a still-pending invitation. Owner-only. */
router.post(
  "/event/:eventId/:id/revoke",
  h(async (req, res) => {
    const a = await actor(req);
    await invitations.revokeInvitation(a, req.params.eventId, req.params.id);
    res.json({ ok: true });
  }),
);

/** Accept an invitation as the now-signed-in actor. */
router.post(
  "/token/:token/accept",
  h(async (req, res) => {
    const a = await actor(req);
    const member = await invitations.acceptInvitation(a, req.params.token);
    res.json({ member });
  }),
);

/** Decline an invitation as the now-signed-in actor. */
router.post(
  "/token/:token/decline",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await invitations.declineInvitation(a, req.params.token);
    res.json({ invitation: row });
  }),
);

/** List the member roster for an event (any actor with event access). */
router.get(
  "/event/:eventId/members",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ members: await listEventMembers(a, req.params.eventId) });
  }),
);

/** Remove a member from an event. Owner-only. */
router.delete(
  "/event/:eventId/members/:memberId",
  h(async (req, res) => {
    const a = await actor(req);
    await removeEventMember(a, req.params.eventId, req.params.memberId);
    res.status(204).end();
  }),
);

export default router;
