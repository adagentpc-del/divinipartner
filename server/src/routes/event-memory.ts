/**
 * Intelligence Moat - F1 Event Memory + F10 Post-Event Intelligence routes.
 * Mount base: /api/event-memory.
 *
 *   POST /record/:eventId   - gather + persist the event memory snapshot
 *   GET  /:eventId          - read the stored snapshot for an event
 *   GET  /insights          - surfaced insights for ?eventType=&venueId=
 *   POST /feedback          - collect post-event feedback
 *   GET  /feedback/:eventId  - list + analyze feedback for an event
 *
 * All routes require a signed-in user; every event-scoped operation is IDOR
 * gated through the event-memory repo (which funnels through getEvent()).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as memory from "../db/event-memory.js";
import { analyzeDrivers, type FeedbackRow } from "../lib/postEvent.js";

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

/** Build + persist the snapshot for an event. */
router.post(
  "/record/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await memory.recordEventMemory(a, req.params.eventId);
    res.status(201).json({ memory: row });
  }),
);

/**
 * Surfaced insights across past snapshots for an event type and/or venue.
 * NOTE: declared before the catch-all "/:eventId" so "insights" is not treated
 * as an event id.
 */
router.get(
  "/insights",
  h(async (req, res) => {
    await actor(req); // require a resolvable actor
    const eventType = (req.query.eventType as string | undefined)?.trim() || null;
    const venueId = (req.query.venueId as string | undefined)?.trim() || null;
    const { insights, sample } = await memory.insightsFor(eventType, venueId);
    res.json({ insights, sample, filter: { eventType, venueId } });
  }),
);

/** Read the stored snapshot for an event. */
router.get(
  "/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await memory.getMemory(a, req.params.eventId);
    if (!row) return res.status(404).json({ error: "no memory recorded for this event" });
    res.json({ memory: row });
  }),
);

/** Collect post-event feedback. */
router.post(
  "/feedback",
  h(async (req, res) => {
    const a = await actor(req);
    const { event_id } = req.body ?? {};
    if (!event_id || typeof event_id !== "string") {
      return res.status(400).json({ error: "event_id required" });
    }
    const result = await memory.createFeedback(a, req.body);
    res.status(201).json({
      feedback: result.feedback,
      scores_updated: result.scores_updated,
      playbook: result.playbook,
    });
  }),
);

/** List + analyze the feedback collected for an event. */
router.get(
  "/feedback/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const rows = await memory.listFeedback(a, req.params.eventId);
    const analysis = analyzeDrivers(rows as unknown as FeedbackRow[]);
    res.json({ feedback: rows, analysis });
  }),
);

export default router;
