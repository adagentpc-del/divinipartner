/**
 * Intelligence Moat - F11 Attendee Intelligence routes.
 * Mount base: /api/attendee-intel.
 *
 *   GET /:eventId             -> attendee analytics for an event (funnel rates,
 *                                engagement aggregates, engagement + audience
 *                                quality scores).
 *   PUT /:eventId/engagement  -> upsert per-registration engagement counters.
 *
 * Event access is enforced inside the data layer (member-attendee.ts) via the
 * events repo's getEvent (throws NotFound/Forbidden). IDOR-safe.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as ma from "../db/member-attendee.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Attendee analytics for an event. */
router.get(
  "/:eventId",
  h(async (req, res) => {
    const a = await getActor(req);
    res.json(await ma.gatherAttendeeAnalytics(a, req.params.eventId));
  }),
);

/** Upsert engagement counters for one registration of the event. */
router.put(
  "/:eventId/engagement",
  h(async (req, res) => {
    const a = await getActor(req);
    const {
      registrationId,
      boothVisits,
      qrScans,
      sponsorInteractions,
      sessionsAttended,
      leads,
      surveyResponse,
    } = req.body ?? {};
    if (!registrationId || typeof registrationId !== "string") {
      return res.status(400).json({ error: "registrationId required" });
    }
    const row = await ma.upsertAttendeeEngagement(a, req.params.eventId, {
      registrationId,
      boothVisits,
      qrScans,
      sponsorInteractions,
      sessionsAttended,
      leads,
      surveyResponse,
    });
    res.json({ engagement: row });
  }),
);

export default router;
