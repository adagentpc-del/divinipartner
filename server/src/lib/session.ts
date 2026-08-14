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
  /** Millisecond-precision issued-at. See signSession for why this exists
   *  alongside the standard (whole-second) `iat`. Absent on any session
   *  token signed before this field was added. */
  iam?: number;
}

/** Name of the session cookie. */
export const SESSION_COOKIE = "divini_session";

/** 30-day session lifetime, in seconds. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Sign a 30-day HS256 session token { sub, email }. */
export async function signSession(userId: string, email: string | null): Promise<string> {
  return new SignJWT({
    email,
    // Millisecond-precision issued-at, IN ADDITION TO the standard `iat`
    // claim `.setIssuedAt()` sets below. `iat` per the JWT spec is
    // whole-second resolution, which is too coarse for session revocation:
    // a login and a later password reset that land in the SAME wall-clock
    // second (verified during live testing of this feature -- fast
    // scripted requests, but a fast attacker/victim sequence is not
    // impossible either) would be indistinguishable by `iat` alone,
    // meaning an old, stolen token issued a heartbeat before a reset could
    // slip through as if it were the freshly-issued replacement. `iam`
    // (issued-at-milliseconds) resolves that ambiguity exactly -- see
    // auth.ts's resolve() and lib/sessionRevocation.ts.
    iam: Date.now(),
  })
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
    // A real session token never carries a `typ` claim -- only the MFA
    // challenge token (below) does. Reject it here explicitly so a leaked
    // 5-minute challenge token can never be replayed as full API access;
    // without this check it would otherwise pass (it has a valid signature
    // and a `sub`) and grant the bearer everything a real session grants.
    if (payload.typ) return null;
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

// ---- MFA challenge token -----------------------------------------------
// A short-lived (5-minute), distinctly-typed JWT issued by /auth/login when
// the account has MFA enabled, in place of a real session token. It proves
// "this caller already presented a correct password for this user" without
// granting any actual access -- /auth/mfa-verify is the ONLY endpoint that
// accepts it, and it explicitly rejects anything without the mfa_challenge
// type claim, so a leaked challenge token cannot be replayed as a session
// even though it is signed with the same SESSION_SECRET.

const MFA_CHALLENGE_TYPE = "mfa_challenge";

export interface MfaChallengeClaims extends JWTPayload {
  sub: string;
  typ: typeof MFA_CHALLENGE_TYPE;
}

/** Sign a 5-minute MFA challenge token for a user who passed the password check. */
export async function signMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ typ: MFA_CHALLENGE_TYPE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(sessionSecret());
}

/** Verify an MFA challenge token. Returns the user id, or null on any failure
 *  (including a token that is a real session token, not a challenge). */
export async function verifyMfaChallenge(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    if (payload.typ !== MFA_CHALLENGE_TYPE) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}
