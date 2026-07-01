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

async function resolve(req: Request): Promise<AuthResult> {
  const claims = await verifySession(sessionToken(req));
  if (!claims || !claims.sub) return EMPTY_AUTH;
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

/** Guard: require an admin (ADMIN_ALLOWED_EMAILS). 403 otherwise. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!auth.isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
