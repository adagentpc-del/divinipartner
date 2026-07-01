/**
 * Phase 8 - Admin routes. Mount base: /api/admin. ALL routes are requireAdmin.
 *
 * Surfaces: intelligence metrics (blueprint 44), account management +
 * approvals, the PRIVATE white-label pipeline (blueprint 5), and the audit
 * trail reader (blueprint 42).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as admin from "../db/admin.js";
import * as whitelabel from "../db/whitelabel.js";
import { logAction, readAudit, auditActions } from "../lib/audit.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}
function ip(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

const router = Router();
router.use(requireAdmin);

// ---- Intelligence (blueprint 44) -------------------------------------------
router.get(
  "/metrics",
  h(async (_req, res) => {
    res.json({ metrics: await admin.getMetrics() });
  }),
);

// ---- Account management + approvals ----------------------------------------
router.get(
  "/accounts",
  h(async (req, res) => {
    res.json({
      accounts: await admin.listAccounts({
        verification_status: (req.query.verification_status as string) || undefined,
        tier: (req.query.tier as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/accounts/:id/verification",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!status || typeof status !== "string") {
      return res.status(400).json({ error: "status required" });
    }
    const { prev, next } = await admin.setVerification(req.params.id, status);
    await logAction(a, "account.verification_changed", "organization", req.params.id,
      prev, next, { ip: ip(req), summary: `verification -> ${status}` });
    res.json({ account: next });
  }),
);

router.post(
  "/accounts/:id/subscription",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!status || typeof status !== "string") {
      return res.status(400).json({ error: "status required" });
    }
    const { prev, next } = await admin.setSubscription(req.params.id, status);
    await logAction(a, "account.subscription_changed", "organization", req.params.id,
      prev, next, { ip: ip(req), summary: `subscription -> ${status}` });
    res.json({ account: next });
  }),
);

// ---- White-label pipeline (blueprint 5) - PRIVATE, admin-only --------------
router.get(
  "/white-label/meta",
  h(async (_req, res) => {
    res.json({ statuses: whitelabel.WHITELABEL_STATUSES });
  }),
);

router.get(
  "/white-label",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ pipeline: await whitelabel.pipeline(a) });
  }),
);

router.get(
  "/white-label/:orgId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ record: await whitelabel.getForOrg(a, req.params.orgId) });
  }),
);

router.patch(
  "/white-label/:orgId",
  h(async (req, res) => {
    const a = await actor(req);
    const { prev, next } = await whitelabel.upsertRecord(a, req.params.orgId, req.body ?? {});
    await logAction(a, "white_label.updated", "organization", req.params.orgId,
      prev, next, { ip: ip(req) });
    res.json({ record: next });
  }),
);

router.post(
  "/white-label/:orgId/status",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!whitelabel.isWhiteLabelStatus(status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    const { prev, next } = await whitelabel.setStatus(a, req.params.orgId, status);
    await logAction(a, "white_label.status_changed", "organization", req.params.orgId,
      prev, next, { ip: ip(req), summary: `white-label -> ${status}` });
    res.json({ record: next });
  }),
);

// ---- Audit trail (blueprint 42) --------------------------------------------
router.get(
  "/audit",
  h(async (req, res) => {
    res.json({
      entries: await readAudit({
        actorId: (req.query.actorId as string) || undefined,
        action: (req.query.action as string) || undefined,
        objectType: (req.query.objectType as string) || undefined,
        objectId: (req.query.objectId as string) || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      }),
    });
  }),
);

router.get(
  "/audit/actions",
  h(async (_req, res) => {
    res.json({ actions: await auditActions() });
  }),
);

export default router;
