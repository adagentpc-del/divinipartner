/**
 * Native session auth middleware (replaces Authentik OIDC).
 *
 * The SPA authenticates against /api/auth (email + password, email verification)
 * and receives a signed HS256 session JWT, delivered BOTH as an httpOnly cookie
 * (`divini_session`) and in the JSON response so the SPA can send it as
 * `Authorization: Bearer <token>`. This module:
 *   1. Reads the session from the cookie (preferred) or the bearer header.
 *   2. Verifies it (jose, HS256, SESSION_SECRET) via lib/session.ts.
 *   3. Exposes `getAuth(req)` returning { userId, email, isAdmin } where isAdmin
 *      = email in ADMIN_ALLOWED_EMAILS. SAME shape as before so all other routes
 *      and the requireUser / requireAdmin guards are untouched.
 *
 * Authentik / OIDC verification is fully retired. No JWKS, issuer, or audience
 * checks remain.
 *
 * Zero em dashes.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAdminAllowedEmails } from "./config.js";
import { verifySession, SESSION_COOKIE } from "./lib/session.js";
import { getMfaUser } from "./db/mfa.js";
import { sessionsInvalidatedBefore } from "./db.js";
import { sessionIsRevoked } from "./lib/sessionRevocation.js";
import { API_KEY_PREFIX, resolveApiKey } from "./db/apiKeys.js";

export interface AuthResult {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  claims: { sub: string; email: string | null } | null;
}

const EMPTY_AUTH: AuthResult = { userId: null, email: null, isAdmin: false, claims: null };
const AUTH_KEY = Symbol.for("divini.partners.session.auth");

interface AuthedRequest extends Request {
  [AUTH_KEY]?: AuthResult;
}

function bearer(req: Request): string | null {
  const header = (req.headers.authorization as string | undefined) ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

/** Parse a single cookie value out of the raw Cookie header (no dependency). */
function cookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      const v = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(v);
      } catch {
        return v || null;
      }
    }
  }
  return null;
}

/** Token resolution: cookie preferred, then Authorization: Bearer. */
function sessionToken(req: Request): string | null {
  return cookie(req, SESSION_COOKIE) ?? bearer(req);
}

function computeIsAdmin(email: string | null): boolean {
  if (!email) return false;
  return getAdminAllowedEmails().includes(email.toLowerCase());
}

/**
 * API key auth (moat roadmap Phase 2a): a Bearer token prefixed with
 * API_KEY_PREFIX is an API key, not a session JWT -- checked before touching
 * the cookie/JWT path at all, since a real API client sends only the header,
 * never the session cookie. It resolves to the CREATING user's id/email, so
 * every downstream `db.getActor(userId, email)` call (identical to session
 * auth) grants the exact same org-scoped access that user already has --
 * there is no separate API-key permission system.
 */
async function resolve(req: Request): Promise<AuthResult> {
  const bearerToken = bearer(req);
  if (bearerToken && bearerToken.startsWith(API_KEY_PREFIX)) {
    const resolved = await resolveApiKey(bearerToken);
    if (!resolved) return EMPTY_AUTH;
    // A key is scoped to the org it was issued for. If the creating user has
    // since switched their active org (or been removed from the issuing org),
    // the key must not silently follow them into a different org's data --
    // reject it instead of letting db.getActor() resolve to whatever org the
    // user is currently pointed at.
    if (resolved.organizationId !== resolved.currentOrganizationId) return EMPTY_AUTH;
    return {
      userId: resolved.userId,
      email: resolved.email,
      isAdmin: computeIsAdmin(resolved.email),
      claims: { sub: resolved.userId, email: resolved.email },
    };
  }
  const claims = await verifySession(sessionToken(req));
  if (!claims || !claims.sub) return EMPTY_AUTH;
  // Session revocation (SOC 2 / ISO 27001 audit, 2026-08-03): a session JWT
  // is otherwise valid for its full 30-day lifetime regardless of anything
  // that happens to the account afterward. Password reset now stamps
  // sessions_invalidated_before = now() (db.ts's invalidateSessions), so any
  // token issued before that cutoff is treated as logged out here, even
  // though its signature still verifies -- one extra indexed lookup per
  // authenticated request, the standard cost of real revocation for a
  // stateless JWT scheme (there is no free way to revoke a signed token
  // short of checking a mutable store on every use).
  if (typeof claims.iat === "number") {
    const cutoff = await sessionsInvalidatedBefore(claims.sub);
    if (sessionIsRevoked({ iatSeconds: claims.iat, iamMs: claims.iam }, cutoff)) {
      return EMPTY_AUTH;
    }
  }
  const email = claims.email ? claims.email.toLowerCase() : null;
  return {
    userId: claims.sub,
    email,
    isAdmin: computeIsAdmin(email),
    claims: { sub: claims.sub, email },
  };
}

/** Express middleware: verify the session once, stash on req. Always next(). */
export function authMiddleware(): RequestHandler {
  return async function sessionAuthMw(req: AuthedRequest, _res: Response, next: NextFunction) {
    try {
      req[AUTH_KEY] = await resolve(req);
    } catch {
      req[AUTH_KEY] = EMPTY_AUTH;
    }
    next();
  };
}

export function getAuth(req: Request): AuthResult {
  return (req as AuthedRequest)[AUTH_KEY] ?? EMPTY_AUTH;
}

/** Guard: require a signed-in user. 401 otherwise. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/**
 * Guard: require an admin (ADMIN_ALLOWED_EMAILS). 403 otherwise.
 *
 * Also enforces MFA for admin access (SOC 2 / ISO 27001 audit finding,
 * 2026-08-03: this is the platform's single highest-privilege access point,
 * so it is the one place MFA is REQUIRED rather than merely offered). An
 * admin-allowlisted account that has not enrolled TOTP yet can still log in
 * normally -- blocking login entirely would risk locking an admin out with
 * no path to enroll -- but is refused every actual admin action here with a
 * distinct `mfa_required_for_admin` error until they enroll at
 * Profile -> Account -> Two-factor authentication.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!auth.isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const user = await getMfaUser(auth.userId);
    if (!user?.totp_enabled) {
      // `error` is the human-readable message on purpose: src/lib/api.ts's
      // ApiError surfaces `body.error` as `.message`, and most pages just do
      // `catch (e) { setErr(e.message) }` with no special-casing -- putting
      // the friendly text there means every admin page reads well without
      // each one needing its own handler. `code` is for pages (AdminConsole)
      // that want to render something richer, like a direct enroll link.
      res.status(403).json({
        error: "Two-factor authentication is required for admin access. Enroll at Profile -> Account.",
        code: "mfa_required_for_admin",
      });
      return;
    }
  } catch (e) {
    next(e);
    return;
  }
  next();
}
