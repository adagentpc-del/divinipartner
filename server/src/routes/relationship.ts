/**
 * Intelligence Moat addendum - F5 Relationship Intelligence Graph routes.
 * Mount base: /relationship (the lead wires the mount in routes.ts).
 *
 *   GET  /graph?type=&id=   neighbors + insight strings for one entity node
 *   POST /rebuild           recompute the actor org's edges from existing data
 *
 * requireUser guard + getActor + the h() async wrapper, mirroring routes/events.ts.
 * Reads/writes are org-scoped inside the db layer (IDOR-safe).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getGraph, rebuildEdges } from "../db/relationship.js";
import type { EntityType } from "../lib/relationshipGraph.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const ENTITY_TYPES: EntityType[] = [
  "organization",
  "venue",
  "vendor",
  "sponsor",
  "planner",
  "agency",
  "brand",
  "client",
  "contact",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();
router.use(requireUser);

/** Reference data for the UI (selectable entity types). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ entityTypes: ENTITY_TYPES });
  }),
);

/** Neighbors + insights for one node. */
router.get(
  "/graph",
  h(async (req, res) => {
    const a = await getActor(req);
    const type = String(req.query.type ?? "").trim() as EntityType;
    const id = String(req.query.id ?? "").trim();
    if (!ENTITY_TYPES.includes(type)) {
      return res.status(400).json({ error: "valid type required" });
    }
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "valid id (uuid) required" });
    }
    res.json(await getGraph(a, type, id));
  }),
);

/** Recompute the actor org's edges from existing data. */
router.post(
  "/rebuild",
  h(async (req, res) => {
    const a = await getActor(req);
    const result = await rebuildEdges(a);
    res.json({ rebuilt: true, ...result });
  }),
);

export default router;
