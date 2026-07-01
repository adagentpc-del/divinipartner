/**
 * F1 Event Memory Engine - pure helpers (no DB, no I/O).
 *
 * Two responsibilities:
 *   1. assembleSnapshot(parts) - take the raw rows already gathered from the
 *      existing operational tables and shape them into the durable
 *      event_memory snapshot the repo persists. Deterministic, no fabrication:
 *      every field is derived from the inputs, absent data stays null/empty.
 *   2. surfaceInsights(rows) - given a set of past event_memory snapshots
 *      (e.g. all snapshots for a venue + event type), compute the moat-grade
 *      insights: how many similar events were hosted, averages (guests, budget,
 *      revenue, install/teardown time, rating), outcome counts, and the best
 *      vendor combinations seen across those events.
 *
 * All numbers are plain JS numbers. Callers pass already-parsed jsonb.
 */

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export interface VendorUsed {
  organization_id: string | null;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  name?: string | null;
}

export interface SponsorUsed {
  id: string | null;
  name: string | null;
  category: string | null;
  status: string | null;
}

export interface MemorySnapshot {
  event_type: string | null;
  venue_id: string | null;
  guest_count: number | null;
  budget: number | null;
  vendors_used: VendorUsed[];
  sponsors_used: SponsorUsed[];
  revenue: number | null;
  timeline: Record<string, unknown>;
  approvals: Record<string, unknown>[];
  change_orders: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  install_minutes: number | null;
  teardown_minutes: number | null;
  issues: string[];
  resolutions: string[];
  reviews: Record<string, unknown>[];
  photos: unknown[];
  outcome: string;
}

