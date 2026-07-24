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
import * as ex from "../db/eventExhibitor.js";

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
    const a = await actor(req);
    await el.assertOwnsEvent(a, req.params.eventId); // owner-only: exposes sold counts + inactive tiers
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

// ---- Exhibitor management (packages + booths + orders) ----------------------

router.get(
  "/event/:eventId/exhibitor",
  h(async (req, res) => {
    const a = await actor(req);
    const [packages, booths, orders] = await Promise.all([
      ex.listPackages(req.params.eventId),
      ex.listBooths(req.params.eventId),
      ex.listOrders(a, req.params.eventId),
    ]);
    res.json({ packages, booths, orders });
  }),
);

router.post(
  "/event/:eventId/packages",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ package: await ex.createPackage(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.patch(
  "/packages/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ package: await ex.updatePackage(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/packages/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await ex.deletePackage(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "package not found" });
    res.status(204).end();
  }),
);

router.post(
  "/event/:eventId/booths",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ booth: await ex.createBooth(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.delete(
  "/booths/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await ex.deleteBooth(a, req.params.id);
    if (!ok) return res.status(404).json({ error: "booth not found" });
    res.status(204).end();
  }),
);

export default router;
