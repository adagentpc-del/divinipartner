/**
 * Friction Elimination - U15 Guest Experience Hub routes.
 * Mount base: /api/guest-hub.
 *
 * Attendee registration / RSVP / ticketing, QR check-in, and per-event
 * attendee-facing info (schedule, venue map, parking, last-minute updates).
 * This is a NEW attendee layer that sits alongside the existing /api/guests
 * routes and the event-day check-in flow; it does not modify them.
 *
 * Most routes require a signed-in user (read needs event access, mutation needs
 * event ownership, enforced in server/src/db/guest-hub.ts). ONE attendee-facing
 * GET (/public/info/:eventId) is intentionally mounted BEFORE the auth guard so
 * an attendee can pull the public schedule / map / parking / updates without an
 * account. It exposes only attendee-safe fields for a single event_id and never
 * enumerates across tenants.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as hub from "../db/guest-hub.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();

// ---- PUBLIC (no auth) ------------------------------------------------------
// Attendee-facing event info. Single event_id, attendee-safe fields only.
router.get(
  "/public/info/:eventId",
  h(async (req, res) => {
    const data = await hub.getPublicEventInfo(req.params.eventId);
    if (!data) return res.status(404).json({ error: "event not found" });
    res.json(data);
  }),
);

// ---- AUTHENTICATED ---------------------------------------------------------
router.use(requireUser);

/** Reference data for the UI (RSVP statuses). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ rsvp_statuses: hub.RSVP_STATUSES });
  }),
);

/** List registrations on an event. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ registrations: await hub.listRegistrations(a, req.params.eventId) });
  }),
);

/** Create a registration on an event. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ registration: await hub.createRegistration(a, req.params.eventId, req.body ?? {}) });
  }),
);

/** Patch a registration. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ registration: await hub.updateRegistration(a, req.params.id, req.body ?? {}) });
  }),
);

/** Set RSVP status (body: { status }). */
router.post(
  "/:id/rsvp",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status required" });
    res.json({ registration: await hub.setRsvp(a, req.params.id, status) });
  }),
);

/** Check in by QR code (body: { qr_code }). */
router.post(
  "/checkin",
  h(async (req, res) => {
    const a = await actor(req);
    const qr = (req.body?.qr_code ?? "").toString();
    if (!qr.trim()) return res.status(400).json({ error: "qr_code required" });
    res.json({ registration: await hub.checkInByQr(a, qr) });
  }),
);

/** Delete a registration. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await hub.deleteRegistration(a, req.params.id);
    res.status(204).end();
  }),
);

/** Get attendee-facing info for an event (schedule / map / parking / updates). */
router.get(
  "/info/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ info: await hub.getEventInfo(a, req.params.eventId) });
  }),
);

/** Create or update attendee-facing info for an event. */
router.put(
  "/info/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ info: await hub.upsertEventInfo(a, req.params.eventId, req.body ?? {}) });
  }),
);

export default router;
