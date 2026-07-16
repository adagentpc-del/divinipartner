/**
 * Account self-service routes. Mount base: /api/account
 *
 * POST /account/delete - the user-facing "Delete my account" action promised in
 * the Privacy Policy. It does NOT hard-delete: payment, invoice, tax and audit
 * records must be retained for legal/accounting obligations. Instead it files a
 * `deletion` data-subject request through the same reviewed compliance workflow
 * as /api/compliance-privacy, records an audit entry, and notifies the privacy
 * inbox. This closes the gap where the Profile button POSTed to a route that did
 * not exist (404) while the policy promised the capability.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as cp from "../db/compliancePrivacy.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { getAdminAllowedEmails } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean).pop() ||
    req.socket?.remoteAddress ||
    null
  );
}

const router = Router();

router.post(
  "/delete",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const detail =
      typeof (req.body ?? {}).reason === "string"
        ? `Self-service account deletion request from Profile. Reason: ${(req.body as { reason: string }).reason}`
        : "Self-service account deletion request from Profile.";
    const row = await cp.submitPrivacyRequest(actor, { kind: "deletion", detail });
    await logAction(actor, "account.deletion_requested", "privacy_request", row.id, null, row, {
      ip: clientIp(req),
      summary: "self-service account deletion request",
    });
    const admins = getAdminAllowedEmails();
    const to = admins.length ? admins : actor.user.email ?? "";
    if (to && (Array.isArray(to) ? to.length : true)) {
      await notify
        .privacyRequestReceived(to, "account deletion request", {
          request_id: row.id,
          kind: "deletion",
          from: actor.user.email ?? actor.user.id,
        })
        .catch(() => undefined);
    }
    res.status(202).json({
      ok: true,
      request_id: row.id,
      status: "received",
      message:
        "Your account deletion request has been received. We will process it and remove your personal data, retaining only records we are legally required to keep.",
    });
  }),
);

export default router;
