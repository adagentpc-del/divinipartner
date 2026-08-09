/**
 * Event Execution Packet routes. Mount base: /api/execution-packet.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as packet from "../db/executionPacket.js";
import { canManageEvent } from "../db/events.js";
import { ForbiddenError } from "../db.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/**
 * Live preview of the packet as it would be generated right now, projected
 * for the caller's own event role (Part 4 -- role-specific packet
 * projections). Not persisted. Owner/planner get the full packet; every
 * other role gets a backend-enforced narrowed view.
 */
router.get(
  "/event/:eventId/preview",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ preview: await packet.buildProjectedPreview(a, req.params.eventId) });
  }),
);

/** The raw, unprojected master snapshot. Owner/planner only -- internal
 *  tooling (audit, PDF generation) uses this; every recipient-facing view
 *  goes through the projected routes above/below. */
router.get(
  "/event/:eventId/preview/full",
  h(async (req, res) => {
    const a = await actor(req);
    if (!(await canManageEvent(a, req.params.eventId))) {
      throw new ForbiddenError("only the event owner can view the full master packet");
    }
    res.json({ preview: await packet.buildExecutionPacket(a, req.params.eventId) });
  }),
);

/** Generate (version) the packet. Owner or planner-role member only. */
router.post(
  "/event/:eventId/generate",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ packet: await packet.generatePacketVersion(a, req.params.eventId) });
  }),
);

/** Full version history, newest first. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ versions: await packet.listPacketVersions(a, req.params.eventId) });
  }),
);

/** One packet version, projected for the caller's own event role. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ packet: await packet.getProjectedPacketVersion(a, req.params.id) });
  }),
);

/** The raw, unprojected snapshot for one packet version. Owner/planner only. */
router.get(
  "/:id/full",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await packet.getPacketVersion(a, req.params.id);
    if (!(await canManageEvent(a, row.event_id))) {
      throw new ForbiddenError("only the event owner can view the full master packet");
    }
    res.json({ packet: row });
  }),
);

/** Acknowledge (Confirm Receipt) a packet version. */
router.post(
  "/:id/acknowledge",
  h(async (req, res) => {
    const a = await actor(req);
    const method = req.body?.method === "email_link" ? "email_link" : "app";
    res.json({ acknowledgment: await packet.acknowledgePacket(a, req.params.id, method) });
  }),
);

/**
 * "FINAL SCHEDULE RECEIPT" roster for the current packet version
 * (Part 10) -- who has confirmed receipt and who is still pending.
 * Owner/planner only.
 */
router.get(
  "/event/:eventId/receipt-status",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await packet.getReceiptStatus(a, req.params.eventId));
  }),
);

/**
 * WHAT CHANGED (Part 6): a categorized, human-readable diff against the
 * immediately preceding version, or an explicit ?since=<version number>.
 */
router.get(
  "/:id/diff",
  h(async (req, res) => {
    const a = await actor(req);
    const since = typeof req.query.since === "string" ? Number(req.query.since) : undefined;
    res.json(await packet.diffPacketVersion(a, req.params.id, Number.isFinite(since) ? since : undefined));
  }),
);

/** Mark the latest packet version 'final'. Owner or planner-role member only. */
router.post(
  "/event/:eventId/final",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ packet: await packet.markPacketFinal(a, req.params.eventId) });
  }),
);

export default router;
