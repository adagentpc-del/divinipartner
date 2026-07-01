/**
 * Phase 3 - Message routes. Mount base: /api/messages.
 *
 * List threads for an event, list messages (visibility-filtered), post a
 * message, and mark a message read.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as messages from "../db/messages.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";
import { detectLeakageLanguage } from "../lib/leakage.js";

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

/** Reference data (thread types + visibility scopes). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ threadTypes: messages.THREAD_TYPES, visibility: messages.VISIBILITY_SCOPES });
  }),
);

/** Threads on an event (grouped, with counts). */
router.get(
  "/event/:eventId/threads",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ threads: await messages.listThreads(a, req.params.eventId) });
  }),
);

/** Messages on an event (visibility-filtered for the viewer). */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ messages: await messages.listEventMessages(a, req.params.eventId) });
  }),
);

/** Post a message to an event thread. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { event_id, body } = req.body ?? {};
    if (!event_id) return res.status(400).json({ error: "event_id required" });
    if (!body || !String(body).trim()) return res.status(400).json({ error: "body required" });
    const msg = await messages.postMessage(a, req.body);
    // Notify the other event participants (owner side + attached vendors),
    // excluding the sender. Best-effort.
    const to = recipients.excluding(
      await recipients.eventParticipantEmails(event_id).catch(() => [] as string[]),
      a.user.email,
    );
    const name = (await recipients.eventName(event_id).catch(() => null)) ?? "your event";
    if (to.length) await notify.messagePosted(to, name, { messageId: msg.id }).catch(() => undefined);
    // Blueprint 21.4: auto-scan message text for payment-leakage language so the
    // SPA can surface the Payment Protection notice. Non-blocking.
    const leakage = detectLeakageLanguage(String(body));
    res.status(201).json({ message: msg, leakage });
  }),
);

/** Mark a message read. */
router.post(
  "/:id/read",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ message: await messages.markRead(a, req.params.id) });
  }),
);

export default router;
