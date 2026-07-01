/**
 * Admin route to trigger the claim-engine scheduler on demand.
 *
 *   POST /run   (requireAdmin)   run one scheduler pass and return the summary
 *
 * The parent mounts this router (it is NOT mounted here). startSchedulerLoop()
 * from lib/scheduler runs the same pass automatically when WORKER_INTERVAL_MINUTES
 * is set; this endpoint lets an admin fire it manually.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin } from "../auth.js";
import { runScheduler } from "../lib/scheduler.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.post(
  "/run",
  requireAdmin,
  h(async (_req, res) => {
    const summary = await runScheduler();
    res.json({ summary });
  }),
);

export default router;
