/**
 * Per-event vendor compliance gate routes (front-half completion pass,
 * 2026-08-10). Mount base: /api/event-vendor-compliance -- distinct from the
 * pre-existing /api/vendor-compliance (global per-vendor doc status) and
 * /api/vendor-requirements (quote-intake field schema).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as compliance from "../db/eventVendorCompliance.js";

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

router.get("/meta", (_req, res) => {
  res.json({
    requirementKeys: compliance.COMPLIANCE_REQUIREMENT_KEYS,
    policies: compliance.COMPLIANCE_POLICIES,
  });
});

router.get(
  "/event/:eventId/gates",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ gates: await compliance.listComplianceGates(a, req.params.eventId) });
  }),
);

router.post(
  "/event/:eventId/gates",
  h(async (req, res) => {
    const a = await actor(req);
    const { requirement_key, policy } = req.body ?? {};
    const gate = await compliance.setComplianceGate(a, req.params.eventId, requirement_key, policy ?? null);
    res.status(201).json({ gate });
  }),
);

export default router;
