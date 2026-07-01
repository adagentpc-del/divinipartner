/**
 * Intelligence Moat - F2 Event Playbook Engine routes. Mount base: /api/playbooks.
 *
 * Save a whole event as a reusable playbook and clone a playbook into a brand
 * new event (which is created through the events repo, then repopulated with
 * timeline / tasks / vendors). Complements the existing /templates routes; it
 * does not touch event_templates.
 *
 * Auth: requireUser + getActor; every db call is org-scoped and IDOR-safe.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as playbooks from "../db/playbooks.js";

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

/** List the org's playbooks. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ playbooks: await playbooks.listPlaybooks(a) });
  }),
);

/** Playbook detail. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ playbook: await playbooks.getPlaybook(a, req.params.id) });
  }),
);

/** Save an existing event as a reusable playbook. */
router.post(
  "/from-event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { name, template_type } = req.body ?? {};
    const pb = await playbooks.saveEventAsPlaybook(
      a,
      req.params.eventId,
      typeof name === "string" ? name : "",
      typeof template_type === "string" ? template_type : null,
    );
    res.status(201).json({ playbook: pb });
  }),
);

/** Clone a playbook into a new event (created via the events repo). */
router.post(
  "/:id/clone",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const overrides = {
      name: typeof body.name === "string" ? body.name : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      date_time: typeof body.date_time === "string" ? body.date_time : undefined,
      guest_count: typeof body.guest_count === "number" ? body.guest_count : undefined,
      budget: typeof body.budget === "number" ? body.budget : undefined,
      venue_id: typeof body.venue_id === "string" ? body.venue_id : undefined,
      branding_opportunity_id:
        typeof body.branding_opportunity_id === "string" ? body.branding_opportunity_id : undefined,
      include_vendors: typeof body.include_vendors === "boolean" ? body.include_vendors : undefined,
      include_timeline: typeof body.include_timeline === "boolean" ? body.include_timeline : undefined,
      include_tasks: typeof body.include_tasks === "boolean" ? body.include_tasks : undefined,
    };
    const result = await playbooks.cloneToEvent(a, req.params.id, overrides);
    res.status(201).json(result);
  }),
);

export default router;
