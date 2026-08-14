/**
 * Restore a Postgres backup written by backup-db.ts. Destructive: the dump
 * was taken with `--clean --if-exists`, so replaying it DROPS and recreates
 * every object it contains in the TARGET database (the one DATABASE_URL
 * points at) before restoring data. Never run this against a database you
 * are not certain you want overwritten.
 *
 * Usage (from the server package, after build):
 *   node dist/scripts/restore-db.js latest --yes
 *   node dist/scripts/restore-db.js backups/db/divini_partners_2026-08-03T12-00-00-000Z.sql.gz --yes
 *
 * `latest` picks the newest entry from the manifest backup-db.ts maintains.
 * --yes is required to actually run (interactive confirmation otherwise) --
 * this keeps an accidental double-click/paste in a terminal from wiping a
 * database; it is deliberately NOT auto-confirmed even non-interactively,
 * since a misconfigured cron job pointed at this script would be the worst
 * possible way to discover that.
 *
 * TEST THIS. A backup procedure that has never been used to actually
 * restore is not a verified control -- see
 * AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md and
 * compliance/policies/incident-response-plan.md.
 *
 * Zero em dashes.
 */
import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline/promises";
import { DATABASE_URL, BACKUP_KEY_PREFIX } from "../config.js";
import { getObject, objectExists } from "../lib/objectStorage.js";

const MANIFEST_KEY = `${BACKUP_KEY_PREFIX}/manifest.json`;

async function resolveKey(arg: string): Promise<string> {
  if (arg !== "latest") return arg;
  if (!(await objectExists(MANIFEST_KEY))) {
    throw new Error(`No manifest found at ${MANIFEST_KEY}. Pass an explicit backup key instead of "latest".`);
  }
  const manifest = JSON.parse((await getObject(MANIFEST_KEY)).toString("utf8")) as {
    backups: { key: string; createdAt: string }[];
  };
  if (!manifest.backups?.length) throw new Error("Manifest exists but lists no backups.");
  const newest = [...manifest.backups].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]!;
  console.log(`[restore-db] "latest" resolved to ${newest.key} (created ${newest.createdAt})`);
  return newest.key;
}

async function confirm(key: string, autoYes: boolean): Promise<void> {
  if (autoYes) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This will DROP and restore every object in the database at DATABASE_URL from ${key}. ` +
      `Type "restore" to continue: `,
  );
  rl.close();
  if (answer.trim() !== "restore") {
    throw new Error("Not confirmed. Aborting without changes.");
  }
}

async function restoreInto(gzipped: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const psql = spawn("psql", [DATABASE_URL, "--set", "ON_ERROR_STOP=1"]);
    const gunzip = createGunzip();
    let stderr = "";

    psql.stderr.on("data", (d) => { stderr += d.toString(); });
    psql.on("error", (err) => reject(new Error(`could not start psql: ${err.message}`)));
    gunzip.on("error", (err) => reject(err));

    gunzip.pipe(psql.stdin);
    gunzip.end(gzipped);

    psql.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited with code ${code}: ${stderr.trim() || "no stderr output"}`));
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const autoYes = process.argv.includes("--yes");
  if (!arg) {
    console.error('Usage: node dist/scripts/restore-db.js <"latest" | backup key> [--yes]');
    process.exitCode = 2;
    return;
  }
  if (!DATABASE_URL) {
    console.error("[restore-db] DATABASE_URL is not set.");
    process.exitCode = 2;
    return;
  }

  const key = await resolveKey(arg);
  await confirm(key, autoYes);

  console.log(`[restore-db] downloading ${key} ...`);
  const gzipped = await getObject(key);
  console.log(`[restore-db] restoring ${gzipped.length} compressed bytes into the target database ...`);
  await restoreInto(gzipped);
  console.log("[restore-db] done.");
}

main().catch((err) => {
  console.error("[restore-db] FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
