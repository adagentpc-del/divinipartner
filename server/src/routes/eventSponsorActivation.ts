/**
 * Event Sponsor Activation routes (live-ops phase, Part 23-24). Mount
 * base: /api/event-sponsor-activation -- distinct from the pre-existing
 * nonprofit fundraising sponsor routes (/api/sponsor-purchases,
 * /api/sponsor-portal), which are scoped to a different domain
 * (fundraising_events, not this system's `events` table).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as sponsorActivation from "../db/eventSponsorActivation.js";
import { SPONSOR_ACTIVATION_STATUSES } from "../lib/sponsorActivationVisibility.js";

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

router.get("/meta", (_req, res) => {
  res.json({ statuses: SPONSOR_ACTIVATION_STATUSES });
});

router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { sponsor_org_id, label, location_id, notes } = req.body ?? {};
    res.status(201).json({
      activation: await sponsorActivation.createActivationItem(a, req.params.eventId, {
        sponsor_org_id,
        label,
        location_id,
        notes,
      }),
    });
  }),
);

router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ activations: await sponsorActivation.listActivations(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/summary",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ summary: await sponsorActivation.activationSummary(a, req.params.eventId) });
  }),
);

router.patch(
  "/event/:eventId/:itemId",
  h(async (req, res) => {
    const a = await actor(req);
    const { status, notes } = req.body ?? {};
    res.json({
      activation: await sponsorActivation.updateActivationStatus(a, req.params.eventId, req.params.itemId, {
        status,
        notes,
      }),
    });
  }),
);

export default router;
