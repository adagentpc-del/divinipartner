/**
 * Incident Management routes (live-ops phase, Part 15-16). Mount base:
 * /api/incidents.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as incidents from "../db/incidents.js";
import { INCIDENT_CATEGORIES } from "../lib/incidentVisibility.js";

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
  res.json({ categories: INCIDENT_CATEGORIES });
});

router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { category, severity, location, description, restricted, attachments } = req.body ?? {};
    res.status(201).json({
      incident: await incidents.createIncident(a, req.params.eventId, {
        category,
        severity,
        location,
        description,
        restricted,
        attachments,
      }),
    });
  }),
);

router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ incidents: await incidents.listIncidents(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/:incidentId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ incident: await incidents.getIncident(a, req.params.eventId, req.params.incidentId) });
  }),
);

router.patch(
  "/event/:eventId/:incidentId",
  h(async (req, res) => {
    const a = await actor(req);
    const { status, assigned_to, resolution, severity } = req.body ?? {};
    res.json({
      incident: await incidents.updateIncident(a, req.params.eventId, req.params.incidentId, {
        status,
        assigned_to,
        resolution,
        severity,
      }),
    });
  }),
);

export default router;
