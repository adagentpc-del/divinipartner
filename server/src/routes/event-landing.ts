/**
 * Universal Event Landing - coordinator management. Mount base: /api/event-landing.
 * Requires a signed-in user; every op is IDOR-gated to the event owner.
 *
 *   GET    /event/:eventId            settings + tiers
 *   PUT    /event/:eventId            update settings (attend_mode, vendor CTA, copy)
 *   POST   /event/:eventId/tiers      create a ticket tier
 *   PATCH  /tiers/:id                 update a tier
 *   DELETE /tiers/:id                 delete a tier
 *   GET    /event/:eventId/registrations   attendee list
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as el from "../db/eventLanding.js";

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

router.get(
  "/event/:eventId",
  h(async (req, res) => {
    await actor(req); // resolvable user
    const [settings, tiers] = await Promise.all([
      el.getSettings(req.params.eventId),
      el.listTiers(req.params.eventId),
    ]);
    res.json({ settings, tiers });
  }),
);

router.put(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ settings: await el.upsertSettings(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.post(
  "/event/:eventId/tiers",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ tier: await el.createTier(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.patch(
  "/tiers/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tier: await el.updateTier(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/tiers/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await el.deleteTier(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "tier not found" });
    res.status(204).end();
  }),
);

router.get(
  "/event/:eventId/registrations",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ registrations: await el.listRegistrations(a, req.params.eventId) });
  }),
);

export default router;
