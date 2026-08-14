/**
 * Divini Partners - CSRF protection (double-submit cookie pattern).
 *
 * The session (server/src/lib/session.ts) is delivered BOTH as an httpOnly
 * cookie (divini_session, SameSite=Lax) and as a Bearer token the SPA also
 * sends on every request. SameSite=Lax already blocks most cross-site
 * POST/PUT/PATCH/DELETE forgeries in modern browsers, but relying on
 * SameSite alone is explicitly discouraged (OWASP CSRF cheat sheet: defense
 * in depth, not a single control) -- older browsers ignore it entirely, and
 * a state-changing GET route would still be exposed to top-level-navigation
 * forgery. This adds a real second control: a synchronizer-style
 * double-submit token.
 *
 * Pattern: alongside the httpOnly session cookie, issue a SECOND, readable
 * (non-httpOnly) cookie holding a random token. The SPA reads that cookie
 * value and echoes it back as an X-CSRF-Token header on every mutating
 * request. A cross-site attacker can trick a browser into ATTACHING the
 * session cookie automatically, but cannot READ it (browsers enforce
 * same-origin on cookie access) to also set the matching header -- so a
 * forged request fails the token comparison even if the ambient cookie made
 * it through.
 *
 * ENFORCEMENT SCOPE: only when the request carries the session cookie. A
 * request authenticated purely via Authorization: Bearer (no cookie at all
 * -- a mobile client, a service integration, or a browser session that never
 * went through the SPA's cookie-issuing login flow) has no ambient
 * credential for an attacker to ride on, so CSRF does not apply and the
 * check is skipped. This also means every unauthenticated public/webhook
 * route (which never carries the session cookie) is automatically exempt --
 * no per-route allowlist needed.
 *
 * No new npm dependency: cookies are parsed by hand (mirrors auth.ts's
 * cookie() helper), and the token comparison uses node:crypto
 * timingSafeEqual to avoid a timing side-channel.
 *
 * Zero em dashes.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { IS_PROD } from "../config.js";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session.js";

/** Name of the readable (non-httpOnly) CSRF token cookie. */
export const CSRF_COOKIE = "divini_csrf";

/** Header the SPA must echo the token back on for mutating requests. */
export const CSRF_HEADER = "x-csrf-token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Parse a single cookie value out of the raw Cookie header (no dependency). */
function readCookie(req: Request, name: string): string | null {
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

/** Random hex CSRF token. Readable by the SPA (NOT httpOnly, unlike the session cookie). */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Issue (or refresh) the CSRF cookie. Call this everywhere the session
 * cookie is set (login, register-verify, password reset) so the two are
 * always issued together.
 */
export function issueCsrfCookie(res: Response): string {
  const token = generateToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // the SPA must be able to read this one
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
    path: "/",
  });
  return token;
}

/** Clear the CSRF cookie (call alongside clearing the session cookie on logout). */
export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure: IS_PROD, sameSite: "lax", path: "/" });
}

/** Constant-time string comparison (equal length required first, cheaply). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware: on a mutating request that carries the session
 * cookie, require a matching X-CSRF-Token header. Never blocks GET/HEAD/
 * OPTIONS, and never blocks a request with no session cookie (Bearer-only
 * or unauthenticated public/webhook traffic).
 */
export function csrfProtection(): RequestHandler {
  return function csrfProtectionMw(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const sessionCookie = readCookie(req, SESSION_COOKIE);
    if (!sessionCookie) return next(); // no ambient credential, nothing to forge

    const csrfCookie = readCookie(req, CSRF_COOKIE);
    const headerToken = (req.headers[CSRF_HEADER] as string | undefined) ?? "";

    if (!csrfCookie || !headerToken || !safeEqual(csrfCookie, headerToken)) {
      res.status(403).json({
        error: "csrf_failed",
        message: "Missing or invalid CSRF token. Refresh the page and try again.",
      });
      return;
    }
    next();
  };
}

export default csrfProtection;
