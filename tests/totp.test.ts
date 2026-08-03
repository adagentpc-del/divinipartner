/**
 * TOTP tests. Imports ONLY the pure totp module (node:crypto only, no DB).
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  buildOtpauthUri,
  generateBackupCodes,
} from "../server/src/lib/totp.ts";

test("base32 round-trips arbitrary bytes", () => {
  const buf = Buffer.from([0, 1, 2, 3, 4, 5, 255, 254, 128, 17]);
  const encoded = base32Encode(buf);
  assert.equal(base32Decode(encoded).equals(buf), true);
});

test("base32Decode tolerates lowercase and stray whitespace", () => {
  const buf = Buffer.from("hello world");
  const encoded = base32Encode(buf);
  const messy = encoded.toLowerCase().split("").join(" ");
  assert.equal(base32Decode(messy).equals(buf), true);
});

test("generateTotpSecret produces a valid base32 string of the expected length", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  // 20 raw bytes -> 32 base32 characters (no padding, 160/5 = 32).
  assert.equal(secret.length, 32);
});

test("verifyTotp accepts the code generateTotp produces for the same instant", () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const code = generateTotp(secret, now);
  assert.equal(verifyTotp(secret, code, now), true);
});

test("verifyTotp accepts a code from one step earlier or later (clock drift tolerance)", () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const codeBefore = generateTotp(secret, now - 30_000);
  const codeAfter = generateTotp(secret, now + 30_000);
  assert.equal(verifyTotp(secret, codeBefore, now), true);
  assert.equal(verifyTotp(secret, codeAfter, now), true);
});

test("verifyTotp rejects a code two steps away", () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const codeFarBefore = generateTotp(secret, now - 90_000);
  assert.equal(verifyTotp(secret, codeFarBefore, now), false);
});

test("verifyTotp rejects a code generated from a different secret", () => {
  const secretA = generateTotpSecret();
  const secretB = generateTotpSecret();
  const now = Date.now();
  const codeForA = generateTotp(secretA, now);
  assert.equal(verifyTotp(secretB, codeForA, now), false);
});

test("verifyTotp rejects malformed input without throwing", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, "not-a-code"), false);
  assert.equal(verifyTotp(secret, "12345"), false);
  assert.equal(verifyTotp(secret, ""), false);
});

test("buildOtpauthUri embeds the secret, issuer, and account email", () => {
  const uri = buildOtpauthUri({ secret: "JBSWY3DPEHPK3PXP", accountEmail: "a@b.com" });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=Divini/);
  assert.match(uri, /a%40b\.com/);
});

test("generateBackupCodes produces the requested count of unique, formatted codes", () => {
  const codes = generateBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
});
