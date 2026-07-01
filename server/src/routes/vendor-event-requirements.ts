/**
 * Venue Intelligence Addendum (Phase 6) - vendor event requirement routes.
 * Mount base: /api/vendor-event-requirements.
 *
 * A vendor sets, per event, whether they need the guest list / headcount /
 * deposit and their deposit / payment gating config. The client managing the
 * event page reads the list to see which vendors are subscribed to guest-list
 * updates. All routes require a signed-in user; authorization (event access +
 * own-vendor ownership) is enforced in
 * server/src/db/vendor-event-requirements.ts.
 *
 * Mounted in server/src/routes.ts (owned by integration):
 *   import vendorEventRequirements from "./routes/vendor-event-requirements.js";
 *   router.use("/vendor-event-requirements", vendorEventRequirements);
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as reqs from "../db/vendor-event-requirements.js";

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

/** List every requirement row on an event (read = event access). */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirements: await reqs.listByEvent(a, req.params.eventId) });
  }),
);

/** List the actor's OWN vendor requirement rows on an event. */
router.get(
  "/event/:eventId/mine",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirements: await reqs.listMineByEvent(a, req.params.eventId) });
  }),
);

/**
 * Set / update the vendor's requirements for an event. Body:
 * { event_id, vendor_id, needs_guest_list?, needs_headcount?, needs_deposit?,
 *   deposit_gate?, payment_gate?, notes? }. Upserts on (event_id, vendor_id).
 */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const eventId = body.event_id;
    const vendorId = body.vendor_id;
    if (!eventId || typeof eventId !== "string") {
      return res.status(400).json({ error: "event_id required" });
    }
    if (!vendorId || typeof vendorId !== "string") {
      return res.status(400).json({ error: "vendor_id required" });
    }
    res.status(201).json({
      requirement: await reqs.upsert(a, eventId, vendorId, body),
    });
  }),
);

/** Patch a requirement row by id (own-vendor only). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ requirement: await reqs.update(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a requirement row by id (own-vendor only). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await reqs.remove(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
