import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { getAdminAllowedEmails, isAdminAllowlistEnforced } from "../lib/securityConfig";

/**
 * Gate a router behind authenticated Clerk users.
 *
 * If ADMIN_ALLOWED_EMAILS is set, the user's primary email must appear in the
 * allowlist (case-insensitive). When the allowlist is unset, any signed-in
 * user is admitted — this is reported as a warning in /api/security/readiness
 * so operators know they're in open-beta posture.
 *
 * Usage:
 *   router.use("/admin-only-thing", requireAdmin(), handler);
 *   // or as a router-level guard:
 *   router.use(requireAdmin());
 */
export function requireAdmin(): RequestHandler {
  return async function requireAdminMw(req: Request, res: Response, next: NextFunction) {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdminAllowlistEnforced()) {
      // In production, refuse to fail-open. Any signed-up Clerk user could
      // otherwise reach the admin surface. In non-prod we admit signed-in
      // users so dev work isn't blocked, and the readiness page surfaces
      // this as a warning either way.
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({
          error: "Admin allowlist is not configured. Set ADMIN_ALLOWED_EMAILS to grant access.",
        });
        return;
      }
      next();
      return;
    }

    try {
      const user = await clerkClient.users.getUser(auth.userId);
      const emails = (user.emailAddresses || []).map((e) => (e.emailAddress || "").toLowerCase());
      const allowed = getAdminAllowedEmails();
      const ok = emails.some((e) => allowed.includes(e));
      if (!ok) {
        res.status(403).json({ error: "This account is not on the admin allowlist." });
        return;
      }
      next();
    } catch (err) {
      req.log?.error({ err }, "requireAdmin: Clerk lookup failed");
      res.status(500).json({ error: "Failed to verify admin access" });
    }
  };
}
