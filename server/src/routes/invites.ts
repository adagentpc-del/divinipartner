/**
 * Platform-invite routes. Mount base: /api/invites (the parent mounts this in
 * routes.ts).
 *
 * A venue or partner invites a vendor or client to create a free Divini Partners
 * profile, by email or a shareable link. Invites are attributed to the inviter
 * (referral); accepting one leads to free registration.
 *
 * The management endpoints require a signed-in, org-scoped user. The token
 * lookup endpoint is PUBLIC so the /join landing page can read the invite
 * before the invitee has an account.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as invites from "../db/invites.js";
import { q1 } from "../pool.js";
import { sendEmail } from "../lib/email.js";
// READ-only: build the shareable accept link.
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INVITE_CAP_PER_USER_HOUR = 30;
const INVITE_CAP_PER_ORG_DAY = 200;

/** Strip control characters and newlines, collapse whitespace, length-cap. */
function sanitizeText(s: string, max: number): string | null {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 32 || c === 127 ? " " : ch;
  }
  const cleaned = out.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

async function requireOrg(req: Request, res: Response): Promise<db.Actor | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor;
}

/** The shareable accept link for an invite token. */
function joinLink(token: string): string {
  const base = `${PUBLIC_APP_URL}${BASE_PATH}`.replace(/\/$/, "");
  return `${base}/join/${token}`;
}

const router = Router();

// -------------------------------------------------------------------------
// PUBLIC: token lookup for the /join landing page (no auth). Marks the invite
// opened and returns who invited them + the target role + the invitee email.
// -------------------------------------------------------------------------
router.get(
  "/token/:token",
  h(async (req, res) => {
    const token = req.params.token;
    const invite = await invites.getInviteByToken(token);
    if (!invite) return res.status(404).json({ error: "invite not found" });
    if (invite.status === "revoked") return res.status(410).json({ error: "invite revoked" });

    // Best-effort: advance a still-sent invite to opened.
    await invites.markOpened(token).catch(() => undefined);

    let inviterName: string | null = null;
    if (invite.inviter_org_id) {
      const org = await q1<{ name: string }>(
        `select name from organizations where id = $1`,
        [invite.inviter_org_id],
      );
      inviterName = org?.name ?? null;
    }

    res.json({
      invite: {
        token: invite.token,
        role: invite.role,
        invitee_email: invite.invitee_email,
        invitee_name: invite.invitee_name,
        message: invite.message,
        status: invite.status === "sent" ? "opened" : invite.status,
        inviter_name: inviterName,
      },
    });
  }),
);

// Everything below requires a signed-in user.
router.use(requireUser);

/** Create an invite, send the branded email, return the invite + share link. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const { email, name, role, message } = req.body ?? {};
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: "valid email required" });
    }
    // Sanitize free text: strip control chars/newlines, length-cap.
    const cleanName = name ? sanitizeText(String(name), 120) : null;
    const cleanMessage = message ? sanitizeText(String(message), 500) : null;

    // Dedupe: do not re-send to an address that already has an open invite from
    // this org. Return the existing invite instead of creating a new one.
    const existing = await invites.findPendingInvite(a.org!.id, cleanEmail);
    if (existing) {
      return res.status(200).json({ invite: existing, link: joinLink(existing.token), duplicate: true });
    }

    // Rate caps to prevent invite-email abuse (spam-cannon protection).
    const nowMs = Date.now();
    const perUser = await invites.countInvitesByUserSince(a.user.id, new Date(nowMs - 3600_000).toISOString());
    if (perUser >= INVITE_CAP_PER_USER_HOUR) {
      return res.status(429).json({ error: "Too many invites in the last hour. Please try again later." });
    }
    const perOrg = await invites.countInvitesByOrgSince(a.org!.id, new Date(nowMs - 86_400_000).toISOString());
    if (perOrg >= INVITE_CAP_PER_ORG_DAY) {
      return res.status(429).json({ error: "Daily invite limit reached for your account." });
    }

    const invite = await invites.createInvite(a.org!.id, a.user.id, {
      email: cleanEmail,
      name: cleanName,
      role,
      message: cleanMessage,
    });
    const link = joinLink(invite.token);
    const inviterName = a.org!.name || "A Divini Partners member";
    const roleWord = invite.role === "client" ? "client" : invite.role;

    const lines = [
      `${inviterName} invited you to join Divini Partners as a ${roleWord}.`,
      "",
      "Divini Partners is where venues, vendors, planners, and clients work together on events. Creating your profile is completely free, and it takes only a few minutes.",
      "",
      cleanMessage ? `A note from ${inviterName}:` : "",
      cleanMessage ? `"${cleanMessage}"` : "",
      cleanMessage ? "" : "",
      "Create your free profile here:",
      link,
      "",
      "If you did not expect this invitation you can safely ignore this email.",
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

    // Best-effort send (no-op when email is disabled, never blocks the response).
    await sendEmail({
      to: invite.invitee_email,
      subject: `${inviterName} invited you to Divini Partners`,
      text: lines.join("\n"),
    }).catch(() => undefined);

    res.status(201).json({ invite, link });
  }),
);

/** List the invites this org has sent. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const rows = await invites.listInvitesByOrg(a.org!.id);
    res.json({
      invites: rows.map((r) => ({
        id: r.id,
        invitee_email: r.invitee_email,
        invitee_name: r.invitee_name,
        role: r.role,
        status: r.status,
        token: r.token,
        link: joinLink(r.token),
        created_at: r.created_at,
      })),
    });
  }),
);

/** Revoke an invite this org has sent. */
router.post(
  "/:id/revoke",
  h(async (req, res) => {
    const a = await requireOrg(req, res);
    if (!a) return;
    const ok = await invites.revokeInvite(a.org!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  }),
);

export default router;
