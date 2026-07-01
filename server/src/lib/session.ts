/**
 * Native auth primitives: scrypt password hashing + HS256 session JWT (jose).
 *
 * SECURITY:
 *   - Passwords are hashed with node:crypto scrypt. The stored envelope is
 *     `scrypt$<saltHex>$<hashHex>` (16-byte random salt, scryptSync keylen 64).
 *     Verification is constant-time via crypto.timingSafeEqual. Plaintext
 *     passwords are NEVER stored or logged.
 *   - Sessions are signed JWTs (HS256) using process.env.SESSION_SECRET. In
 *     production we fail closed and THROW when the secret is unset, empty, or the
 *     dev fallback (forgeable sessions otherwise). Outside production we fall back
 *     to a clearly-marked dev secret and console.warn so the lead sets
 *     SESSION_SECRET in .env.local before deploy.
 *
 * Zero em dashes.
 */
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { IS_PROD } from "../config.js";
import { hashPassword as hashPasswordPure, verifyPassword as verifyPasswordPure } from "./passwordHash.js";

/** Hash a plaintext password into the `scrypt$<saltHex>$<hashHex>` envelope.
 *  Delegates to the pure, dependency-free implementation in passwordHash.ts. */
export function hashPassword(plain: string): string {
  return hashPasswordPure(plain);
}

/** Constant-time verify a plaintext password against a stored envelope.
 *  Delegates to the pure, dependency-free implementation in passwordHash.ts. */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  return verifyPasswordPure(plain, stored);
}

// ---- Session JWT -----------------------------------------------------------

const DEV_SECRET = "dev-only-insecure-session-secret-change-me";
let _warned = false;

/**
 * Resolve the session signing secret.
 *
 * Fail closed in production: if SESSION_SECRET is unset, empty, or still the
 * dev fallback, sessions would be forgeable, so we THROW to abort startup. In
 * dev/sandbox (IS_PROD false) we keep the dev fallback and warn once.
 */
function sessionSecret(): Uint8Array {
  const raw = (process.env.SESSION_SECRET || "").trim();
  const missing = !raw || raw === DEV_SECRET;
  if (missing) {
    if (IS_PROD) {
      throw new Error(
        "[auth] SESSION_SECRET is unset, empty, or the insecure dev fallback in production. " +
          "Sessions would be forgeable. Set a strong unique SESSION_SECRET in .env.local before deploy.",
      );
    }
    if (!_warned) {
      _warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] SESSION_SECRET is not set. Using an INSECURE dev secret. " +
          "Set SESSION_SECRET in .env.local before deploy.",
      );
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(raw);
}

export interface SessionClaims extends JWTPayload {
  sub: string;
  email: string | null;
}

/** Name of the session cookie. */
export const SESSION_COOKIE = "divini_session";

/** 30-day session lifetime, in seconds. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Sign a 30-day HS256 session token { sub, email }. */
export async function signSession(userId: string, email: string | null): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret());
}

/** Verify a session token. Returns claims or null on any failure. */
export async function verifySession(token: string | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      ...payload,
      sub: String(payload.sub),
      email: (payload.email as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

/** Random hex token for email verification / password reset. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
