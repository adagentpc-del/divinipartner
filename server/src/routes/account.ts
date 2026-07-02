/**
 * Self-service account data rights (mounted at /api/account).
 *   GET  /account/export  -> downloadable JSON of the user's + org's data (GDPR/CPRA portability)
 *   POST /account/delete  -> erase the account (and org if sole member); GDPR/CPRA + Apple 5.1.1(v)
 *
 * Both require an authenticated user and act ONLY on the caller's own data.
 * Zero em dashes.
 */
import { Router, type Request, type Response } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { logAction } from "../lib/audit.js";

const router = Router();

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[account]", e);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    });

// ---- Export: download my data ---------------------------------------------
router.get(
  "/export",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const bundle = await db.exportMyData(auth.userId!);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const a = await db.getActor(auth.userId!, auth.email);
      await logAction(a, "account.data_exported", "user", auth.userId!, null, null, {});
    } catch { /* audit best-effort */ }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="divini-partners-data-${stamp}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(bundle, null, 2));
  }),
);

// ---- Delete my account -----------------------------------------------------
router.post(
  "/delete",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    let actorForLog;
    try { actorForLog = await db.getActor(auth.userId!, auth.email); } catch { /* ignore */ }
    const result = await db.deleteMyAccountCascade(auth.userId!);
    if (actorForLog) {
      try { await logAction(actorForLog, "account.deleted", "user", auth.userId!, null, result, {}); } catch { /* ignore */ }
    }
    res.json({ ok: true, ...result });
  }),
);

export default router;
