/**
 * Phase 8 - Support / Help Desk routes. Mount base: /api/support.
 * requireUser for everyone; admin-only actions are enforced in the db layer.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as support from "../db/support.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      statuses: support.TICKET_STATUSES,
      categories: support.TICKET_CATEGORIES,
      urgencies: support.TICKET_URGENCIES,
    });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({
      tickets: await support.listTickets(a, isAdmin, {
        status: (req.query.status as string) || undefined,
      }),
    });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const { a } = await actor(req);
    const { description } = req.body ?? {};
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description required" });
    }
    const t = await support.createTicket(a, req.body);
    // Confirmation to the submitter. Best-effort: never block the request.
    if (a.user.email) {
      await notify.supportReceived(a.user.email, t.id.slice(0, 8)).catch(() => undefined);
    }
    res.status(201).json({ ticket: t });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    res.json({ ticket: await support.getTicket(a, isAdmin, req.params.id) });
  }),
);

router.post(
  "/:id/status",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const { status, resolution } = req.body ?? {};
    if (!support.isTicketStatus(status)) return res.status(400).json({ error: "invalid status" });
    const { prev, next } = await support.setStatus(a, isAdmin, req.params.id, status, resolution);
    await logAction(a, "ticket.status_changed", "support_ticket", req.params.id, prev, next, {
      summary: `ticket -> ${status}`,
    });
    res.json({ ticket: next });
  }),
);

router.post(
  "/:id/assign",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    const { admin_user_id } = req.body ?? {};
    if (!admin_user_id) return res.status(400).json({ error: "admin_user_id required" });
    const { prev, next } = await support.assignTicket(a, isAdmin, req.params.id, admin_user_id);
    await logAction(a, "ticket.assigned", "support_ticket", req.params.id, prev, next);
    res.json({ ticket: next });
  }),
);

export default router;
