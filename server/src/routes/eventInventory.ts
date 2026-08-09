/**
 * Event Inventory routes (live-ops phase, Part 17-20). Mount base:
 * /api/event-inventory -- distinct from the pre-existing supplier
 * warehouse catalog mounted at /api/inventory.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as inv from "../db/eventInventory.js";

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

router.get(
  "/event/:eventId/locations",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ locations: await inv.listLocations(a, req.params.eventId) });
  }),
);

router.post(
  "/event/:eventId/locations",
  h(async (req, res) => {
    const a = await actor(req);
    const { name, parent_id, floorplan_id, notes } = req.body ?? {};
    res.status(201).json({ location: await inv.createLocation(a, req.params.eventId, { name, parent_id, floorplan_id, notes }) });
  }),
);

router.get(
  "/event/:eventId/items",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ items: await inv.listInventoryItems(a, req.params.eventId) });
  }),
);

router.post(
  "/event/:eventId/items",
  h(async (req, res) => {
    const a = await actor(req);
    const { name, category, unit, expected_quantity, source_vendor_org_id, notes } = req.body ?? {};
    res.status(201).json({
      item: await inv.createInventoryItem(a, req.params.eventId, {
        name,
        category,
        unit,
        expected_quantity,
        source_vendor_org_id,
        notes,
      }),
    });
  }),
);

router.get(
  "/event/:eventId/alerts",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ alerts: await inv.listInventoryAlerts(a, req.params.eventId) });
  }),
);

router.post(
  "/event/:eventId/movements",
  h(async (req, res) => {
    const a = await actor(req);
    const { item_id, quantity, from_location_id, to_location_id, kind, reason } = req.body ?? {};
    res.status(201).json({
      movement: await inv.recordMovement(a, req.params.eventId, {
        item_id,
        quantity: Number(quantity),
        from_location_id,
        to_location_id,
        kind,
        reason,
      }),
    });
  }),
);

export default router;
