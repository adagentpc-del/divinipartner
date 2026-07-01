/**
 * Intelligence Moat - F3 AI Event War Room routes.
 * Mount base: /api/event-war-room.
 *
 * GET  /:eventId        -> { eventId, scannedAt, counts, alerts[] }
 *   Runs a live per-event health scan (db/warroom.runScan), access-checked /
 *   IDOR-safe via the events repo. Each alert carries severity, message,
 *   recommendation, and the persisted snooze/resolve state.
 *
 * POST /:eventId/state  { code, status, note? } -> the updated state row
 *   Upserts the operator's disposition (open|snoozed|resolved) for one alert
 *   code (db/warroom.setAlertState), access-checked / IDOR-safe.
 *
 * Mirrors server/src/routes/events.ts: requireUser, getActor, the h() async
 * wrapper, 400 for bad input, 403/404 surfaced from the repo errors.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { runScan, setAlertState, type AlertStatus } from "../db/warroom.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const VALID_STATUS = new Set<AlertStatus>(["open", "snoozed", "resolved"]);

const router = Router();
router.use(requireUser);

/** Live war-room scan for an event: alerts + recommendations + counts. */
router.get(
  "/:eventId",
  h(async (req, res) => {
    const actor = await getActor(req);
    const result = await runScan(actor, req.params.eventId);
    res.json(result);
  }),
);

/** Set the snooze/resolve disposition for one alert code on an event. */
router.post(
  "/:eventId/state",
  h(async (req, res) => {
    const actor = await getActor(req);
    const body = (req.body ?? {}) as { code?: unknown; status?: unknown; note?: unknown };

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }
    const status = body.status as AlertStatus;
    if (!VALID_STATUS.has(status)) {
      res.status(400).json({ error: "status must be one of open, snoozed, resolved" });
      return;
    }
    const note = typeof body.note === "string" ? body.note : null;

    const row = await setAlertState(actor, req.params.eventId, code, status, note);
    res.json(row);
  }),
);

export default router;
