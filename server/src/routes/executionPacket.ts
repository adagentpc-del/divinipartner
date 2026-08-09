/**
 * Event Execution Packet routes. Mount base: /api/execution-packet.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as packet from "../db/executionPacket.js";

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

/** Live preview of the packet as it would be generated right now. Not persisted. */
router.get(
  "/event/:eventId/preview",
  h(async (req, res) => {
    const a = await actor(req);
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

/** One packet version. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ packet: await packet.getPacketVersion(a, req.params.id) });
  }),
);

/** Acknowledge (Confirm Receipt) a packet version. */
router.post(
  "/:id/acknowledge",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ acknowledgment: await packet.acknowledgePacket(a, req.params.id) });
  }),
);

export default router;
