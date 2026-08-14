/**
 * Divini Change Desk routes (originally "Change Orders," blueprint section
 * 23). Mounted at /api/change-orders.
 *
 *   GET    /api/change-orders?event_id=      list change orders for an event
 *   GET    /api/change-orders/meta           statuses + labels
 *   POST   /api/change-orders                create a change order (scope/price/schedule, computes scope creep)
 *   GET    /api/change-orders/:id            single change order
 *   PATCH  /api/change-orders/:id/status     advance lifecycle status (logs append-only history)
 *   GET    /api/change-orders/:id/history    append-only status history
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { TIERS } from "../db.js";
import { getEvent, canManageEvent } from "../db/events.js";
import { recordEventChange } from "../db/eventChanges.js";
import { recordActivity } from "../db/eventActivity.js";
import {
  createChangeOrder,
  listChangeOrders,
  getChangeOrder,
  updateChangeOrderStatus,
  listStatusHistory,
  CHANGE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS_LABELS,
  type ChangeOrderStatus,
} from "../db/changeorders.js";

/**
 * Live Change Requests (live-ops phase, Part 13-14, 2026-08-09). Reuses
 * this pre-existing change-order system as-is -- it already has exactly
 * the fields Part 13 asks for (line_items with cost, requested_new_date /
 * schedule_change_note for timing impact, reason) -- rather than building
 * a second, disconnected "day-of change request" entity. "Discuss" is the
 * existing revision_requested status.
 */
const RESPONSE_STATUSES = new Set<ChangeOrderStatus>([
  "accepted",
  "declined",
  "revision_requested",
  "added_to_invoice",
  "paid",
  "closed",
]);

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
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const eventId = typeof req.query.event_id === "string" ? req.query.event_id : null;
    if (!eventId) return res.status(400).json({ error: "event_id required" });
    await getEvent(actor, eventId); // IDOR gate: must be a participant of the event
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
    await getEvent(actor, b.event_id); // IDOR gate: only event participants may create a change order
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
      requested_new_date: typeof b.requested_new_date === "string" ? b.requested_new_date : null,
      schedule_change_note: typeof b.schedule_change_note === "string" ? b.schedule_change_note : null,
      status: b.status as ChangeOrderStatus | undefined,
    });
    await recordActivity(actor, b.event_id, {
      category: "change",
      message: `Change request submitted: ${row.title ?? row.change_order_number ?? "Untitled"}${row.amount ? ` ($${row.amount})` : ""}`,
      relatedEntityType: "change_order",
      relatedEntityId: row.id,
    }).catch(() => undefined);
    res.status(201).json({ change_order: row });
  }),
);

router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const row = await getChangeOrder(req.params.id);
    if (!row || !row.event_id) return res.status(404).json({ error: "not found" });
    await getEvent(actor, row.event_id); // IDOR gate: must be a participant of the CO's event
    res.json({ change_order: row });
  }),
);

router.patch(
  "/:id/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const status = (req.body ?? {}).status as ChangeOrderStatus;
    if (!status) return res.status(400).json({ error: "status required" });
    const existing = await getChangeOrder(req.params.id);
    if (!existing || !existing.event_id) return res.status(404).json({ error: "not found" });
    await getEvent(actor, existing.event_id); // IDOR gate before mutating status

    // Live Change Requests (Part 13): approving/declining/discussing a
    // change order is a planner decision, not something the requester (a
    // vendor or staff member) may do to their own request -- self-approval
    // would defeat the entire point of a review step. The requester may
    // still submit/re-submit (draft/sent); only owner/planner can move it
    // to a response or financial follow-on state. This closes a real gap:
    // this route previously let ANY event participant set ANY status,
    // including accepting their own change order.
    if (RESPONSE_STATUSES.has(status)) {
      if (!(await canManageEvent(actor, existing.event_id))) {
        return res.status(403).json({ error: "only the event owner or planner can respond to a change order" });
      }
    } else if (existing.requested_by !== actor.user.id && !(await canManageEvent(actor, existing.event_id))) {
      return res.status(403).json({ error: "only the requester or the event owner can update this change order" });
    }

    try {
      const row = await updateChangeOrderStatus(req.params.id, status, actor.user.id);
      if (!row) return res.status(404).json({ error: "not found" });

      // Change Order Integration (Part 14): an approval is the
      // highest-visibility event a change order has. Record it in the
      // shared event change history (financial_impact, so Part 28-31's
      // reconciliation can sum it) and the live activity timeline, and
      // mark the Final Event Schedule stale if it touched schedule or
      // vendor scope -- never a disconnected "day-of expense" record;
      // this change_orders table IS the authoritative financial change
      // system already, nothing new is invented here.
      if (status === "accepted") {
        await recordEventChange(actor, existing.event_id, {
          category: "budget",
          field: "change_order",
          old_value: null,
          new_value: row.change_order_number ?? row.id,
          reason: row.reason ?? row.title ?? null,
          requires_acknowledgment: true,
          financial_impact: row.amount != null ? Number(row.amount) : null,
        }).catch(() => undefined);
        await recordActivity(actor, existing.event_id, {
          category: "change",
          message: `Change order approved: ${row.title ?? row.change_order_number ?? "Untitled"}${row.amount ? ` ($${row.amount})` : ""}`,
          relatedEntityType: "change_order",
          relatedEntityId: row.id,
          payload: { amount: row.amount, requested_by: row.requested_by, approved_by: actor.user.id },
        }).catch(() => undefined);
        if (row.requested_new_date || row.schedule_change_note) {
          // checkAndMarkPacketStale's diff would never catch this: a
          // change order's schedule_change_note/requested_new_date live
          // only in change_orders, which buildExecutionPacket() does not
          // read, so the live-vs-snapshot diff always comes back empty.
          // markPacketStale() flags it directly and honestly instead.
          const { markPacketStale } = await import("../db/packetInvalidation.js");
          await markPacketStale(
            existing.event_id,
            `Change order approved: ${row.title ?? row.change_order_number ?? "Untitled"} may affect the schedule -- review Run of Show.`,
          ).catch(() => undefined);
        }
      } else if (status === "declined") {
        await recordActivity(actor, existing.event_id, {
          category: "change",
          message: `Change order declined: ${row.title ?? row.change_order_number ?? "Untitled"}`,
          relatedEntityType: "change_order",
          relatedEntityId: row.id,
        }).catch(() => undefined);
      }

      res.json({ change_order: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }),
);

router.get(
  "/:id/history",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const existing = await getChangeOrder(req.params.id);
    if (!existing || !existing.event_id) return res.status(404).json({ error: "not found" });
    await getEvent(actor, existing.event_id); // IDOR gate: must be a participant of the CO's event
    res.json({ history: await listStatusHistory(req.params.id) });
  }),
);

export default router;
