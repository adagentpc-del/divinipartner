/**
 * Comparison engine - venues, vendors, and quotes, up to 5 at a time.
 *
 * Each comparator loads the selected rows, builds a generic row-level table
 * (attributes down the side, options across the top) plus deterministic pros and
 * cons per option, derived from the same numbers (best on a metric earns a pro,
 * worst earns a con; flags add categorical pros/cons). No AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { assertOwnsEvent } from "./eventLanding.js";

export const MAX_COMPARE = 5;

export interface CompareResult {
  type: "venues" | "vendors" | "quotes";
  columns: { id: string; label: string }[];
  rows: { label: string; values: string[]; highlight?: boolean }[];
  proscons: { id: string; label: string; pros: string[]; cons: string[] }[];
}

interface Opt {
  id: string;
  label: string;
  data: Record<string, unknown>;
}
interface RowSpec {
  label: string;
  value: (d: Record<string, unknown>) => string;
  metric?: { num: (d: Record<string, unknown>) => number | null; better: "high" | "low"; pro: string; con: string };
  highlight?: boolean;
}
interface FlagSpec {
  test: (d: Record<string, unknown>) => boolean;
  pro?: string;
  con?: string;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function money(v: unknown): string {
  const n = num(v);
  return n == null ? "-" : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Assemble the generic comparison + pros/cons from options + specs. */
function build(type: CompareResult["type"], opts: Opt[], rowSpecs: RowSpec[], flags: FlagSpec[]): CompareResult {
  const columns = opts.map((o) => ({ id: o.id, label: o.label }));
  const rows = rowSpecs.map((rs) => ({
    label: rs.label,
    values: opts.map((o) => rs.value(o.data)),
    highlight: rs.highlight,
  }));

  const proscons = opts.map((o) => ({ id: o.id, label: o.label, pros: [] as string[], cons: [] as string[] }));

  for (const rs of rowSpecs) {
    if (!rs.metric) continue;
    const nums = opts.map((o) => rs.metric!.num(o.data));
    const present = nums.filter((n): n is number => n != null);
    if (present.length < 2) continue;
    const max = Math.max(...present);
    const min = Math.min(...present);
    if (max === min) continue; // no spread, no pro/con
    const bestVal = rs.metric.better === "high" ? max : min;
    const worstVal = rs.metric.better === "high" ? min : max;
    nums.forEach((n, i) => {
      if (n == null) return;
      if (n === bestVal) proscons[i].pros.push(rs.metric!.pro);
      else if (n === worstVal) proscons[i].cons.push(rs.metric!.con);
    });
  }

  for (const f of flags) {
    opts.forEach((o, i) => {
      const pass = f.test(o.data);
      if (pass && f.pro) proscons[i].pros.push(f.pro);
      if (pass && f.con) proscons[i].cons.push(f.con);
    });
  }

  return { type, columns, rows, proscons };
}

function clampIds(ids: unknown): string[] {
  const arr = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && !!x) : [];
  return Array.from(new Set(arr)).slice(0, MAX_COMPARE);
}

// ---- Quotes -----------------------------------------------------------------

export async function compareQuotes(actor: Actor, idsIn: unknown): Promise<CompareResult> {
  const ids = clampIds(idsIn);
  if (ids.length < 2) throw new ForbiddenError("pick at least 2 quotes to compare");
  const rows = await q<{
    id: string;
    event_id: string | null;
    subtotal: string | null;
    platform_fee: string | null;
    total: string | null;
    status: string | null;
    expiration_date: string | null;
    line_items: unknown;
    vendor_name: string | null;
  }>(
    `select qt.id, qt.event_id, qt.subtotal, qt.platform_fee, qt.total, qt.status,
            qt.expiration_date, qt.line_items, o.name as vendor_name
       from quotes qt
       left join vendors v on v.id = qt.vendor_id
       left join organizations o on o.id = v.organization_id
      where qt.id = any($1::uuid[])`,
    [ids],
  );
  // Quote comparison is an OWNER action (a client weighing bids on their event).
  // Gate on event ownership, not mere read-access, so an attached vendor cannot
  // compare competitors' quotes. A quote with no event_id has no gate: refuse it.
  if (rows.some((r) => !r.event_id)) {
    throw new ForbiddenError("one of those quotes is not tied to an event you own");
  }
  const events = Array.from(new Set(rows.map((r) => r.event_id).filter((x): x is string => !!x)));
  for (const ev of events) await assertOwnsEvent(actor, ev);

  const lineCount = (li: unknown): number => {
    if (Array.isArray(li)) return li.length;
    if (li && typeof li === "object") {
      let c = 0;
      for (const v of Object.values(li as Record<string, unknown>)) if (Array.isArray(v)) c += v.length;
      return c;
    }
    return 0;
  };

  const opts: Opt[] = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, label: r.vendor_name ?? "Vendor quote", data: r as unknown as Record<string, unknown> }));

  return build(
    "quotes",
    opts,
    [
      { label: "Vendor", value: (d) => (d.vendor_name as string) ?? "Vendor" },
      { label: "Subtotal", value: (d) => money(d.subtotal), metric: { num: (d) => num(d.subtotal), better: "low", pro: "Lowest subtotal", con: "Highest subtotal" } },
      { label: "Platform fee", value: (d) => money(d.platform_fee) },
      { label: "Total", value: (d) => money(d.total), highlight: true, metric: { num: (d) => num(d.total), better: "low", pro: "Lowest total cost", con: "Most expensive" } },
      { label: "Line items", value: (d) => String(lineCount(d.line_items)), metric: { num: (d) => lineCount(d.line_items), better: "high", pro: "Most detailed scope", con: "Least detailed scope" } },
      { label: "Status", value: (d) => ((d.status as string) ?? "-").replace(/_/g, " ") },
      { label: "Expires", value: (d) => (d.expiration_date ? new Date(d.expiration_date as string).toLocaleDateString("en-US") : "-") },
    ],
    [
      { test: (d) => d.status === "accepted", pro: "Already accepted" },
      { test: (d) => d.status === "declined", con: "Declined" },
    ],
  );
}

