/**
 * Dependency-free TOTP (RFC 6238, over HOTP RFC 4226), HMAC-SHA1/6-digit/30s
 * step -- the same parameters every mainstream authenticator app (Google
 * Authenticator, Authy, 1Password, Apple Passwords) assumes by default, so no
 * algorithm/digits/period negotiation is needed in the enrollment URI.
 *
 * Only node:crypto is used (createHmac). Base32 encode/decode is hand-rolled
 * (RFC 4648) since node has no built-in base32 codec and authenticator apps
 * expect the secret in base32, not base64/hex.
 *
 * Zero em dashes.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** Encode raw bytes as an unpadded base32 string (RFC 4648), uppercase. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode a base32 string (whitespace/padding/case tolerant) back to bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new random TOTP secret (20 bytes / 160 bits), base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 HOTP: HMAC-SHA1(secret, counter) -> dynamically-truncated 6-digit code. */
function hotp(secretBytes: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer; JS numbers are safe up to 2^53,
  // far beyond any realistic Unix-time-derived counter value.
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = createHmac("sha1", secretBytes).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const code = (binCode % 10 ** DIGITS).toString().padStart(DIGITS, "0");
  return code;
}

/** The current 6-digit TOTP code for a base32 secret. */
export function generateTotp(base32Secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Verify a user-entered code against a base32 secret, tolerating clock drift
 * by checking one step before/after the current one (a 90-second window
 * total) -- standard practice for TOTP verification.
 */
export function verifyTotp(base32Secret: string, code: string, at: number = Date.now()): boolean {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBytes = base32Decode(base32Secret);
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    const candidate = hotp(secretBytes, counter + drift);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app scans/imports to enroll. */
export function buildOtpauthUri(opts: {
  secret: string;
  accountEmail: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? "Divini Partners";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(opts.accountEmail)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Generate N random backup codes (10 by default), formatted like XXXX-XXXX. */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}
