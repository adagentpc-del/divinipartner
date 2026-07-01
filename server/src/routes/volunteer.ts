/**
 * Nonprofit Volunteer Management - routes (Phase 2). Mount base: /api/volunteer.
 *
 * Registration CRUD, role/shift assignment, check-in, per-volunteer task lists,
 * and a manual shift-reminder trigger over a nonprofit org's volunteers. Every
 * route is org-scoped and IDOR-safe via the volunteer repo
 * (server/src/db/volunteer.ts), which validates each row (and any optional
 * fundraising-event link) against the actor's org before any read or write.
 * Mirrors server/src/routes/fundraising-events.ts: requireUser, getActor, the
 * h() async wrapper, 400 on bad input, 403/404 from the repo's
 * ForbiddenError/NotFoundError. notify.* builders fire best-effort so a delivery
 * hiccup never fails the request.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as vol from "../db/volunteer.js";
import { notify } from "../lib/notify.js";

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

// ---- Volunteers: registration CRUD -----------------------------------------

/** List the actor org's volunteers (optionally ?event=<fundraisingEventId>). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const eventId = typeof req.query.event === "string" ? req.query.event : null;
    res.json({ volunteers: await vol.listVolunteers(a, eventId) });
  }),
);

/** Register a volunteer for the actor's org. notify.volunteerRegistered. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    if (!body.name || typeof body.name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    const created = await vol.createVolunteer(a, body);
    if (created.email) {
      await notify
        .volunteerRegistered(created.email, created.name, { volunteerId: created.id })
        .catch(() => undefined);
    }
    res.status(201).json({ volunteer: created });
  }),
);

/** Get one volunteer (org-scoped). */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ volunteer: await vol.getVolunteer(a, req.params.id) });
  }),
);

/** Patch a volunteer's contact fields / status (org-scoped). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ volunteer: await vol.updateVolunteer(a, req.params.id, req.body ?? {}) });
  }),
);

/** Remove a volunteer (org-scoped). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await vol.removeVolunteer(a, req.params.id);
    res.status(204).end();
  }),
);

// ---- Assignment + check-in --------------------------------------------------

/** Assign a role + shift; status -> 'assigned'. notify.volunteerAssigned. */
router.post(
  "/:id/assign",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const updated = await vol.assignVolunteer(a, req.params.id, {
      role: typeof body.role === "string" ? body.role : null,
      shift: typeof body.shift === "string" ? body.shift : null,
    });
    if (updated.email) {
      const label = [updated.role, updated.shift].filter(Boolean).join(" - ") || updated.name;
      await notify
        .volunteerAssigned(updated.email, label, { volunteerId: updated.id })
        .catch(() => undefined);
    }
    res.json({ volunteer: updated });
  }),
);

/** Check a volunteer in: stamps checked_in_at + status 'checked_in'. */
router.post(
  "/:id/check-in",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ volunteer: await vol.checkInVolunteer(a, req.params.id) });
  }),
);

// ---- Per-volunteer task list ------------------------------------------------

/** List a volunteer's tasks (org-scoped). */
router.get(
  "/:id/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tasks: await vol.listVolunteerTasks(a, req.params.id) });
  }),
);

/** Add a task to a volunteer's checklist (org-scoped). */
router.post(
  "/:id/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    if (!body.label || typeof body.label !== "string") {
      return res.status(400).json({ error: "label required" });
    }
    res.status(201).json({ task: await vol.addVolunteerTask(a, req.params.id, body.label) });
  }),
);

/** Set a volunteer task's status (open / done) (org-scoped). */
router.patch(
  "/tasks/:taskId",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const status = body.status === "done" ? "done" : "open";
    res.json({ task: await vol.setVolunteerTaskStatus(a, req.params.taskId, status) });
  }),
);

// ---- Shift reminder (manual trigger, no background job) ----------------------

/**
 * Send a shift reminder to each active volunteer with a shift set (optionally
 * scoped to one fundraising event). Manual, deterministic - no scheduler.
 * notify.volunteerShiftReminder per recipient (best-effort).
 */
router.post(
  "/shift-reminders",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const eventId = typeof body.event === "string" ? body.event : null;
    const roster = await vol.listUpcomingShiftVolunteers(a, eventId);
    let sent = 0;
    for (const v of roster) {
      if (!v.email) continue;
      const label = v.shift || v.name;
      await notify
        .volunteerShiftReminder(v.email, label, { volunteerId: v.id })
        .catch(() => undefined);
      sent += 1;
    }
    res.json({ candidates: roster.length, sent });
  }),
);

export default router;
