/**
 * Session-revocation comparison tests. Imports ONLY the pure
 * sessionRevocation module (zero dependencies, matches passwordHash.ts /
 * totp.ts).
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionIsRevoked } from "../server/src/lib/sessionRevocation.ts";

test("no cutoff ever set -> never revoked", () => {
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_000 }, null), false);
});

// ---- iam (millisecond-precision) path: the primary mechanism -------------

test("iam: token issued before the cutoff -> revoked", () => {
  const cutoff = new Date(1_700_000_000_500); // .500
  assert.equal(sessionIsRevoked({ iatSeconds: 0, iamMs: 1_700_000_000_000 }, cutoff), true);
});

test("iam: token issued after the cutoff -> not revoked", () => {
  const cutoff = new Date(1_700_000_000_500);
  assert.equal(sessionIsRevoked({ iatSeconds: 0, iamMs: 1_700_000_000_900 }, cutoff), false);
});

test("iam: the real bug this closes -- old and new tokens land in the SAME wall-clock second, distinguished correctly by millisecond precision", () => {
  // Reproduces exactly what live testing caught: a login and a password
  // reset both happen within the same second (fast scripted requests, or a
  // fast attacker/victim sequence). With only whole-second `iat`, the old
  // and new tokens would be indistinguishable. `iam` resolves it exactly.
  const oldLoginIamMs = 1_700_000_000_100; // logged in at .100
  const cutoffMs = 1_700_000_000_500; // reset happened at .500, same second
  const newSessionIamMs = 1_700_000_000_600; // new session issued right after, .600
  const cutoff = new Date(cutoffMs);
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_000, iamMs: oldLoginIamMs }, cutoff), true, "old token must be revoked");
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_000, iamMs: newSessionIamMs }, cutoff), false, "new token must NOT be revoked");
});

test("iam: exactly equal to the cutoff is not revoked (strictly-before semantics)", () => {
  const cutoff = new Date(1_700_000_000_500);
  assert.equal(sessionIsRevoked({ iatSeconds: 0, iamMs: 1_700_000_000_500 }, cutoff), false);
});

// ---- iat-only fallback path: legacy tokens issued before iam existed -----

test("iat fallback: token issued well before the cutoff -> revoked", () => {
  const cutoff = new Date(1_700_000_100 * 1000);
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_000 }, cutoff), true);
});

test("iat fallback: token issued well after the cutoff -> not revoked", () => {
  const cutoff = new Date(1_700_000_000 * 1000);
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_100 }, cutoff), false);
});

test("iat fallback: token issued in the same wall-clock second as a sub-second-precise cutoff -> not revoked (the flooring behavior, documented as imprecise vs iam)", () => {
  const cutoff = new Date(1_700_000_000 * 1000 + 734);
  assert.equal(sessionIsRevoked({ iatSeconds: 1_700_000_000 }, cutoff), false);
});

test("iat fallback: token issued the second before a sub-second-precise cutoff IS revoked", () => {
  const cutoff = new Date(1_700_000_000 * 1000 + 1);
  assert.equal(sessionIsRevoked({ iatSeconds: 1_699_999_999 }, cutoff), true);
});
