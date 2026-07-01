/**
 * Intelligence Moat addendum - F5 Relationship Intelligence Graph (pure layer).
 *
 * Deterministic, DB-free helpers that:
 *   1. Turn raw rows pulled from existing tables (events + event_vendors,
 *      preferred_vendors, sponsorship_opportunities, quotes/invoices) into a
 *      normalized list of relationship edges (deriveEdgesFromData).
 *   2. Aggregate duplicate edges (same from/to/type) into one edge with a
 *      summed weight + revenue and the most recent last_at (aggregateEdges).
 *   3. Render human insight strings from a node's neighbor edges
 *      (graphInsights) - e.g. "planner worked with venue 14 times".
 *
 * No AI, no randomness, no DB access here: the db layer
 * (server/src/db/relationship.ts) supplies rows and persists results. Same
 * inputs always produce the same edges, in a stable sorted order.
 */

export type EntityType =
  | "organization"
  | "venue"
  | "vendor"
  | "sponsor"
  | "planner"
  | "agency"
  | "brand"
  | "client"
  | "contact";

export type EdgeType =
  | "worked_together"
  | "referred_by"
  | "preferred"
  | "sponsor_history"
  | "past_projects"
  | "partnership"
  | "revenue"
  | "introduction"
  | "collaboration";

/** A single derived (or stored) relationship edge. */
export type DerivedEdge = {
  from_type: EntityType;
  from_id: string;
  to_type: EntityType;
  to_id: string;
  edge_type: EdgeType;
  weight: number;
  revenue: number;
  last_at: string | null;
  meta?: Record<string, unknown>;
};

// ---- Raw row shapes (what the db layer hands us) ---------------------------

/** One row per (event, vendor) attachment, joined to the event. */
export type EventVendorRow = {
  event_id: string;
  vendor_id: string | null;
  venue_id: string | null;
  planner_id: string | null;
  client_id: string | null;
  date_time: string | null;
};

/** One row per preferred_vendors record. */
export type PreferredRow = {
  venue_id: string | null;
  vendor_id: string | null;
  tier: string | null;
  created_at: string | null;
};

/** One row per sponsorship_opportunity (venue hosts sponsor inventory). */
export type SponsorshipRow = {
  venue_id: string | null;
  organization_id: string | null; // the sponsor / owning org of the opportunity
  status: string | null;
  created_at: string | null;
};

/** One revenue-bearing row (a quote or an invoice) tied to a vendor + event. */
export type RevenueRow = {
  vendor_id: string | null;
  venue_id: string | null;
  client_id: string | null;
  total: number | null;
  created_at: string | null;
};

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
};

function pushEdge(
  out: DerivedEdge[],
  from_type: EntityType,
  from_id: string | null,
  to_type: EntityType,
  to_id: string | null,
  edge_type: EdgeType,
  opts: { weight?: number; revenue?: number; last_at?: string | null } = {},
): void {
  if (!from_id || !to_id || from_id === to_id) return;
  out.push({
    from_type,
    from_id,
    to_type,
    to_id,
    edge_type,
    weight: opts.weight ?? 1,
    revenue: opts.revenue ?? 0,
    last_at: opts.last_at ?? null,
  });
}

/**
 * Derive the raw (pre-aggregation) edge list from existing data. The caller
 * supplies the four row sets; this function maps them to edge tuples:
 *   - events + event_vendors -> worked_together (planner<->venue,
 *     planner<->vendor, venue<->vendor, client<->venue)
 *   - preferred_vendors      -> preferred (venue->vendor)
 *   - sponsorship_opportunities -> sponsor_history (sponsor org<->venue)
 *   - quotes/invoices        -> revenue (client/venue<->vendor, with $ amount)
 */
