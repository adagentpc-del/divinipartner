/**
 * Divini AI COO V2 - Event Risk rollup (AI-COO-V2-ROADMAP.md section 3).
 *
 * `rollupEventRisk(perEventScans)` is PURE: no DB work, no network, no AI. It
 * takes the per-event war-room scans the repo produced by calling the existing
 * server/src/db/warroom.runScan (which itself runs the deterministic
 * lib/eventWarRoom.scanEvent), and rolls them up into a single portfolio-level
 * risk picture for an executive:
 *
 *   { portfolioRiskScore 0-100, topRiskyEvents[], criticalCount, warningCount }
 *
 * The per-event scanner already classifies every alert as critical | warning |
 * info and tracks an open|snoozed|resolved disposition. This rollup ONLY
 * consumes those alert arrays; it does not re-derive any alert math (that stays
 * in lib/eventWarRoom). Only OPEN alerts count toward risk, so snoozing or
 * resolving an alert lowers the portfolio number exactly as it lowers the
 * per-event open count.
 *
 * portfolioRiskScore is 0 (no open risk) to 100 (saturated risk): each open
 * critical alert is weighted heavier than each open warning, summed across all
 * events, and saturated. This keeps it interpretable as "how much unresolved
 * risk is on the books right now" rather than an average that hides a single
 * very risky event.
 *
 * This file is ADDITIVE and does NOT import or modify lib/eventWarRoom or the
 * warroom repo; it only reads the shapes they return.
 */

/** The minimal shape of one war-room alert this rollup needs. */
export interface RollupAlert {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  recommendation: string;
  /** Persisted disposition; only "open" alerts count toward risk. */
  status?: "open" | "snoozed" | "resolved";
}

/**
 * The minimal shape of one per-event scan this rollup consumes. Matches the
 * WarRoomResult returned by server/src/db/warroom.runScan, plus an optional
 * eventName the repo can attach for display (the scan itself only knows the id).
 */
export interface PerEventScan {
  eventId: string;
  eventName?: string | null;
  alerts: RollupAlert[];
}

/** One event in the top-risky list, with its open-alert counts. */
export interface RiskyEvent {
  eventId: string;
  eventName: string | null;
  /** Weighted risk for this event (open criticals * 3 + open warnings). */
  risk: number;
  criticalCount: number;
  warningCount: number;
  /** The single highest-severity open alert on the event, for a one-line summary. */
  topAlert: { code: string; severity: "warning" | "critical"; message: string; recommendation: string } | null;
}

/** The portfolio-level rollup result. */
export interface EventRiskRollupResult {
  portfolioRiskScore: number;
  topRiskyEvents: RiskyEvent[];
  criticalCount: number;
  warningCount: number;
  /** How many of the scanned events carry at least one open critical/warning alert. */
  eventsAtRisk: number;
  /** How many events were scanned in total. */
  eventsScanned: number;
}

/** Weight of one open critical alert relative to one open warning. */
const CRITICAL_WEIGHT = 3;
const WARNING_WEIGHT = 1;

/**
 * Saturation point for the raw weighted risk -> 100 mapping. Roughly: a
 * portfolio carrying about a dozen open criticals (or the warning equivalent)
 * reads as fully saturated risk. Chosen so a healthy portfolio reads low and a
 * genuinely troubled one reads high, without a single event pinning the dial.
 */
const RISK_SATURATION = 36; // ~12 open criticals * 3

/** How many risky events to surface in the top list. */
const TOP_N = 5;

/** True for an alert that should count toward risk (open, and not info). */
function counts(a: RollupAlert): boolean {
  const status = a.status ?? "open";
  return status === "open" && (a.severity === "critical" || a.severity === "warning");
}

/**
 * Roll a set of per-event scans up into a single portfolio risk picture. Pure.
 * Safe on empty input (returns an all-zero result). Only open critical/warning
 * alerts contribute; info and snoozed/resolved alerts are ignored.
 */
export function rollupEventRisk(perEventScans: PerEventScan[]): EventRiskRollupResult {
  const scans = Array.isArray(perEventScans) ? perEventScans : [];

  let criticalCount = 0;
  let warningCount = 0;
  let eventsAtRisk = 0;

  const risky: RiskyEvent[] = [];

  for (const scan of scans) {
    const alerts = Array.isArray(scan.alerts) ? scan.alerts.filter(counts) : [];
    let crit = 0;
    let warn = 0;
    let topAlert: RiskyEvent["topAlert"] = null;

    for (const a of alerts) {
      if (a.severity === "critical") {
        crit += 1;
        if (!topAlert || topAlert.severity !== "critical") {
          topAlert = {
            code: a.code,
            severity: "critical",
            message: a.message,
            recommendation: a.recommendation,
          };
        }
      } else {
        warn += 1;
        if (!topAlert) {
          topAlert = {
            code: a.code,
            severity: "warning",
            message: a.message,
            recommendation: a.recommendation,
          };
        }
      }
    }

    criticalCount += crit;
    warningCount += warn;
    const risk = crit * CRITICAL_WEIGHT + warn * WARNING_WEIGHT;
    if (risk > 0) {
      eventsAtRisk += 1;
      risky.push({
        eventId: scan.eventId,
        eventName: scan.eventName ?? null,
        risk,
        criticalCount: crit,
        warningCount: warn,
        topAlert,
      });
    }
  }

  // Saturate the total weighted risk to a 0-100 portfolio score.
  const totalRisk = criticalCount * CRITICAL_WEIGHT + warningCount * WARNING_WEIGHT;
  const portfolioRiskScore = Math.max(
    0,
    Math.min(100, Math.round((totalRisk / RISK_SATURATION) * 100)),
  );

  // Highest risk first; break ties by more criticals, then event id for stability.
  risky.sort((a, b) => {
    if (b.risk !== a.risk) return b.risk - a.risk;
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    return a.eventId.localeCompare(b.eventId);
  });

  return {
    portfolioRiskScore,
    topRiskyEvents: risky.slice(0, TOP_N),
    criticalCount,
    warningCount,
    eventsAtRisk,
    eventsScanned: scans.length,
  };
}
