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
import { isTerminalStatus, onEventCompleted } from "../db/completion.js";
import { checkLimit, limitExceededPayload } from "../lib/entitlements.js";
import { buildBeo } from "../db/beo.js";
import { renderBeoPdf } from "../lib/pdf.js";

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
    if (a.org) {
      const used = await events.countActiveEvents(a.org.id);
      const check = checkLimit(a.org, "events.active", used);
      if (!check.allowed) {
        return res.status(402).json(limitExceededPayload(a.org, "events.active", check));
      }
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
    const { status, override } = req.body ?? {};
    if (!events.isEventStatus(status)) return res.status(400).json({ error: "invalid status" });
    const ev = await events.setEventStatus(a, req.params.id, status, { override: !!override });
    // Notify the event participants (owner side + attached vendors), excluding
    // the actor who changed the status. Best-effort.
    const to = recipients.excluding(
      await recipients.eventParticipantEmails(ev.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length)
      await notify.eventStatusChanged(to, ev.name, status, { eventId: ev.id }).catch(() => undefined);
    // WS-1: on a terminal status, durably archive the event (vendors + sponsors)
    // and persist any linked fundraising recap. Best-effort, never blocks.
    if (isTerminalStatus(status)) {
      onEventCompleted(a, ev.id).catch((err) =>
        console.error(`[WS-1] onEventCompleted failed for ${ev.id}`, err),
      );
    }
    res.json({ event: ev });
  }),
);

/**
 * Start Event (Part 4 of the live-ops phase): the explicit owner/planner
 * action that moves an event into 'event_day' (LIVE). A thin wrapper over
 * setEventStatus, which is where the actual readiness gate + override
 * audit trail live -- this route exists for a clear, dedicated button/API
 * contract, not a second copy of the gate. On a blocked attempt (blocking
 * readiness issues, no override), setEventStatus throws
 * ReadinessBlockedError, translated by the shared error handler into a 409
 * carrying the real blocking checks so the frontend can render "EVENT NOT
 * FULLY READY" with the actual list rather than a generic message.
 */
router.post(
  "/:id/start",
  h(async (req, res) => {
    const a = await actor(req);
    const { override } = req.body ?? {};
    const ev = await events.setEventStatus(a, req.params.id, "event_day", { override: !!override });
    const to = recipients.excluding(
      await recipients.eventParticipantEmails(ev.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length)
      await notify.eventStatusChanged(to, ev.name, "event_day", { eventId: ev.id }).catch(() => undefined);
    res.json({ event: ev });
  }),
);

/**
 * Close Event (Part 25 of the live-ops phase): the explicit owner/planner
 * action that moves a live event from 'event_day' to 'completed'. A thin
 * wrapper over setEventStatus, symmetric with /:id/start -- the actual
 * closeout gate + audited override live there (db/closeout.ts's
 * computeCloseoutReadiness). A blocked attempt with no override throws
 * CloseoutBlockedError, translated by the shared error handler into a 409
 * carrying the real blocking closeout issues.
 */
router.post(
  "/:id/close",
  h(async (req, res) => {
    const a = await actor(req);
    const { override } = req.body ?? {};
    const ev = await events.setEventStatus(a, req.params.id, "completed", { override: !!override });
    const to = recipients.excluding(
      await recipients.eventParticipantEmails(ev.id).catch(() => [] as string[]),
      a.user.email,
    );
    if (to.length)
      await notify.eventStatusChanged(to, ev.name, "completed", { eventId: ev.id }).catch(() => undefined);
    // 'completed' is a terminal status (db/completion.ts's isTerminalStatus)
    // -- the generic /:id/status route already archives on any terminal
    // transition; this dedicated route must do the same so closing via the
    // Closeout tab's "Close Event" button is not a second, divergent path
    // that silently skips the durable event_memory/event_history archive.
    if (isTerminalStatus(ev.status)) {
      onEventCompleted(a, ev.id).catch((err) => console.error(`[WS-1] onEventCompleted failed for ${ev.id}`, err));
    }
    res.json({ event: ev });
  }),
);

/**
 * Duplicate / rebook an event (Part 39 of the live-ops phase). Starts a
 * fresh event pre-filled from the source's reusable config -- see
 * db/events.ts's duplicateEvent() for exactly what is and is not copied.
 */
router.post(
  "/:id/duplicate",
  h(async (req, res) => {
    const a = await actor(req);
    const { name, date_time, include_vendors, seed_workflow } = req.body ?? {};
    const ev = await events.duplicateEvent(a, req.params.id, {
      name,
      date_time,
      include_vendors: !!include_vendors,
      seed_workflow: seed_workflow !== false,
    });
    res.status(201).json({ event: ev });
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

/** Banquet Event Order (BEO): event overview, venue setup/access, run of
 *  show, and awarded vendor orders with real pricing (moat roadmap Phase 2c). */
router.get(
  "/:id/beo",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ beo: await buildBeo(a, req.params.id) });
  }),
);

/** Branded, downloadable BEO PDF. */
router.get(
  "/:id/beo/pdf",
  h(async (req, res) => {
    const a = await actor(req);
    const beo = await buildBeo(a, req.params.id);
    const pdf = await renderBeoPdf(beo);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="beo-${req.params.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  }),
);

export default router;
