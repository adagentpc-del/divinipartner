/**
 * bankCrypto - SECURITY-CRITICAL helper for partner banking secrets.
 *
 * Encryption: AES-256-GCM via node:crypto (NO new npm dependency).
 *   - The key comes from env PAYOUT_ENC_KEY: 32 bytes supplied as 64 hex chars
 *     or as base64. Any other length is rejected (we never silently truncate or
 *     pad a key).
 *   - Each secret gets a fresh random 12-byte IV. The stored token is
 *     `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` so it is self-describing and can
 *     be rotated/decoded without external state.
 *
 * Exports:
 *   - isEncryptionConfigured(): boolean   - whether PAYOUT_ENC_KEY is usable.
 *   - encryptSecret(plain): string        - returns a token (throws if no key).
 *   - decryptSecret(token): string        - SUPER-ADMIN-ONLY path; returns plain.
 *   - mask(account): string               - '****' + last4 for display.
 *   - last4(account): string              - the trailing 4 digits.
 *
 * Hard rules:
 *   - A decrypted full account/routing number is NEVER returned to any client
 *     response. decryptSecret exists only for an explicit, audited, super-admin
 *     server-side path (e.g. preparing an ACH file) and is not wired to any
 *     client-facing endpoint in this module.
 *   - When PAYOUT_ENC_KEY is unset, callers must store ONLY account_last4 and
 *     flag enc_configured=false. encryptSecret throws so plaintext is never
 *     persisted by accident.
 *
 * ZERO em dashes in this file (hard rule).
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard nonce length
const TOKEN_PREFIX = "v1";

/** Parse PAYOUT_ENC_KEY (64 hex chars or base64) into a 32-byte Buffer, or null. */
function loadKey(): Buffer | null {
  const raw = (process.env.PAYOUT_ENC_KEY || "").trim();
  if (!raw) return null;
  let key: Buffer | null = null;
  // hex (64 chars, hex alphabet)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    // try base64 / base64url
    try {
      const b = Buffer.from(raw, "base64");
      if (b.length === 32) key = b;
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) return null;
  return key;
}

/** True when a valid 32-byte PAYOUT_ENC_KEY is configured. */
export function isEncryptionConfigured(): boolean {
  return loadKey() !== null;
}

/**
 * Encrypt a plaintext secret (routing or account number) into a self-describing
 * token. Throws when no key is configured so plaintext is never persisted.
 */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  if (!key) {
    throw new Error("PAYOUT_ENC_KEY not configured: refusing to encrypt banking secret");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a token back to plaintext. SUPER-ADMIN-ONLY server path. Throws on a
 * malformed token, a missing key, or a failed authentication tag.
 */
export function decryptSecret(token: string): string {
  const key = loadKey();
  if (!key) {
    throw new Error("PAYOUT_ENC_KEY not configured: cannot decrypt banking secret");
  }
  const parts = String(token || "").split(":");
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) {
    throw new Error("malformed banking token");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** The trailing 4 digits of an account number (digits only). */
export function last4(account: string): string {
  const digits = String(account || "").replace(/\D+/g, "");
  return digits.slice(-4);
}

/** Masked display form: '****' + last4. Safe to show to any viewer. */
export function mask(account: string): string {
  const tail = last4(account);
  return tail ? `****${tail}` : "****";
}
