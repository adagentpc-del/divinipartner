/**
 * Phase 6 - Guest List routes. Mount base: /api/guests.
 *
 * Guest CRUD per event, bulk add, RSVP + check-in tracking, and counts.
 * All routes require a signed-in user; read needs event access, mutation needs
 * event ownership (enforced in server/src/db/guests.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as guests from "../db/guests.js";

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

/** Reference data for the UI (RSVP statuses + meal options). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ rsvp_statuses: guests.RSVP_STATUSES, meal_preferences: guests.MEAL_PREFERENCES });
  }),
);

/** List guests on an event. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ guests: await guests.listGuests(a, req.params.eventId) });
  }),
);

/** Counts / rollups on an event. */
router.get(
  "/event/:eventId/counts",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ counts: await guests.guestCounts(a, req.params.eventId) });
  }),
);

/** Live event-day headcount: total, confirmed, checked_in. */
router.get(
  "/event/:eventId/headcount",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ headcount: await guests.headcount(a, req.params.eventId) });
  }),
);

/** Add a guest. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ guest: await guests.addGuest(a, req.params.eventId, req.body ?? {}) });
  }),
);

/** Bulk add guests (body: { guests: [...] }). */
router.post(
  "/event/:eventId/bulk",
  h(async (req, res) => {
    const a = await actor(req);
    const rows = Array.isArray(req.body?.guests) ? req.body.guests : [];
    res.status(201).json(await guests.bulkAddGuests(a, req.params.eventId, rows));
  }),
);

/** Patch a guest. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ guest: await guests.updateGuest(a, req.params.id, req.body ?? {}) });
  }),
);

/** Set RSVP status (body: { status }). */
router.post(
  "/:id/rsvp",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status required" });
    res.json({ guest: await guests.setRsvp(a, req.params.id, status) });
  }),
);

/** Toggle check-in (body: { checked_in }). */
router.post(
  "/:id/check-in",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ guest: await guests.setCheckedIn(a, req.params.id, !!req.body?.checked_in) });
  }),
);

/** Toggle check-in via PATCH (body: { checked_in }). Mirrors POST /:id/check-in. */
router.patch(
  "/:id/checkin",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ guest: await guests.setCheckedIn(a, req.params.id, !!req.body?.checked_in) });
  }),
);

/** Delete a guest. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await guests.deleteGuest(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
