/**
 * Availability calendar routes. Mount base: /api/calendar.
 *
 *   GET    /                        my calendar in a date range
 *   POST   /                        create a row on my calendar
 *   PATCH  /:id                     update a row on my calendar (confirm/cancel a hold)
 *   DELETE /:id                     remove a row from my calendar
 *   GET    /feed-token              get-or-create my private .ics subscribe link
 *   POST   /feed-token/rotate       rotate (revoke the old) subscribe link
 *   GET    /feed/:token.ics         PUBLIC, token-gated .ics feed (webcal subscribe)
 *   GET    /:orgId/availability     PUBLIC busy windows only, no auth, no details
 *   POST   /:orgId/request-hold     any signed-in user requests a tentative hold
 *                                   on a DIFFERENT org's calendar ("book it")
 *
 * One-way calendar sync only (subscribe feed): Apple/Google pull from us on
 * their own refresh schedule. Nothing syncs back from Apple/Google into this
 * app. See lib/ics.ts and lib/availability.ts for the pure logic.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as calendar from "../db/calendar.js";
import { buildIcsCalendar } from "../lib/ics.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

const router = Router();

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json({ events: await calendar.listMyCalendar(a, { from, to }) });
  }),
);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ kinds: calendar.CALENDAR_KINDS, statuses: calendar.CALENDAR_STATUSES });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const row = await calendar.createCalendarEvent(a, req.body ?? {});
    res.status(201).json({ event: row });
  }),
);

router.get(
  "/feed-token",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const token = await calendar.getOrCreateFeedToken(a);
    const base = appBaseUrl(req);
    const feedPath = `/api/calendar/feed/${token}.ics`;
    res.json({
      token,
      feed_url: `${base}${feedPath}`,
      webcal_url: `${base.replace(/^https?:\/\//, "webcal://")}${feedPath}`,
    });
  }),
);

router.post(
  "/feed-token/rotate",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const token = await calendar.rotateFeedToken(a);
    const base = appBaseUrl(req);
    const feedPath = `/api/calendar/feed/${token}.ics`;
    res.json({
      token,
      feed_url: `${base}${feedPath}`,
      webcal_url: `${base.replace(/^https?:\/\//, "webcal://")}${feedPath}`,
    });
  }),
);

/** PUBLIC. Token-gated .ics feed for Apple/Google Calendar to subscribe to. */
router.get(
  "/feed/:token.ics",
  h(async (req, res) => {
    const token = req.params.token;
    const resolved = await calendar.orgForFeedToken(token);
    if (!resolved) return res.status(404).json({ error: "unknown or revoked calendar feed link" });
    const rows = await calendar.calendarEventsForFeed(resolved.orgId);
    const ics = buildIcsCalendar(resolved.orgName, rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      allDay: r.all_day,
      status: r.status,
      updatedAt: r.updated_at,
    })));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="calendar.ics"`);
    res.send(ics);
  }),
);

/** PUBLIC. Merged busy windows only for the public profile availability widget. */
router.get(
  "/:orgId/availability",
  h(async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const windows = await calendar.publicAvailability(req.params.orgId, { from, to });
    res.json({ busy: windows });
  }),
);

/** Any signed-in user places a tentative hold on a DIFFERENT org's calendar
 *  ("book it" on a public venue/vendor profile). The target org confirms or
 *  cancels it themselves through the normal PATCH/DELETE on their own calendar. */
router.post(
  "/:orgId/request-hold",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const row = await calendar.requestHold(a, req.params.orgId, req.body ?? {});
    res.status(201).json({ event: row });
  }),
);

router.patch(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    const row = await calendar.updateCalendarEvent(a, req.params.id, req.body ?? {});
    res.json({ event: row });
  }),
);

router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const a = await actor(req);
    await calendar.deleteCalendarEvent(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
