/**
 * API key management (moat roadmap Phase 2a). Mount base: /api/api-keys.
 * Session-authenticated only (an API key cannot mint another API key -- the
 * plaintext value is shown once at creation and never again).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../db/apiKeys.js";
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
  "/",
  h(async (req, res) => {
    res.json({ keys: await listApiKeys(await actor(req)) });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    const { key, row } = await createApiKey(a, name);
    await logAction(a, "api_key.created", "api_key", row.id, null, { name: row.name }, {});
    // key is returned ONLY on this response; it is never recoverable again.
    res.status(201).json({ key, apiKey: row });
  }),
);

router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await revokeApiKey(a, req.params.id);
    await logAction(a, "api_key.revoked", "api_key", row.id, null, { name: row.name }, {});
    res.json({ apiKey: row });
  }),
);

export default router;
