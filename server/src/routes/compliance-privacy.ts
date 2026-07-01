/**
 * Module 7 - Privacy / data-subject compliance routes.
 * Mount base: /api/compliance-privacy.
 *
 * NOTE ON NAMING: the contract asked for `routes/compliance.ts`, but a prior
 * phase already owns that filename (COI / W-9 / e-sign / availability). To stay
 * additive this router lives in `compliance-privacy.ts`.
 *
 * - Any signed-in user can submit a privacy request, record consent, read their
 *   own requests/consents, and read applicable retention policies.
 * - Super-admin (requireAdmin) may list ALL requests, advance their status, and
 *   set retention policies.
 *
 * A deletion request is recorded as a WORKFLOW row; nothing is hard-deleted
 * automatically. Every privacy submission fires notify.privacyRequestReceived
 * and writes an audit entry.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as cp from "../db/compliancePrivacy.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { getAdminAllowedEmails } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}
function ip(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

const router = Router();
router.use(requireUser);

// ---- meta ------------------------------------------------------------------
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ kinds: cp.PRIVACY_KINDS, statuses: cp.PRIVACY_STATUSES });
  }),
);

// ---- privacy requests ------------------------------------------------------
/** Submit a data-subject request (access | deletion | export | correction). */
router.post(
  "/requests",
  h(async (req, res) => {
    const { a } = await actor(req);
    const row = await cp.submitPrivacyRequest(a, req.body ?? {});
    await logAction(a, "privacy_request.submitted", "privacy_request", row.id, null, row, {
      ip: ip(req),
      summary: `privacy request: ${row.kind}`,
    });
    // Notify the platform privacy/admin inbox (best-effort).
    const admins = getAdminAllowedEmails();
    const to = admins.length ? admins : (a.user.email ?? "");
    if (to && (Array.isArray(to) ? to.length : true)) {
      await notify.privacyRequestReceived(to, `${row.kind} request`, {
        request_id: row.id,
        kind: row.kind,
        from: a.user.email ?? a.user.id,
      });
    }
    res.status(201).json({ request: row });
  }),
);

/** List requests: own/org for users, all for super-admin. */
router.get(
  "/requests",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      requests: await cp.listPrivacyRequests(a, isAdmin, {
        status: (req.query.status as string) || undefined,
        kind: (req.query.kind as string) || undefined,
      }),
    });
  }),
);

/** Advance a request's status (SUPER-ADMIN only). */
router.post(
  "/requests/:id/status",
  requireAdmin,
  h(async (req, res) => {
    const { a } = await actor(req);
    const { status, resolution_note } = req.body ?? {};
    if (!cp.PRIVACY_STATUSES.includes(status)) {
      return res.status(400).json({ error: "status must be received|in_progress|completed|rejected" });
    }
    const { prev, next } = await cp.advancePrivacyRequest(a, req.params.id, status, resolution_note);
    await logAction(a, "privacy_request.status_changed", "privacy_request", req.params.id, prev, next, {
      ip: ip(req),
      summary: `privacy request -> ${status}`,
    });
    res.json({ request: next });
  }),
);

// ---- consent ---------------------------------------------------------------
/** Record a consent grant/withdraw event for the acting user. */
router.post(
  "/consent",
  h(async (req, res) => {
    const { a } = await actor(req);
    const row = await cp.recordConsent(a, req.body ?? {}, ip(req));
    await logAction(a, "consent.recorded", "consent_record", row.id, null, row, {
      ip: ip(req),
      summary: `${row.consent_type}: ${row.granted ? "granted" : "withdrawn"}`,
    });
    res.status(201).json({ consent: row });
  }),
);

/** The acting user's current consent state. */
router.get(
  "/consent",
  h(async (req, res) => {
    const { a } = await actor(req);
    res.json({ consents: await cp.myConsents(a) });
  }),
);

// ---- retention policies ----------------------------------------------------
/** List retention policies applicable to the actor (admin sees all). */
router.get(
  "/retention",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ policies: await cp.listRetentionPolicies(a, isAdmin) });
  }),
);

/** Set a retention policy (SUPER-ADMIN only). */
router.post(
  "/retention",
  requireAdmin,
  h(async (req, res) => {
    const { a } = await actor(req);
    const row = await cp.setRetentionPolicy(req.body ?? {});
    await logAction(a, "retention_policy.set", "data_retention_policy", row.id, null, row, {
      ip: ip(req),
      summary: `${row.object_type}: ${row.retention_days}d`,
    });
    res.status(201).json({ policy: row });
  }),
);

export default router;
