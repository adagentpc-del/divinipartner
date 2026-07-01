/**
 * F10 Post-Event Intelligence - pure helpers (no DB, no I/O).
 *
 * analyzeDrivers(feedbackRows) takes the event_feedback rows collected from
 * every stakeholder (venue / vendor / planner / sponsor / client / attendee)
 * and produces a deterministic summary of what drove success, what dragged the
 * event down, and what moved revenue. Drivers come from two sources:
 *   1. the structured `drivers` jsonb each row may carry, of the shape
 *      { success?: string[], failure?: string[], revenue?: string[] } (or a
 *      flat map of label -> sentiment/number), and
 *   2. the numeric `rating`, which we average overall and per role.
 *
 * No AI and no fabrication: every output is computed from the inputs.
 */

export interface FeedbackRow {
  id?: string;
  role: string | null;
  rating: number | string | null;
  comments?: string | null;
  drivers?: unknown;
  created_at?: string | null;
}

export interface DriverTally {
  label: string;
  count: number;
}

export interface DriverAnalysis {
  responses: number;
  avg_rating: number | null;
  by_role: { role: string; responses: number; avg_rating: number | null }[];
  success_drivers: DriverTally[];
  failure_drivers: DriverTally[];
  revenue_drivers: DriverTally[];
  summary: string;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normalize a row's `drivers` jsonb into three labelled buckets. Accepts:
 *   { success: [...], failure: [...], revenue: [...] }  (preferred)
 * or a flat object whose values hint at the bucket:
 *   { "great catering": "success", "late load-in": "failure", upsell: "revenue" }
 */
function extractDrivers(drivers: unknown): { success: string[]; failure: string[]; revenue: string[] } {
  const out = { success: [] as string[], failure: [] as string[], revenue: [] as string[] };
  if (!drivers || typeof drivers !== "object") return out;
  const d = drivers as Record<string, unknown>;

  const pushAll = (bucket: keyof typeof out, v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) out[bucket].push(item.trim());
      }
    } else if (typeof v === "string" && v.trim()) {
      out[bucket].push(v.trim());
    }
  };

  if ("success" in d || "failure" in d || "revenue" in d) {
    pushAll("success", d.success);
    pushAll("failure", d.failure);
    pushAll("revenue", d.revenue);
    return out;
  }

  // Flat map: classify by the value's sentiment hint.
  for (const [label, val] of Object.entries(d)) {
    const sentiment = String(val).toLowerCase();
    if (sentiment.includes("revenue") || sentiment.includes("upsell") || sentiment.includes("sponsor")) {
      out.revenue.push(label);
    } else if (sentiment.includes("fail") || sentiment.includes("issue") || sentiment.includes("bad") || sentiment.includes("negative")) {
      out.failure.push(label);
    } else if (sentiment.includes("success") || sentiment.includes("good") || sentiment.includes("positive")) {
      out.success.push(label);
    }
  }
  return out;
}

function tally(items: string[]): DriverTally[] {
  const map = new Map<string, number>();
  for (const raw of items) {
    const label = raw.trim();
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Analyze success / failure / revenue drivers across feedback rows. */
export function analyzeDrivers(feedbackRows: FeedbackRow[]): DriverAnalysis {
  const rows = feedbackRows ?? [];
  const ratings = rows.map((r) => toNum(r.rating)).filter((n): n is number => n != null);
  const avg_rating = ratings.length ? round2(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

  // Per-role rollup.
  const roleMap = new Map<string, { responses: number; ratings: number[] }>();
  for (const r of rows) {
    const role = (r.role ?? "unknown").toLowerCase();
    const entry = roleMap.get(role) ?? { responses: 0, ratings: [] };
    entry.responses += 1;
    const rt = toNum(r.rating);
    if (rt != null) entry.ratings.push(rt);
    roleMap.set(role, entry);
  }
  const by_role = Array.from(roleMap.entries())
    .map(([role, e]) => ({
      role,
      responses: e.responses,
      avg_rating: e.ratings.length ? round2(e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) : null,
    }))
    .sort((a, b) => b.responses - a.responses || a.role.localeCompare(b.role));

  // Driver buckets.
  const success: string[] = [];
  const failure: string[] = [];
  const revenue: string[] = [];
  for (const r of rows) {
    const d = extractDrivers(r.drivers);
    success.push(...d.success);
    failure.push(...d.failure);
    revenue.push(...d.revenue);
  }
  const success_drivers = tally(success);
  const failure_drivers = tally(failure);
  const revenue_drivers = tally(revenue);

  // Deterministic narrative summary.
  const parts: string[] = [];
  if (rows.length === 0) {
    parts.push("No post-event feedback collected yet.");
  } else {
    parts.push(`${rows.length} response${rows.length === 1 ? "" : "s"} collected${avg_rating != null ? `, averaging ${avg_rating}/5` : ""}.`);
    if (success_drivers.length) parts.push(`Top success driver: ${success_drivers[0].label}.`);
    if (failure_drivers.length) parts.push(`Top failure driver: ${failure_drivers[0].label}.`);
    if (revenue_drivers.length) parts.push(`Top revenue driver: ${revenue_drivers[0].label}.`);
  }

  return {
    responses: rows.length,
    avg_rating,
    by_role,
    success_drivers,
    failure_drivers,
    revenue_drivers,
    summary: parts.join(" "),
  };
}
