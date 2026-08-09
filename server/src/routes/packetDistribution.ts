/**
 * Execution Packet distribution settings routes. Mount base:
 * /api/packet-distribution.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as dist from "../db/packetDistribution.js";
import { runPacketDistribution, runPacketReminders } from "../db/packetDistribution.js";

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

/** Current distribution settings for an event (or the unpersisted default). Owner/planner only. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ settings: await dist.getDistributionSettings(a, req.params.eventId) });
  }),
);

/** Configure distribution. Owner/planner only. */
router.put(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { enabled, offset_preset, custom_offset_minutes, send_time, recipient_roles, reminder_offsets } =
      req.body ?? {};
    res.json({
      settings: await dist.updateDistributionSettings(a, req.params.eventId, {
        enabled,
        offset_preset,
        custom_offset_minutes,
        send_time,
        recipient_roles,
        reminder_offsets,
      }),
    });
  }),
);

/** Explicit "Send Anyway" override for a blocked distribution. Owner/planner only. */
router.post(
  "/event/:eventId/override",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ settings: await dist.overrideDistributionBlock(a, req.params.eventId) });
  }),
);

/** Admin-only manual trigger for the distribution pass (mirrors routes/worker.ts's pattern). */
router.post(
  "/run",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ summary: await runPacketDistribution() });
  }),
);

/** Admin-only manual trigger for the acknowledgment-reminder pass. */
router.post(
  "/run-reminders",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ summary: await runPacketReminders() });
  }),
);

export default router;
