/**
 * Admin-triggered email test endpoint.
 *
 * POST /  body: { to?: string }
 * Runs the SAME suite as the CLI (server/src/test-emails.ts) against `to`, or
 * the admin's own verified email when `to` is omitted, and returns the JSON
 * results. Real delivery requires EMAIL_PROVIDER + EMAIL_API_KEY (and
 * POSTAL_API_URL for postal); otherwise every type reports skipped (logged).
 *
 * This router is NOT mounted here on purpose. The parent should mount it in
 * routes.ts with:
 *
 *   import testEmailRouter from "./routes/test-email.js";
 *   router.use("/admin/test-email", testEmailRouter);
 *
 * so it is served at POST /api/admin/test-email.
 *
 * ZERO em dashes in this file (hard rule). ESM .js imports.
 */
import { Router, type Request, type Response } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import { emailEnabled } from "../lib/email.js";
import { runEmailSuite } from "../test-emails.js";

const router = Router();

router.post("/", requireAdmin, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { to?: unknown };
  const auth = getAuth(req);
  const requested = typeof body.to === "string" ? body.to.trim() : "";
  const to = requested || auth.email || "";

  if (!to) {
    res.status(400).json({ error: "no target: provide { to } or sign in with an email claim" });
    return;
  }

  try {
    const results = await runEmailSuite(to);
    const sent = results.filter((r) => r.outcome === "ok").length;
    const skipped = results.filter((r) => r.outcome === "skipped").length;
    const errors = results.filter((r) => r.outcome === "error").length;
    res.json({
      target: to,
      emailEnabled: emailEnabled(),
      totals: { types: results.length, sent, skipped, errors },
      results,
      note:
        "Password reset and login are handled by Authentik (OIDC), not Divini email, so they are not in this suite. The claim outreach sample is the only type that carries open/click tracking in production.",
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
