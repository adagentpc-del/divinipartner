/**
 * File storage facade. Delegates to the pluggable object storage layer
 * (lib/objectStorage.ts) so the provider (local disk or S3-compatible) and
 * optional at-rest encryption are chosen purely by env, with no change at call
 * sites.
 *
 * DEFAULT BEHAVIOR IS UNCHANGED: with no new env set, STORAGE_PROVIDER is
 * "local" and STORAGE_ENCRYPTION_KEY is unset, so files land on local disk under
 *   <FILE_STORAGE_DIR>/<companyId>/<packageId|buildingId|misc>/<ts>-<name>
 * exactly as before, as plaintext, and downloads use the same short-lived
 * HMAC-signed token (`signDownloadUrl(path)` ->
 * `/api/documents/download?path=..&exp=..&sig=..`).
 *
 * The synchronous writeFile/readPath/fileExists helpers below are preserved for
 * existing call sites and only work in local mode. For provider-agnostic access
 * (works under S3 and with encryption) use the async helpers getObjectBytes /
 * putObjectBytes / streamObject, or import directly from lib/objectStorage.ts.
 *
 * Zero em dashes.
 */
import { Readable } from "node:stream";
import fs from "node:fs";
import { FILE_STORAGE_DIR, STORAGE_PROVIDER, s3Enabled } from "./config.js";
import {
  safeRelKey,
  signDownloadUrl as osSignDownloadUrl,
  verifyDownloadUrl as osVerifyDownloadUrl,
  getObject,
  putObject,
  deleteObject as osDeleteObject,
  objectExists,
  provider,
} from "./lib/objectStorage.js";

/** True when reads/writes hit the local disk (sync helpers are valid). */
function isLocal(): boolean {
  return !(STORAGE_PROVIDER === "s3" && s3Enabled());
}

function localAbsFor(relKey: string): string {
  // Mirror objectStorage's safeRelKey + FILE_STORAGE_DIR join.
  return `${FILE_STORAGE_DIR}/${safeRelKey(relKey)}`;
}

/** Build the storage key for a new upload (same shape as the old Supabase path). */
export function buildStorageKey(opts: {
  companyId: string;
  packageId?: string | null;
  buildingId?: string | null;
  fileName: string;
}): string {
  const bucket = opts.packageId ?? opts.buildingId ?? "misc";
  const safeName = opts.fileName.replace(/[^\w.\- ]+/g, "_");
  return `${opts.companyId}/${bucket}/${Date.now()}-${safeName}`;
}

// --- synchronous local helpers (preserved for existing call sites) ----------

/**
 * Write file bytes under the given key. Synchronous; valid for the local
 * provider only. For S3 or when encryption is enabled, use putObjectBytes.
 * In local mode this routes through the object storage local provider so
 * encryption-at-rest still applies transparently.
 */
export function writeFile(relKey: string, data: Buffer): void {
  if (!isLocal()) {
    throw new Error(
      "writeFile is a local-only synchronous helper; STORAGE_PROVIDER=s3 is active. Use putObjectBytes(relKey, data) instead.",
    );
  }
  // local provider putObject is synchronous internally; encryption applied there.
  void provider().putObject(relKey, data);
}

/** Whether an object exists. Synchronous; local provider only. */
export function fileExists(relKey: string): boolean {
  if (!isLocal()) {
    throw new Error(
      "fileExists is a local-only synchronous helper; STORAGE_PROVIDER=s3 is active. Use objectExists(relKey) instead.",
    );
  }
  try {
    return fs.statSync(localAbsFor(relKey)).isFile();
  } catch {
    return false;
  }
}

/**
 * Absolute on-disk path for a stored object. Local provider only. NOTE: when
 * encryption is enabled the file on disk is ciphertext, so streaming this path
 * directly returns encrypted bytes; use streamObject for decrypted streaming.
 */
export function readPath(relKey: string): string {
  if (!isLocal()) {
    throw new Error(
      "readPath is a local-only helper; STORAGE_PROVIDER=s3 is active. Use getObjectBytes(relKey) instead.",
    );
  }
  return localAbsFor(relKey);
}

// --- provider-agnostic async helpers ----------------------------------------

/** Read object bytes (decrypted), works under any provider. */
export function getObjectBytes(relKey: string): Promise<Buffer> {
  return getObject(relKey);
}

/** Write object bytes (encrypted at rest when configured), any provider. */
export function putObjectBytes(relKey: string, data: Buffer, contentType?: string): Promise<void> {
  return putObject(relKey, data, contentType);
}

/** Delete an object, any provider. */
export function deleteObject(relKey: string): Promise<void> {
  return osDeleteObject(relKey);
}

/** Whether an object exists, any provider. */
export function objectExistsAsync(relKey: string): Promise<boolean> {
  return objectExists(relKey);
}

/**
 * Stream decrypted object bytes to a writable (e.g. an Express response).
 * Provider-agnostic and encryption-aware: this is the correct way to serve a
 * download under any STORAGE_PROVIDER / encryption setting.
 */
export async function streamObject(relKey: string, dest: NodeJS.WritableStream): Promise<void> {
  const bytes = await getObject(relKey);
  await new Promise<void>((resolve, reject) => {
    Readable.from(bytes).pipe(dest).on("finish", resolve).on("error", reject);
  });
}

// --- short-lived signed download URLs (unchanged contract) ------------------

export const signDownloadUrl = osSignDownloadUrl;
export const verifyDownloadUrl = osVerifyDownloadUrl;
