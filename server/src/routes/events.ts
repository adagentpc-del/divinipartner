/**
 * Phase 3 - Event routes. Mount base: /api/events.
 *
 * Event CRUD + lifecycle status transitions + vendor add/remove + an AI bid
 * package generator (built only from event data, no fabrication).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as events from "../db/events.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";

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

/** Static reference data for the UI (status list). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ statuses: events.EVENT_STATUSES });
  }),
);

/** List events the actor can access. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ events: await events.listMyEvents(a) });
  }),
);

/** Create an event. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    const ev = await events.createEvent(a, req.body);
    res.status(201).json({ event: ev });
  }),
);

/** Event detail. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ event: await events.getEvent(a, req.params.id) });
  }),
);

/** Patch event fields. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ event: await events.updateEvent(a, req.params.id, req.body ?? {}) });
  }),
);

/** Transition lifecycle status. */
router.post(
  "/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const { status } = req.body ?? {};
    if (!events.isEventStatus(status)) return res.status(400).json({ error: "invalid status" });
    const ev = await events.setEventStatus(a, req.params.id, status);
    // Notify the event participants (owner side + attached vendors), excluding
    // the actor who changed the status. Best-effort.
    const to = recipients.excluding(
      await recipients.eventParticipantEmails(ev.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length)
      await notify.eventStatusChanged(to, ev.name, status, { eventId: ev.id }).catch(() => undefined);
    res.json({ event: ev });
  }),
);

/** List vendors attached to an event. */
router.get(
  "/:id/vendors",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ vendors: await events.listEventVendors(a, req.params.id) });
  }),
);

/** Attach a vendor org to an event. */
router.post(
  "/:id/vendors",
  h(async (req, res) => {
    const a = await actor(req);
    const { organization_id } = req.body ?? {};
    if (!organization_id) return res.status(400).json({ error: "organization_id required" });
    res.status(201).json({ vendor: await events.addEventVendor(a, req.params.id, req.body) });
  }),
);

/** Detach a vendor from an event. */
router.delete(
  "/:id/vendors/:eventVendorId",
  h(async (req, res) => {
    const a = await actor(req);
    await events.removeEventVendor(a, req.params.id, req.params.eventVendorId);
    res.status(204).end();
  }),
);

/** AI bid package: structured, vendor-ready package built from event data. */
router.post(
  "/:id/bid-package",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ package: await events.buildBidPackage(a, req.params.id) });
  }),
);

/**
 * Calendar export: a valid .ics with VEVENTs for the event and its key
 * itinerary milestones, built locally from stored data (no external calendar
 * API). Org-scoped via the actor.
 */
router.get(
  "/:id/ics",
  h(async (req, res) => {
    const a = await actor(req);
    const { filename, ics } = await events.buildEventIcs(a, req.params.id);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(ics);
  }),
);

export default router;
