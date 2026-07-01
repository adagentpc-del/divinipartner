/**
 * Pure scrypt password hashing + verification. Dependency-free except for
 * node:crypto (no DB, no config, no jose), so it can be unit tested in
 * isolation. lib/session.ts re-exports these as its hashPassword / verifyPassword
 * so there is a single implementation.
 *
 * Stored envelope: `scrypt$<saltHex>$<hashHex>` with a 16-byte random salt and
 * scryptSync keylen 64. Verification is constant-time via timingSafeEqual.
 * Plaintext passwords are NEVER stored or logged.
 *
 * Zero em dashes.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash a plaintext password into the `scrypt$<saltHex>$<hashHex>` envelope. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time verify a plaintext password against a stored envelope. */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const saltHex = parts[1]!;
  const hashHex = parts[2]!;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
