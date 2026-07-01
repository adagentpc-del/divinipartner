/**
 * Phase 6 - Floorplans + Seating Chart routes. Mount base: /api/seating.
 *
 * Floorplan upload references + interactive seating charts (tables, zones,
 * guest assignments) stored as jsonb layout. Read needs event access, mutation
 * needs event ownership (enforced in server/src/db/seating.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as seating from "../db/seating.js";

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

/** Reference data (zone types + table shapes). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ zone_types: seating.ZONE_TYPES, table_shapes: seating.TABLE_SHAPES });
  }),
);

// ---- Floorplans ------------------------------------------------------------
router.get(
  "/floorplans/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ floorplans: await seating.listFloorplans(a, req.params.eventId) });
  }),
);

router.post(
  "/floorplans/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ floorplan: await seating.addFloorplan(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.patch(
  "/floorplans/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ floorplan: await seating.updateFloorplan(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/floorplans/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await seating.deleteFloorplan(a, req.params.id);
    res.status(204).end();
  }),
);

// ---- Seating charts --------------------------------------------------------
router.get(
  "/charts/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ charts: await seating.listSeatingCharts(a, req.params.eventId) });
  }),
);

router.get(
  "/charts/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ chart: await seating.getSeatingChart(a, req.params.id) });
  }),
);

router.post(
  "/charts/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ chart: await seating.createSeatingChart(a, req.params.eventId, req.body ?? {}) });
  }),
);

router.patch(
  "/charts/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ chart: await seating.updateSeatingChart(a, req.params.id, req.body ?? {}) });
  }),
);

router.delete(
  "/charts/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await seating.deleteSeatingChart(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
