/**
 * Outbound webhook endpoint management (moat roadmap Phase 2a). Mount base:
 * /api/webhooks. The endpoint's `secret` (used to verify delivery
 * signatures) is returned on creation and on the list/get responses -- the
 * receiver needs it on file to verify X-Divini-Signature, so unlike an API
 * key it is not a show-once secret.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
} from "../db/webhookEndpoints.js";
import { WEBHOOK_EVENT_TYPES } from "../lib/webhooks.js";
import { logAction } from "../lib/audit.js";

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
  "/meta",
  h(async (_req, res) => {
    res.json({ eventTypes: WEBHOOK_EVENT_TYPES });
  }),
);

router.get(
  "/",
  h(async (req, res) => {
    res.json({ endpoints: await listWebhookEndpoints(await actor(req)) });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { url, event_types } = req.body ?? {};
    const endpoint = await createWebhookEndpoint(a, { url, eventTypes: event_types });
    await logAction(a, "webhook_endpoint.created", "webhook_endpoint", endpoint.id, null, { url: endpoint.url }, {});
    res.status(201).json({ endpoint });
  }),
);

router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const { url, enabled, event_types } = req.body ?? {};
    const endpoint = await updateWebhookEndpoint(a, req.params.id, { url, enabled, eventTypes: event_types });
    await logAction(a, "webhook_endpoint.updated", "webhook_endpoint", endpoint.id, null, endpoint, {});
    res.json({ endpoint });
  }),
);

router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await deleteWebhookEndpoint(a, req.params.id);
    await logAction(a, "webhook_endpoint.deleted", "webhook_endpoint", req.params.id, null, null, {});
    res.status(204).end();
  }),
);

router.get(
  "/:id/deliveries",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ deliveries: await listWebhookDeliveries(a, req.params.id) });
  }),
);

export default router;
