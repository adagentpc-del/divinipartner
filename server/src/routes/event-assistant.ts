/**
 * Friction Elimination - U1 Client Event Intelligence Assistant routes.
 * Mount base: /api/event-assistant.
 *
 * POST /generate { intake, event_id? } -> { plan }
 *   Generates a deterministic plan via lib/eventAssistant.generatePlan. When an
 *   event_id is supplied the plan is persisted against that event (access-
 *   checked, IDOR-safe via the events repo) so the workspace becomes the system
 *   of record. Without an event_id the plan is returned without persisting.
 *
 * GET /event/:eventId/plans -> { plans }
 *   Lists previously saved plans for an event (access-checked).
 *
 * Mirrors server/src/routes/events.ts: requireUser, getActor, the h() async
 * wrapper, 400 on bad input, 403/404 surfaced from the repo errors.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { generatePlan, type EventIntake } from "../lib/eventAssistant.js";
import { saveEventPlan, getEventPlans } from "../db/event-intel.js";

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

/** Generate a plan from an intake; persist it when an event_id is provided. */
router.post(
  "/generate",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as { intake?: unknown; event_id?: unknown };
    const intake = body.intake;
    if (!intake || typeof intake !== "object") {
      return res.status(400).json({ error: "intake object required" });
    }
    const eventId =
      typeof body.event_id === "string" && body.event_id.trim() ? body.event_id.trim() : null;

    const plan = generatePlan(intake as EventIntake);

    let saved = null;
    if (eventId) {
      const row = await saveEventPlan(a, eventId, intake as EventIntake, plan);
      saved = { id: row.id, event_id: row.event_id, created_at: row.created_at };
    }

    res.json({ plan, saved });
  }),
);

/** List saved plans for an event (access-checked). */
router.get(
  "/event/:eventId/plans",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ plans: await getEventPlans(a, req.params.eventId) });
  }),
);

export default router;
