/**
 * Password hashing/verify tests. Imports ONLY the pure passwordHash module
 * (node:crypto only, no DB, no jose, no config).
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../server/src/lib/passwordHash.ts";

test("a hashed password verifies true for the right password", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
});

test("a hashed password verifies false for the wrong password", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("Tr0ub4dor&3", stored), false);
});

test("two hashes of the same password differ (random salt)", () => {
  const a = hashPassword("same-password");
  const b = hashPassword("same-password");
  assert.notEqual(a, b);
  // ...but both still verify against the original password.
  assert.equal(verifyPassword("same-password", a), true);
  assert.equal(verifyPassword("same-password", b), true);
});

test("stored envelope has the scrypt$salt$hash shape", () => {
  const stored = hashPassword("envelope-check");
  const parts = stored.split("$");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "scrypt");
  // 16-byte salt -> 32 hex chars; 64-byte hash -> 128 hex chars.
  assert.equal(parts[1].length, 32);
  assert.equal(parts[2].length, 128);
});

test("verify returns false for null, empty, or malformed envelopes", () => {
  assert.equal(verifyPassword("x", null), false);
  assert.equal(verifyPassword("x", undefined), false);
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "not-an-envelope"), false);
  assert.equal(verifyPassword("x", "scrypt$deadbeef"), false);
  assert.equal(verifyPassword("x", "bcrypt$aa$bb"), false);
  assert.equal(verifyPassword("x", "scrypt$$"), false);
});

test("verify is case- and whitespace-sensitive", () => {
  const stored = hashPassword("MixedCase Pass ");
  assert.equal(verifyPassword("MixedCase Pass ", stored), true);
  assert.equal(verifyPassword("mixedcase pass ", stored), false);
  assert.equal(verifyPassword("MixedCase Pass", stored), false);
});

test("empty-string password hashes and verifies consistently", () => {
  const stored = hashPassword("");
  assert.equal(verifyPassword("", stored), true);
  assert.equal(verifyPassword("x", stored), false);
});