/** Raw rows the repo gathered from the existing tables. */
export interface SnapshotParts {
  event: {
    type: string | null;
    venue_id: string | null;
    guest_count: number | null;
    budget: number | string | null;
    status: string | null;
    date_time: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  vendors: VendorUsed[];
  sponsors: SponsorUsed[];
  invoices: { total: number | string | null; status: string | null }[];
  payments: { amount: number | string | null; status: string | null }[];
  reviews: { rating: number | string | null; body: string | null; status: string | null }[];
  changeOrders: {
    id?: string;
    description: string | null;
    amount: number | string | null;
    status: string | null;
    created_at?: string | null;
  }[];
  installations: {
    arrival_time: string | null;
    setup_window: unknown;
    removal_schedule: unknown;
    completion_photos: unknown;
    status: string | null;
  }[];
  contracts: Record<string, unknown>[];
  feedbackIssues?: string[];
  feedbackResolutions?: string[];
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Minutes between two ISO timestamps, or null when not derivable. */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  const mins = Math.round(Math.abs(tb - ta) / 60000);
  return Number.isFinite(mins) ? mins : null;
}

/**
 * Derive install + teardown minutes from the installations rows. setup_window
 * and removal_schedule are jsonb that may carry { start, end } timestamps; we
 * read the longest derivable window across the rows.
 */
export function deriveDurations(
  installations: SnapshotParts["installations"],
): { install_minutes: number | null; teardown_minutes: number | null } {
  let install: number | null = null;
  let teardown: number | null = null;
  for (const i of installations ?? []) {
    const sw = (i.setup_window ?? {}) as Record<string, unknown>;
    const swMins = minutesBetween(sw.start as string, sw.end as string);
    if (swMins != null) install = Math.max(install ?? 0, swMins);
    const rs = (i.removal_schedule ?? {}) as Record<string, unknown>;
    const rsMins = minutesBetween(rs.start as string, rs.end as string);
    if (rsMins != null) teardown = Math.max(teardown ?? 0, rsMins);
  }
  return { install_minutes: install, teardown_minutes: teardown };
}

/** Roll up event revenue from payments received, falling back to invoice totals. */
export function deriveRevenue(
  invoices: SnapshotParts["invoices"],
  payments: SnapshotParts["payments"],
): number | null {
  const paid = (payments ?? [])
    .filter((p) => {
      const s = (p.status ?? "").toLowerCase();
      return s === "" || s === "succeeded" || s === "received" || s === "paid" || s === "captured";
    })
    .reduce((sum, p) => sum + (toNum(p.amount) ?? 0), 0);
  if (paid > 0) return paid;
  const invoiced = (invoices ?? []).reduce((sum, inv) => sum + (toNum(inv.total) ?? 0), 0);
  return invoiced > 0 ? invoiced : null;
}

/** Classify an outcome string from the rollup signals. Deterministic. */
export function classifyOutcome(input: {
  status: string | null;
  avgRating: number | null;
  openChangeOrders: number;
  issues: number;
}): string {
  const status = (input.status ?? "").toLowerCase();
  if (status === "archived" || status === "closed" || status === "completed") {
    if (input.issues === 0 && input.openChangeOrders === 0 && (input.avgRating ?? 0) >= 4.5) {
      return "success";
    }
    if (input.issues > 2 || (input.avgRating != null && input.avgRating < 3)) {
      return "needs_attention";
    }
    return "mixed";
  }
  return "in_progress";
}

/** Assemble the durable snapshot from already-gathered raw parts. */
export function assembleSnapshot(parts: SnapshotParts): MemorySnapshot {
  const { install_minutes, teardown_minutes } = deriveDurations(parts.installations);
  const revenue = deriveRevenue(parts.invoices, parts.payments);

  const ratings = (parts.reviews ?? [])
    .map((r) => toNum(r.rating))
    .filter((n): n is number => n != null);
  const avgRating = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;

  const approvals = (parts.changeOrders ?? []).map((co) => ({
    type: "change_order",
    description: co.description,
    amount: toNum(co.amount),
    status: co.status,
  }));

  const photos: unknown[] = [];
  for (const i of parts.installations ?? []) {
    const cp = i.completion_photos;
    if (Array.isArray(cp)) photos.push(...cp);
    else if (cp) photos.push(cp);
  }

  const issues = (parts.feedbackIssues ?? []).slice();
  for (const co of parts.changeOrders ?? []) {
    const s = (co.status ?? "").toLowerCase();
    if ((s === "rejected" || s === "disputed") && co.description) {
      issues.push(`Change order: ${co.description}`);
    }
  }

  const openChangeOrders = (parts.changeOrders ?? []).filter((co) => {
    const s = (co.status ?? "").toLowerCase();
    return s === "pending" || s === "requested" || s === "open" || s === "";
  }).length;

  const outcome = classifyOutcome({
    status: parts.event.status,
    avgRating,
    openChangeOrders,
    issues: issues.length,
  });

  return {
    event_type: parts.event.type ?? null,
    venue_id: parts.event.venue_id ?? null,
    guest_count: parts.event.guest_count ?? null,
    budget: toNum(parts.event.budget),
    vendors_used: parts.vendors ?? [],
    sponsors_used: parts.sponsors ?? [],
    revenue,
    timeline: {
      status: parts.event.status,
      date_time: parts.event.date_time,
      created_at: parts.event.created_at ?? null,
      updated_at: parts.event.updated_at ?? null,
    },
    approvals,
    change_orders: (parts.changeOrders ?? []) as unknown as Record<string, unknown>[],
    contracts: parts.contracts ?? [],
    install_minutes,
    teardown_minutes,
    issues,
    resolutions: parts.feedbackResolutions ?? [],
    reviews: (parts.reviews ?? []) as unknown as Record<string, unknown>[],
    photos,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Insights across snapshots
// ---------------------------------------------------------------------------

export interface MemoryRow {
  event_id: string;
  event_type: string | null;
  venue_id: string | null;
  guest_count: number | null;
  budget: number | string | null;
  revenue: number | string | null;
  install_minutes: number | null;
  teardown_minutes: number | null;
  vendors_used: VendorUsed[] | null;
  reviews: { rating?: number | string | null }[] | null;
  outcome: string | null;
}

export interface VendorCombo {
  vendors: string[];
  count: number;
  avg_revenue: number | null;
  avg_rating: number | null;
}

export interface MemoryInsights {
  count: number;
  headline: string;
  averages: {
    guest_count: number | null;
    budget: number | null;
    revenue: number | null;
    install_minutes: number | null;
    teardown_minutes: number | null;
    rating: number | null;
  };
  outcome_counts: Record<string, number>;
  best_vendor_combinations: VendorCombo[];
}

function avg(nums: (number | null)[]): number | null {
  const vals = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowAvgRating(row: MemoryRow): number | null {
  const ratings = (row.reviews ?? [])
    .map((r) => num(r?.rating))
    .filter((n): n is number => n != null);
  return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
}

/** A stable key + label for a vendor in a combination. */
function vendorKey(v: VendorUsed): string | null {
  const id = v.organization_id || v.vendor_id;
  if (id) return v.name ? `${v.name} (${id.slice(0, 8)})` : id;
  return v.name || null;
}

/**
 * Surface compounding insights across past snapshots: counts, averages,
 * outcome distribution, and the best-performing vendor combinations (pairs of
 * vendors that appeared together, ranked by frequency then avg revenue).
 */
export function surfaceInsights(rows: MemoryRow[], label?: string): MemoryInsights {
  const count = rows.length;
  const scope = label ? `${label} ` : "";
  const headline =
    count === 0
      ? `No comparable ${scope}events recorded yet.`
      : `Hosted ${count} similar ${scope}event${count === 1 ? "" : "s"}.`;

  const averages = {
    guest_count: avg(rows.map((r) => r.guest_count)),
    budget: avg(rows.map((r) => num(r.budget))),
    revenue: avg(rows.map((r) => num(r.revenue))),
    install_minutes: avg(rows.map((r) => r.install_minutes)),
    teardown_minutes: avg(rows.map((r) => r.teardown_minutes)),
    rating: avg(rows.map((r) => rowAvgRating(r))),
  };

  const outcome_counts: Record<string, number> = {};
  for (const r of rows) {
    const o = r.outcome || "unknown";
    outcome_counts[o] = (outcome_counts[o] ?? 0) + 1;
  }

  // Best vendor combinations: every unordered pair of vendors that appeared on
  // the same event, aggregated across events.
  const combos = new Map<string, { vendors: string[]; revenues: number[]; ratings: number[]; count: number }>();
  for (const r of rows) {
    const keys = (r.vendors_used ?? [])
      .map((v) => vendorKey(v))
      .filter((k): k is string => !!k);
    const uniq = Array.from(new Set(keys)).sort();
    const rev = num(r.revenue);
    const rating = rowAvgRating(r);
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const pair = [uniq[i], uniq[j]];
        const key = pair.join(" + ");
        const entry = combos.get(key) ?? { vendors: pair, revenues: [], ratings: [], count: 0 };
        entry.count += 1;
        if (rev != null) entry.revenues.push(rev);
        if (rating != null) entry.ratings.push(rating);
        combos.set(key, entry);
      }
    }
  }

  const best_vendor_combinations: VendorCombo[] = Array.from(combos.values())
    .map((e) => ({
      vendors: e.vendors,
      count: e.count,
      avg_revenue: e.revenues.length ? Math.round(e.revenues.reduce((a, b) => a + b, 0) / e.revenues.length) : null,
      avg_rating: e.ratings.length
        ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) * 100) / 100
        : null,
    }))
    .sort((a, b) => b.count - a.count || (b.avg_revenue ?? 0) - (a.avg_revenue ?? 0))
    .slice(0, 5);

  return { count, headline, averages, outcome_counts, best_vendor_combinations };
}
