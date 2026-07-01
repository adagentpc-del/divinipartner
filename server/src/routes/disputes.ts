/**
 * Phase 8 - Disputes / Refunds / Cancellations routes. Mount base: /api/disputes.
 * requireUser; resolution actions are admin-gated in the db layer.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as disputes from "../db/disputes.js";
import { logAction } from "../lib/audit.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      statuses: disputes.DISPUTE_STATUSES,
      kinds: disputes.DISPUTE_KINDS,
      categories: disputes.DISPUTE_CATEGORIES,
    });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      disputes: await disputes.listDisputes(a, isAdmin, {
        status: (req.query.status as string) || undefined,
        kind: (req.query.kind as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const { a } = await actor(req);
    const { reason } = req.body ?? {};
    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ error: "reason required" });
    }
    const d = await disputes.createDispute(a, req.body);
    await logAction(a, "dispute.opened", "dispute", d.id, null, d, {
      summary: `${d.kind} opened`,
    });
    res.status(201).json({ dispute: d });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ dispute: await disputes.getDispute(a, isAdmin, req.params.id) });
  }),
);

router.post(
  "/:id/status",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const { status, resolution, resolution_amount } = req.body ?? {};
    if (!disputes.isDisputeStatus(status)) return res.status(400).json({ error: "invalid status" });
    const { prev, next } = await disputes.setStatus(a, isAdmin, req.params.id, status, {
      resolution,
      resolution_amount,
    });
    await logAction(a, "dispute.status_changed", "dispute", req.params.id, prev, next, {
      summary: `dispute -> ${status}`,
    });
    res.json({ dispute: next });
  }),
);

export default router;
