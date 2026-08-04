/**
 * Pure comparison for session revocation (server/src/auth.ts's resolve()).
 * Zero dependencies (not even node:crypto) so it can be unit tested in
 * isolation, matching passwordHash.ts / totp.ts.
 *
 * Was a session token issued before the revocation cutoff a user's row
 * carries (users.sessions_invalidated_before, set by db.ts's
 * invalidateSessions on a password reset)?
 *
 * Prefers `iamMs` (millisecond-precision issued-at, a custom claim --
 * server/src/lib/session.ts's signSession) when present: a direct
 * millisecond comparison against the cutoff, with no ambiguity.
 *
 * Falls back to the standard `iat` claim (whole-second resolution, floored
 * cutoff) only for a session token issued before `iam` existed. That
 * fallback has a real, documented limitation caught during live testing of
 * this feature: a login and a later revoking event landing in the SAME
 * wall-clock second are indistinguishable by `iat` alone, so a stolen
 * token from a heartbeat before the cutoff could slip through in that
 * narrow window. `iam` exists specifically to close that gap for every
 * token issued after this field was added; the `iat`-only path is legacy
 * compatibility, not the primary mechanism.
 *
 * Zero em dashes.
 */
export function sessionIsRevoked(
  token: { iatSeconds: number; iamMs?: number | null },
  cutoff: Date | null,
): boolean {
  if (!cutoff) return false;
  if (typeof token.iamMs === "number") {
    return token.iamMs < cutoff.getTime();
  }
  return token.iatSeconds < Math.floor(cutoff.getTime() / 1000);
}
