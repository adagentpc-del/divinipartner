/**
 * Pluggable object storage with optional encryption at rest.
 *
 * Two providers, selected by STORAGE_PROVIDER:
 *   - "local" (default): local-disk storage rooted at FILE_STORAGE_DIR. This is
 *     the exact behavior the app has always had. With no env set, objects are
 *     stored as plaintext on disk, byte for byte identical to before.
 *   - "s3": any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2,
 *     MinIO) via signed REST requests over global fetch (see s3sigv4.ts). No SDK.
 *
 * When STORAGE_ENCRYPTION_KEY is set, object bytes are envelope-encrypted with
 * AES-256-GCM (see storageCrypto.ts) before being written and decrypted on read,
 * for both providers.
 *
 * Download URLs keep working exactly as before: signDownloadUrl/verifyDownloadUrl
 * produce the same short-lived HMAC-signed /api/documents/download links, and the
 * download route streams the decrypted bytes regardless of provider.
 *
 * Zero em dashes, dependency free (node:crypto, node:fs, node:path, fetch).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  FILE_STORAGE_DIR,
  DOWNLOAD_URL_SECRET,
  BASE_PATH,
  STORAGE_PROVIDER,
  s3Config,
  s3Enabled,
} from "../config.js";
import { encryptBytes, decryptBytes } from "./storageCrypto.js";
import { signS3Request } from "./s3sigv4.js";

const SIGNED_TTL_SECONDS = 3600;

// --- key safety -------------------------------------------------------------

/** Reject path traversal; keep the relative key inside the storage root. */
export function safeRelKey(relKey: string): string {
  const normalized = path.normalize(relKey).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("invalid storage path");
  }
  return normalized;
}

function localAbsFor(relKey: string): string {
  return path.join(FILE_STORAGE_DIR, safeRelKey(relKey));
}

// --- provider abstraction ---------------------------------------------------

export interface ObjectStorageProvider {
  putObject(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Local-disk provider. Mirrors the original storage.ts behavior exactly. */
const localProvider: ObjectStorageProvider = {
  async putObject(key, bytes) {
    const abs = localAbsFor(key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, encryptBytes(bytes));
  },
  async getObject(key) {
    const raw = fs.readFileSync(localAbsFor(key));
    return decryptBytes(raw);
  },
  async deleteObject(key) {
    try {
      fs.unlinkSync(localAbsFor(key));
    } catch {
      /* already gone */
    }
  },
  async exists(key) {
    try {
      return fs.statSync(localAbsFor(key)).isFile();
    } catch {
      return false;
    }
  },
};

/** S3-compatible provider via SigV4 signed REST over global fetch. */
const s3Provider: ObjectStorageProvider = {
  async putObject(key, bytes, contentType) {
    const cfg = s3Config();
    const body = encryptBytes(bytes);
    const signed = signS3Request({
      cfg,
      method: "PUT",
      key: safeRelKey(key),
      payload: body,
      contentType: contentType || "application/octet-stream",
    });
    const resp = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: new Uint8Array(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`s3 putObject failed (${resp.status}): ${detail.slice(0, 300)}`);
    }
  },
  async getObject(key) {
    const cfg = s3Config();
    const signed = signS3Request({ cfg, method: "GET", key: safeRelKey(key) });
    const resp = await fetch(signed.url, { method: signed.method, headers: signed.headers });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`s3 getObject failed (${resp.status}): ${detail.slice(0, 300)}`);
    }
    const raw = Buffer.from(await resp.arrayBuffer());
    return decryptBytes(raw);
  },
  async deleteObject(key) {
    const cfg = s3Config();
    const signed = signS3Request({ cfg, method: "DELETE", key: safeRelKey(key) });
    const resp = await fetch(signed.url, { method: signed.method, headers: signed.headers });
    // S3 returns 204 on delete; 404 means already absent. Both are fine.
    if (!resp.ok && resp.status !== 404) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`s3 deleteObject failed (${resp.status}): ${detail.slice(0, 300)}`);
    }
  },
  async exists(key) {
    const cfg = s3Config();
    const signed = signS3Request({ cfg, method: "HEAD", key: safeRelKey(key) });
    const resp = await fetch(signed.url, { method: signed.method, headers: signed.headers });
    return resp.ok;
  },
};

/** The active provider, selected once from env. */
export function provider(): ObjectStorageProvider {
  if (STORAGE_PROVIDER === "s3" && s3Enabled()) return s3Provider;
  return localProvider;
}

// --- canonical async API ----------------------------------------------------

export function putObject(key: string, bytes: Buffer, contentType?: string): Promise<void> {
  return provider().putObject(key, bytes, contentType);
}

export function getObject(key: string): Promise<Buffer> {
  return provider().getObject(key);
}

export function deleteObject(key: string): Promise<void> {
  return provider().deleteObject(key);
}

export function objectExists(key: string): Promise<boolean> {
  return provider().exists(key);
}

// --- short-lived signed download URLs (unchanged contract) ------------------

function sign(key: string, exp: number): string {
  return crypto.createHmac("sha256", DOWNLOAD_URL_SECRET).update(`${key}|${exp}`).digest("hex");
}

/** Equivalent of the old Supabase createSignedUrl(path, 3600). Relative URL. */
export function signDownloadUrl(relKey: string, ttlSeconds = SIGNED_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(relKey, exp);
  const qs = new URLSearchParams({ path: relKey, exp: String(exp), sig });
  return `${BASE_PATH}/api/documents/download?${qs.toString()}`;
}

/** Verify a signed download request. Returns the path when valid, else null. */
export function verifyDownloadUrl(relKey: string, exp: string, sig: string): string | null {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return null;
  const expected = sign(relKey, expNum);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return safeRelKey(relKey);
}
