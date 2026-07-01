/**
 * Nonprofit post-event follow-up routes. Mount base: /api/followups.
 *
 * Generate, list, and advance the post-event follow-up workflow for a
 * fundraising event (thank-you, donor receipts, sponsor recap, monthly giving
 * invite, next-event invite, volunteer thanks, board report, fundraising
 * summary). Advancing a task to sent fires the relevant notification
 * (postEventFollowupDue / donorThankYou / monthlyGivingInvite). All triggers are
 * manual - there is no background job. Every route is org-scoped + IDOR-safe via
 * the donor repo (server/src/db/donor.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as donor from "../db/donor.js";
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

/** List follow-up tasks for a fundraising event (org-scoped). */
router.get(
  "/:fundraisingEventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tasks: await donor.listFollowupTasks(a, req.params.fundraisingEventId) });
  }),
);

/**
 * Generate the post-event follow-up workflow for a fundraising event. Idempotent
 * (only fills missing task kinds). Fires postEventFollowupDue to the org.
 */
router.post(
  "/:fundraisingEventId/generate",
  h(async (req, res) => {
    const a = await actor(req);
    const tasks = await donor.generateFollowupWorkflow(a, req.params.fundraisingEventId);
    const orgTo = a.user.email ?? a.org?.name ?? "nonprofit";
    void notify.postEventFollowupDue(orgTo, req.params.fundraisingEventId, {
      fundraisingEventId: req.params.fundraisingEventId,
      orgName: a.org?.name ?? null,
      taskCount: tasks.length,
    });
    res.status(201).json({ tasks });
  }),
);

/**
 * Advance a follow-up task to a new status. When advanced to sent, fires the
 * notification that matches the task kind (donorThankYou for thank_you,
 * monthlyGivingInvite for monthly_giving_invite, otherwise postEventFollowupDue).
 */
router.patch(
  "/task/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const status = String((req.body ?? {}).status ?? "");
    const task = await donor.advanceFollowupTask(a, req.params.id, status);
    if (task.status === "sent") {
      const to = task.target ?? a.user.email ?? a.org?.name ?? "nonprofit";
      const orgName = a.org?.name ?? "our organization";
      if (task.kind === "thank_you") {
        void notify.donorThankYou(to, orgName, { taskId: task.id });
      } else if (task.kind === "monthly_giving_invite") {
        void notify.monthlyGivingInvite(to, orgName, { taskId: task.id });
      } else {
        void notify.postEventFollowupDue(to, orgName, { taskId: task.id, kind: task.kind });
      }
    }
    res.json({ task });
  }),
);

export default router;
