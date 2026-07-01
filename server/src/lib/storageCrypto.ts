/**
 * Optional envelope encryption for stored objects.
 *
 * When STORAGE_ENCRYPTION_KEY is set (base64 of exactly 32 bytes) the storage
 * layer encrypts object bytes with AES-256-GCM before they are written and
 * decrypts them on read. The on-disk / on-bucket layout is:
 *
 *   iv(12 bytes) | authTag(16 bytes) | ciphertext
 *
 * When the key is unset, bytes are stored and returned verbatim (the current
 * plaintext behavior). node:crypto only, no dependencies.
 *
 * Zero em dashes.
 */
import crypto from "node:crypto";
import { STORAGE_ENCRYPTION_KEY, storageEncryptionEnabled } from "../config.js";

const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16; // GCM auth tag length
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | null = null;

/**
 * Decode and validate the configured base64 key. Throws when encryption is
 * enabled but the key is malformed, so the failure is loud at first use rather
 * than producing unreadable objects silently.
 */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = Buffer.from(STORAGE_ENCRYPTION_KEY, "base64");
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `STORAGE_ENCRYPTION_KEY must be base64 of exactly ${KEY_BYTES} bytes (got ${raw.length} bytes after decoding).`,
    );
  }
  cachedKey = raw;
  return raw;
}

/** True when at-rest encryption is configured. */
export function encryptionEnabled(): boolean {
  return storageEncryptionEnabled();
}

/**
 * Encrypt plaintext bytes for storage. Returns iv | tag | ciphertext. When
 * encryption is disabled, returns the input unchanged.
 */
export function encryptBytes(plain: Buffer): Buffer {
  if (!storageEncryptionEnabled()) return plain;
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypt bytes produced by encryptBytes. When encryption is disabled, returns
 * the input unchanged (objects written before a key existed stay readable).
 */
export function decryptBytes(stored: Buffer): Buffer {
  if (!storageEncryptionEnabled()) return stored;
  if (stored.length < IV_BYTES + TAG_BYTES) {
    throw new Error("encrypted object is too short to contain iv and auth tag");
  }
  const key = loadKey();
  const iv = stored.subarray(0, IV_BYTES);
  const tag = stored.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = stored.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
