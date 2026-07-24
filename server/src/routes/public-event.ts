/**
 * Universal Event Landing - PUBLIC surface (no auth). Mount base: /api/public/event.
 *
 *   GET  /:eventId           the public landing payload (details, agenda, tiers)
 *   POST /:eventId/register  free register or start a ticket order
 *
 * No auth: anyone with the link can view and attend. Only whitelisted fields are
 * returned by the data layer.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as el from "../db/eventLanding.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/:eventId",
  h(async (req, res) => {
    const landing = await el.getPublicLanding(req.params.eventId);
    if (!landing) return res.status(404).json({ error: "Event not found." });
    res.json({ landing });
  }),
);

router.post(
  "/:eventId/register",
  h(async (req, res) => {
    const result = await el.registerAttendee(req.params.eventId, req.body ?? {});
    if (!result) return res.status(400).json({ error: "This event is not accepting attendees." });
    res.status(201).json(result);
  }),
);

export default router;
