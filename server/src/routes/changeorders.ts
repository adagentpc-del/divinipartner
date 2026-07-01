/**
 * Change Order routes (blueprint section 23). Mounted at /api/change-orders.
 *
 *   GET    /api/change-orders?event_id=   list change orders for an event
 *   GET    /api/change-orders/meta        statuses + labels
 *   POST   /api/change-orders             create a change order (computes scope creep)
 *   GET    /api/change-orders/:id         single change order
 *   PATCH  /api/change-orders/:id/status  advance lifecycle status
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { TIERS } from "../db.js";
import {
  createChangeOrder,
  listChangeOrders,
  getChangeOrder,
  updateChangeOrderStatus,
  CHANGE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS_LABELS,
  type ChangeOrderStatus,
} from "../db/changeorders.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get("/meta", (_req, res) => {
  res.json({ statuses: CHANGE_ORDER_STATUSES, labels: CHANGE_ORDER_STATUS_LABELS });
});

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const eventId = typeof req.query.event_id === "string" ? req.query.event_id : null;
    if (!eventId) return res.status(400).json({ error: "event_id required" });
    const rows = await listChangeOrders(eventId, {
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.json({ change_orders: rows });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const b = req.body ?? {};
    if (!b.event_id) return res.status(400).json({ error: "event_id required" });
    const feeRate =
      actor.org?.tier && (TIERS as Record<string, { feeRate: number }>)[actor.org.tier]
        ? (TIERS as Record<string, { feeRate: number }>)[actor.org.tier].feeRate
        : TIERS.free_partner.feeRate;
    const row = await createChangeOrder(actor.user.id, {
      event_id: b.event_id,
      quote_id: b.quote_id ?? null,
      invoice_id: b.invoice_id ?? null,
      vendor_id: b.vendor_id ?? null,
      title: b.title ?? null,
      description: b.description ?? null,
      reason: b.reason ?? null,
      line_items: Array.isArray(b.line_items) ? b.line_items : [],
      platform_fee_rate: feeRate,
      scope_creep_flag: !!b.scope_creep_flag,
      status: b.status as ChangeOrderStatus | undefined,
    });
    res.status(201).json({ change_order: row });
  }),
);

router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const row = await getChangeOrder(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ change_order: row });
  }),
);

router.patch(
  "/:id/status",
  requireUser,
  h(async (req, res) => {
    const status = (req.body ?? {}).status as ChangeOrderStatus;
    if (!status) return res.status(400).json({ error: "status required" });
    try {
      const row = await updateChangeOrderStatus(req.params.id, status);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json({ change_order: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }),
);

export default router;