export function deriveEdgesFromData(data: {
  eventVendors?: EventVendorRow[];
  preferred?: PreferredRow[];
  sponsorships?: SponsorshipRow[];
  revenue?: RevenueRow[];
}): DerivedEdge[] {
  const out: DerivedEdge[] = [];

  for (const r of data.eventVendors ?? []) {
    const at = r.date_time ?? null;
    // venue <-> vendor (worked together on an event)
    pushEdge(out, "venue", r.venue_id, "vendor", r.vendor_id, "worked_together", { last_at: at });
    // planner <-> venue
    pushEdge(out, "planner", r.planner_id, "venue", r.venue_id, "worked_together", { last_at: at });
    // planner <-> vendor
    pushEdge(out, "planner", r.planner_id, "vendor", r.vendor_id, "worked_together", { last_at: at });
    // client <-> venue
    pushEdge(out, "client", r.client_id, "venue", r.venue_id, "worked_together", { last_at: at });
  }

  for (const r of data.preferred ?? []) {
    pushEdge(out, "venue", r.venue_id, "vendor", r.vendor_id, "preferred", {
      last_at: r.created_at ?? null,
    });
  }

  for (const r of data.sponsorships ?? []) {
    // sponsor (owning org) has a sponsorship history with the venue
    pushEdge(out, "sponsor", r.organization_id, "venue", r.venue_id, "sponsor_history", {
      last_at: r.created_at ?? null,
    });
  }

  for (const r of data.revenue ?? []) {
    const amt = num(r.total);
    const at = r.created_at ?? null;
    // client / venue -> vendor revenue (one count + the dollar amount each)
    pushEdge(out, "client", r.client_id, "vendor", r.vendor_id, "revenue", {
      revenue: amt,
      last_at: at,
    });
    pushEdge(out, "venue", r.venue_id, "vendor", r.vendor_id, "revenue", {
      revenue: amt,
      last_at: at,
    });
  }

  return out;
}

const key = (e: DerivedEdge): string =>
  `${e.from_type}:${e.from_id}:${e.to_type}:${e.to_id}:${e.edge_type}`;

/**
 * Collapse duplicate edges into one row per (from,to,type): weight is the count,
 * revenue is the sum, last_at is the most recent. Returns a stably sorted list.
 */
export function aggregateEdges(edges: DerivedEdge[]): DerivedEdge[] {
  const map = new Map<string, DerivedEdge>();
  for (const e of edges) {
    const k = key(e);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { ...e });
    } else {
      cur.weight += e.weight;
      cur.revenue += e.revenue;
      cur.last_at = later(cur.last_at, e.last_at);
    }
  }
  return [...map.values()].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

const ENTITY_LABEL: Record<EntityType, string> = {
  organization: "organization",
  venue: "venue",
  vendor: "vendor",
  sponsor: "sponsor",
  planner: "planner",
  agency: "agency",
  brand: "brand",
  client: "client",
  contact: "contact",
};

const VERB: Record<EdgeType, string> = {
  worked_together: "worked with",
  referred_by: "was referred by",
  preferred: "prefers",
  sponsor_history: "sponsored at",
  past_projects: "collaborated on past projects with",
  partnership: "partners with",
  revenue: "generated revenue with",
  introduction: "was introduced to",
  collaboration: "collaborated with",
};

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

function money(n: number): string {
  if (n <= 0) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * Render insight strings for a node from its (aggregated) neighbor edges.
 * Example: "planner worked with venue 14 times" or
 * "venue generated revenue with vendor over 6 deals ($48,200)".
 * Deterministic: sorted by weight desc then revenue desc then a stable key.
 */
export function graphInsights(
  edges: DerivedEdge[],
  opts: { nameFor?: (type: EntityType, id: string) => string | null } = {},
): string[] {
  const nameFor = opts.nameFor ?? (() => null);
  const sorted = [...edges].sort(
    (a, b) =>
      b.weight - a.weight ||
      b.revenue - a.revenue ||
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
  return sorted.map((e) => {
    const fromName = nameFor(e.from_type, e.from_id) ?? ENTITY_LABEL[e.from_type];
    const toName = nameFor(e.to_type, e.to_id) ?? ENTITY_LABEL[e.to_type];
    const verb = VERB[e.edge_type];
    let tail = "";
    if (e.edge_type === "worked_together" || e.edge_type === "collaboration") {
      tail = ` ${e.weight} ${plural(e.weight, "time", "times")}`;
    } else if (e.edge_type === "revenue") {
      tail = ` over ${e.weight} ${plural(e.weight, "deal", "deals")} (${money(e.revenue)})`;
    } else if (e.weight > 1) {
      tail = ` (${e.weight}x)`;
    }
    return `${fromName} ${verb} ${toName}${tail}`;
  });
}
