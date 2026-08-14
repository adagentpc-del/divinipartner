/**
 * Automated Postgres backup: pg_dump -> gzip -> object storage (local disk or
 * S3-compatible, whichever STORAGE_PROVIDER already uses for uploaded
 * documents), envelope-encrypted at rest when STORAGE_ENCRYPTION_KEY is set
 * -- reusing lib/objectStorage.ts rather than reinventing storage/encryption
 * for backups specifically.
 *
 * Closes the "no automated, scheduled backups" gap from the 2026-08-03
 * SOC 2 / ISO 27001 audit (AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md, task
 * T12): the only backup procedure that existed before this script was a
 * manual, one-off `pg_dump` run immediately before a schema migration.
 *
 * After a successful backup, prunes backups older than BACKUP_RETENTION_DAYS
 * (default 14) using a small JSON manifest this script maintains itself
 * (backups/db/manifest.json) -- neither object-storage provider exposes a
 * list operation, so the manifest is the source of truth for "what backups
 * exist and when were they made," not a directory/bucket listing.
 *
 * Usage (from the server package, after build):
 *   node dist/scripts/backup-db.js
 * Intended to run on a schedule (cron / systemd timer) on the deploy host --
 * see AI_PROJECT_OS/23_DEPLOYMENT.md for the exact crontab line. Exits
 * non-zero on any failure so cron's mail-on-error / a monitoring wrapper
 * notices.
 *
 * Requires the `pg_dump` binary on PATH (part of the postgresql-client
 * package; already required by the manual backup procedure this replaces).
 * Buffers the full (gzip-compressed) dump in memory before upload -- fine at
 * this app's current data volume; revisit with a streaming upload if the
 * database grows large enough for that to matter.
 *
 * Zero em dashes.
 */
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { DATABASE_URL, BACKUP_RETENTION_DAYS, BACKUP_KEY_PREFIX } from "../config.js";
import { putObject, getObject, deleteObject, objectExists } from "../lib/objectStorage.js";

type ManifestEntry = { key: string; createdAt: string; sizeBytes: number };
type Manifest = { backups: ManifestEntry[] };

const MANIFEST_KEY = `${BACKUP_KEY_PREFIX}/manifest.json`;

function timestampForFilename(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

/**
 * Run pg_dump against DATABASE_URL and gzip its output, buffered in memory.
 *
 * Correctness note: when pg_dump fails immediately (e.g. the DB is
 * unreachable), its stdout closes with zero bytes written -- which makes the
 * gzip stream emit its own 'end' event almost immediately too, BEFORE
 * pg_dump's 'close' event (carrying the real exit code) fires. Resolving on
 * gzip's 'end' alone would silently "succeed" with an empty backup on every
 * such failure. This function instead waits for BOTH signals and treats
 * pg_dump's exit code as authoritative, so a connection failure is reported
 * as the loud error it is rather than a 20-byte empty gzip nobody notices
 * until the day it is needed for a restore.
 */
async function dumpAndCompress(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // --clean --if-exists makes the dump self-contained for restore: it
    // includes DROP ... IF EXISTS before each CREATE, so replaying it against
    // an existing (possibly non-empty) database is safe and idempotent
    // rather than erroring on "relation already exists."
    const dump = spawn("pg_dump", [DATABASE_URL, "--clean", "--if-exists", "--no-owner", "--no-privileges"]);
    const gzip = createGzip();
    const chunks: Buffer[] = [];
    let stderr = "";
    let dumpExitCode: number | null = null;
    let gzipEnded = false;
    let settled = false;

    function maybeFinish() {
      if (settled || dumpExitCode === null || !gzipEnded) return;
      settled = true;
      if (dumpExitCode !== 0) {
        reject(new Error(`pg_dump exited with code ${dumpExitCode}: ${stderr.trim() || "no stderr output"}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    }
    function failOnce(err: Error) {
      if (settled) return;
      settled = true;
      reject(err);
    }

    dump.stderr.on("data", (d) => { stderr += d.toString(); });
    dump.on("error", (err) => failOnce(new Error(`could not start pg_dump: ${err.message}`)));

    gzip.on("data", (chunk) => chunks.push(chunk as Buffer));
    gzip.on("error", failOnce);
    gzip.on("end", () => { gzipEnded = true; maybeFinish(); });

    dump.stdout.pipe(gzip);

    dump.on("close", (code) => { dumpExitCode = code ?? 1; maybeFinish(); });
  });
}

async function loadManifest(): Promise<Manifest> {
  try {
    if (!(await objectExists(MANIFEST_KEY))) return { backups: [] };
    const raw = await getObject(MANIFEST_KEY);
    const parsed = JSON.parse(raw.toString("utf8"));
    return Array.isArray(parsed?.backups) ? parsed : { backups: [] };
  } catch (e) {
    console.warn(`[backup-db] could not read existing manifest, starting fresh: ${(e as Error).message}`);
    return { backups: [] };
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await putObject(MANIFEST_KEY, Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
}

/** Delete manifest entries (and their objects) older than BACKUP_RETENTION_DAYS. */
async function pruneOldBackups(manifest: Manifest): Promise<{ kept: ManifestEntry[]; prunedCount: number }> {
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const kept: ManifestEntry[] = [];
  let prunedCount = 0;
  for (const entry of manifest.backups) {
    if (new Date(entry.createdAt).getTime() < cutoff) {
      try {
        await deleteObject(entry.key);
        prunedCount++;
      } catch (e) {
        console.warn(`[backup-db] could not delete old backup ${entry.key}: ${(e as Error).message}`);
        kept.push(entry); // keep it in the manifest so we retry next run
      }
    } else {
      kept.push(entry);
    }
  }
  return { kept, prunedCount };
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("[backup-db] DATABASE_URL is not set. Nothing to back up.");
    process.exitCode = 2;
    return;
  }

  const startedAt = Date.now();
  console.log(`[backup-db] starting backup at ${new Date(startedAt).toISOString()}`);

  const gzipped = await dumpAndCompress();
  // Defense in depth beyond the exit-code race fixed above: a real dump of
  // this app's schema (~130 tables) compresses to many KB at minimum, even
  // against a freshly-migrated, empty-of-data database. A suspiciously tiny
  // "successful" dump is more likely a silent failure than a real backup --
  // refuse to upload it (and, critically, refuse to let a later prune step
  // delete good older backups on the strength of this one).
  if (gzipped.length < 1024) {
    throw new Error(
      `pg_dump reported success but produced only ${gzipped.length} compressed bytes -- refusing to trust this as a real backup.`,
    );
  }
  const now = new Date();
  const key = `${BACKUP_KEY_PREFIX}/divini_partners_${timestampForFilename(now)}.sql.gz`;
  await putObject(key, gzipped, "application/gzip");
  console.log(`[backup-db] wrote ${key} (${gzipped.length} bytes, ${(Date.now() - startedAt) / 1000}s)`);

  const manifest = await loadManifest();
  manifest.backups.push({ key, createdAt: now.toISOString(), sizeBytes: gzipped.length });

  const { kept, prunedCount } = await pruneOldBackups(manifest);
  await saveManifest({ backups: kept });
  console.log(
    `[backup-db] retention: kept ${kept.length} backup(s) within ${BACKUP_RETENTION_DAYS} day(s), pruned ${prunedCount}`,
  );
  console.log("[backup-db] done.");
}

main().catch((err) => {
  console.error("[backup-db] FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
