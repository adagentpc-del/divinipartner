/**
 * Intelligence Moat - Feature 9: Approval Graph Engine routes.
 * Mount base: /api/approval-graph (wired by the lead in routes.ts).
 *
 * Endpoints:
 *   GET    /contacts                 list approval contacts (?venue=<id> narrows)
 *   POST   /contacts                 create an approval contact
 *   DELETE /contacts/:id             delete an approval contact
 *   POST   /requests                 submit an approval request for an event
 *   PATCH  /requests/:id             decide an approval request
 *   POST   /requests/escalate        escalate stalled approvals for an event
 *   GET    /requests/event/:eventId  list approvals for an event (board view)
 *   GET    /meta                     reference data for the UI (types/statuses)
 *
 * Auth + IDOR are enforced in server/src/db/approvals.ts (org / venue / event
 * scoped). Errors propagate to the central handler via the h() wrapper. Zero em
 * dashes. Server imports .js.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as approvals from "../db/approvals.js";
import { APPROVAL_TYPES } from "../lib/approvalGraph.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const APPROVAL_STATUSES = [
  "submitted",
  "pending",
  "approved",
  "rejected",
  "requires_revision",
] as const;

const router = Router();
router.use(requireUser);

/** Reference data for the UI (approval types + status columns). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ types: APPROVAL_TYPES, statuses: APPROVAL_STATUSES });
  }),
);

// ---- contacts ---------------------------------------------------------------

/** List approval contacts the actor manages. ?venue=<id> narrows to a venue. */
router.get(
  "/contacts",
  h(async (req, res) => {
    const a = await getActor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    res.json({ contacts: await approvals.listApprovalContacts(a, { venueId }) });
  }),
);

/** Create an approval contact. */
router.post(
  "/contacts",
  h(async (req, res) => {
    const a = await getActor(req);
    const { approval_type, name } = req.body ?? {};
    if (!approval_type || typeof approval_type !== "string") {
      return res.status(400).json({ error: "approval_type required" });
    }
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    const contact = await approvals.createApprovalContact(a, req.body);
    res.status(201).json({ contact });
  }),
);

/** Delete an approval contact. */
router.delete(
  "/contacts/:id",
  h(async (req, res) => {
    const a = await getActor(req);
    await approvals.deleteApprovalContact(a, req.params.id);
    res.status(204).end();
  }),
);

// ---- requests ---------------------------------------------------------------

/** Submit an approval request for an event. */
router.post(
  "/requests",
  h(async (req, res) => {
    const a = await getActor(req);
    const { event_id, approval_type } = req.body ?? {};
    if (!event_id || typeof event_id !== "string") {
      return res.status(400).json({ error: "event_id required" });
    }
    if (!approval_type || typeof approval_type !== "string") {
      return res.status(400).json({ error: "approval_type required" });
    }
    const request = await approvals.submitApproval(a, event_id, req.body);
    res.status(201).json({ request });
  }),
);

/** Escalate stalled approvals for an event. (Before /requests/:id.) */
router.post(
  "/requests/escalate",
  h(async (req, res) => {
    const a = await getActor(req);
    const { event_id } = req.body ?? {};
    if (!event_id || typeof event_id !== "string") {
      return res.status(400).json({ error: "event_id required" });
    }
    const thresholdDays =
      typeof req.body?.threshold_days === "number" ? req.body.threshold_days : undefined;
    const escalated = await approvals.escalateStalled(a, event_id, { thresholdDays });
    res.json({ escalated, count: escalated.length });
  }),
);

/** Decide an approval request (set status). */
router.patch(
  "/requests/:id",
  h(async (req, res) => {
    const a = await getActor(req);
    const { status } = req.body ?? {};
    if (!status || typeof status !== "string") {
      return res.status(400).json({ error: "status required" });
    }
    const request = await approvals.decideApproval(a, req.params.id, req.body);
    res.json({ request });
  }),
);

/** List approvals for an event (board visibility). */
router.get(
  "/requests/event/:eventId",
  h(async (req, res) => {
    const a = await getActor(req);
    res.json({ requests: await approvals.listEventApprovals(a, req.params.eventId) });
  }),
);

export default router;
