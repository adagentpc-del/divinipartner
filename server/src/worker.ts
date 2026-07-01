/**
 * Standalone worker CLI entry point for the claim-engine scheduler.
 *
 * Runs one full scheduler pass (due outreach + market expansion), prints a JSON
 * summary, closes the connection pool, and exits. This lets an external system
 * cron drive automation with:  node server/dist/worker.js
 *
 * ZERO em dashes in this file (hard rule).
 */
import { runScheduler } from "./lib/scheduler.js";
import { pool } from "./pool.js";

async function main(): Promise<void> {
  const summary = await runScheduler();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(`[worker] run failed: ${err instanceof Error ? err.message : String(err)}`);
  try {
    await pool.end();
  } catch {
    // ignore pool teardown errors on a failing exit
  }
  process.exit(1);
});