// ---- Vendors ----------------------------------------------------------------

export async function compareVendors(_actor: Actor, idsIn: unknown): Promise<CompareResult> {
  const ids = clampIds(idsIn);
  if (ids.length < 2) throw new ForbiddenError("pick at least 2 vendors to compare");
  // Keyed on ORGANIZATION id (the stable identity used by the event roster);
  // a vendor org may or may not have a vendors profile row, so join on org.
  const rows = await q<{
    id: string;
    name: string | null;
    category: string | null;
    review_score: string | null;
    service_radius: number | null;
    preferred_status: boolean | null;
    premier_status: boolean | null;
    score: number | null;
  }>(
    `select o.id, o.name, v.category, v.review_score, v.service_radius,
            v.preferred_status, v.premier_status, ds.score
       from organizations o
       left join vendors v on v.organization_id = o.id
       left join divini_scores ds on ds.entity_type = 'vendor' and ds.entity_id = v.id
      where o.id = any($1::uuid[])`,
    [ids],
  );
  const opts: Opt[] = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, label: r.name ?? "Vendor", data: r as unknown as Record<string, unknown> }));

  return build(
    "vendors",
    opts,
    [
      { label: "Vendor", value: (d) => (d.name as string) ?? "Vendor" },
      { label: "Category", value: (d) => (d.category as string) ?? "-" },
      { label: "Divini score", value: (d) => (num(d.score) == null ? "-" : String(num(d.score))), highlight: true, metric: { num: (d) => num(d.score), better: "high", pro: "Top Divini score", con: "Lowest Divini score" } },
      { label: "Review score", value: (d) => (num(d.review_score) == null ? "-" : `${num(d.review_score)}/5`), metric: { num: (d) => num(d.review_score), better: "high", pro: "Best reviewed", con: "Lowest reviews" } },
      { label: "Service radius", value: (d) => (num(d.service_radius) == null ? "-" : `${num(d.service_radius)} mi`) },
      { label: "Tier", value: (d) => (d.premier_status ? "Premier" : d.preferred_status ? "Preferred" : "Standard") },
    ],
    [
      { test: (d) => !!d.premier_status, pro: "Premier vendor" },
      { test: (d) => !!d.preferred_status, pro: "Preferred vendor" },
    ],
  );
}

// ---- Venue picker list ------------------------------------------------------

/** Published venues a client can pick to compare (id + name + city). */
export async function listVenuesForCompare(term?: string): Promise<{ id: string; name: string | null; city: string | null }[]> {
  const params: unknown[] = [];
  let where = `p.published_status = 'published' and p.kind = 'venue'`;
  if (term && term.trim()) {
    params.push(`%${term.trim().toLowerCase()}%`);
    where += ` and (lower(coalesce(ve.name,'')) like $${params.length} or lower(coalesce(ve.city,'')) like $${params.length})`;
  }
  return q<{ id: string; name: string | null; city: string | null }>(
    `select ve.id, ve.name, ve.city
       from venues ve
       join profiles p on p.organization_id = ve.organization_id
      where ${where}
      order by ve.name asc
      limit 50`,
    params,
  );
}

// ---- Venues -----------------------------------------------------------------

export async function compareVenues(_actor: Actor, idsIn: unknown): Promise<CompareResult> {
  const ids = clampIds(idsIn);
  if (ids.length < 2) throw new ForbiddenError("pick at least 2 venues to compare");
  const rows = await q<{
    id: string;
    name: string | null;
    city: string | null;
    capacity: number | null;
    readiness_score: number | null;
    parking_capacity: number | null;
  }>(
    `select ve.id, ve.name, ve.city, vt.capacity, vt.readiness_score, vt.parking_capacity
       from venues ve
       left join venue_twin vt on vt.venue_id = ve.id
      where ve.id = any($1::uuid[])`,
    [ids],
  );
  const opts: Opt[] = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, label: r.name ?? "Venue", data: r as unknown as Record<string, unknown> }));

  return build(
    "venues",
    opts,
    [
      { label: "Venue", value: (d) => (d.name as string) ?? "Venue" },
      { label: "City", value: (d) => (d.city as string) ?? "-" },
      { label: "Capacity", value: (d) => (num(d.capacity) == null ? "-" : String(num(d.capacity))), highlight: true, metric: { num: (d) => num(d.capacity), better: "high", pro: "Largest capacity", con: "Smallest capacity" } },
      { label: "Quote readiness", value: (d) => (num(d.readiness_score) == null ? "-" : `${num(d.readiness_score)}/100`), metric: { num: (d) => num(d.readiness_score), better: "high", pro: "Most quote-ready", con: "Least quote-ready" } },
      { label: "Parking", value: (d) => (num(d.parking_capacity) == null ? "-" : String(num(d.parking_capacity))), metric: { num: (d) => num(d.parking_capacity), better: "high", pro: "Most parking", con: "Least parking" } },
    ],
    [],
  );
}
