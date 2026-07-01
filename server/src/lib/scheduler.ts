/**
 * Background scheduler that drives claim-engine automation on its own.
 *
 * Two jobs run on the cadence configured by WORKER_INTERVAL_MINUTES:
 *   1. runDueOutreach     send the next due claim outreach email per profile.
 *   2. runMarketExpansion open the next planned geographic market when ready.
 *
 * All cadence, suppression, and 6-send-cap enforcement lives inside the email
 * send() path (lib/claim-emails). This module only decides WHICH profiles are
 * due (lib/db listProfilesDueForOutreach) and fires the existing send/expansion
 * primitives. Every send is wrapped so one failure cannot stop the batch.
 *
 * ZERO em dashes in this file (hard rule).
 */
import * as claim from "../db/claim.js";
import * as emails from "./claim-emails.js";
import * as discovery from "./discovery.js";
import { WORKER_INTERVAL_MINUTES } from "../config.js";

export type OutreachSummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type ExpansionSummary = {
  opened: string | null;
};

export type SchedulerSummary = {
  outreach: OutreachSummary & { error?: string };
  expansion: ExpansionSummary & { error?: string };
  ranAt: string;
};

/**
 * Send every due claim outreach email. Pulls the due set from the DB, then calls
 * the existing email send() per row. send() re-checks suppression, cadence, and
 * the 6-send cap internally, returning { sent, reason }; we only tally.
 */
export async function runDueOutreach(limit = 200): Promise<OutreachSummary> {
  const rows = await claim.listProfilesDueForOutreach(emails.MAX_SENDS, limit);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.email) {
      skipped++;
      continue;
    }
    const p: emails.Personalization = {
      businessName: row.business_name ?? "your business",
      city: row.city,
      category: row.category,
      slug: row.slug ?? "",
      email: row.email,
    };
    try {
      const result = await emails.send(row.profile_id, p);
      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      failed++;
      // eslint-disable-next-line no-console
      console.error(
        `[scheduler] outreach send failed for profile ${row.profile_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { attempted: rows.length, sent, skipped, failed };
}

/**
 * Advance the geographic rollout by one market when the planner says it is time.
 * Mirrors POST /admin/markets/advance: open the next rollout market as an active
 * market with a 100-profile cap and the next priority slot.
 */
export async function runMarketExpansion(): Promise<ExpansionSummary> {
  const markets = await claim.listMarkets();
  const plan = discovery.planExpansion(markets);
  if ((plan.action === "open_first" || plan.action === "advance") && plan.next) {
    const market = await claim.upsertMarket({
      marketName: plan.next.marketName,
      state: plan.next.state,
      region: plan.next.region,
      status: "active",
      maxProfiles: 100,
      priority: markets.length + 1,
    });
    return { opened: market.market_name ?? plan.next.marketName };
  }
  return { opened: null };
}

/**
 * Run both jobs once. Each part is wrapped so a failure in one does not abort the
 * other, and a structured summary is always returned.
 */
export async function runScheduler(): Promise<SchedulerSummary> {
  const ranAt = new Date().toISOString();

  let outreach: OutreachSummary & { error?: string };
  try {
    outreach = await runDueOutreach();
  } catch (err) {
    outreach = {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let expansion: ExpansionSummary & { error?: string };
  try {
    expansion = await runMarketExpansion();
  } catch (err) {
    expansion = {
      opened: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { outreach, expansion, ranAt };
}

let _timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the in-process scheduler loop. With WORKER_INTERVAL_MINUTES > 0 this runs
 * runScheduler() once immediately, then on that interval. With 0 (the default) it
 * is a no-op; an external cron drives worker.js instead. Safe to call once at
 * startup; repeat calls do nothing while a loop is already running.
 */
export function startSchedulerLoop(): void {
  if (_timer) return;
  if (!(WORKER_INTERVAL_MINUTES > 0)) return;

  const intervalMs = WORKER_INTERVAL_MINUTES * 60_000;
  const tick = () => {
    runScheduler()
      .then((summary) => {
        // eslint-disable-next-line no-console
        console.log(`[scheduler] tick ${JSON.stringify(summary)}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(
          `[scheduler] tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  };

  // eslint-disable-next-line no-console
  console.log(`[scheduler] starting in-process loop every ${WORKER_INTERVAL_MINUTES} minute(s)`);
  _timer = setInterval(tick, intervalMs);
  tick();
}
