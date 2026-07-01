/**
 * Intelligence Moat addendum - F5 Relationship Intelligence Graph (data layer).
 *
 * Org-scoped reads + recompute over relationship_edges (db/schema-im-relationship.sql).
 * Every edge carries organization_id so the graph is partitioned per acting org
 * (IDOR-safe: a caller only ever sees / rebuilds edges owned by their org, and a
 * super_admin/admin may operate across all orgs).
 *
 *   - rebuildEdges(actor): recompute the actor org's edges from existing data
 *     (events + event_vendors, preferred_vendors, sponsorship_opportunities,
 *     quotes + invoices) and upsert them.
 *   - getGraph(actor, entityType, entityId): neighbors + insight strings for one
 *     node, restricted to the actor org's edges.
 *   - upsertEdge(actor, edge): insert/merge a single edge (org-scoped).
 *
 * Server imports use .js per project convention.
 */
import { q, q1, pool } from "../pool.js";
import { type Actor } from "../db.js";
import {
  deriveEdgesFromData,
  aggregateEdges,
  graphInsights,
  type DerivedEdge,
  type EntityType,
  type EdgeType,
  type EventVendorRow,
  type PreferredRow,
  type SponsorshipRow,
  type RevenueRow,
} from "../lib/relationshipGraph.js";

function isStaff(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** Org id the operations are scoped to (null only for staff operating globally). */
function scopeOrg(actor: Actor): string | null {
  return actor.org?.id ?? null;
}

// ---------------------------------------------------------------------------
// Recompute (rebuildEdges)
// ---------------------------------------------------------------------------

/**
 * Recompute the relationship edges for the actor's org from existing data and
 * upsert them. Returns the number of distinct edges written. Staff with no org
 * rebuild across the whole dataset; everyone else is constrained to org rows.
 */
export async function rebuildEdges(actor: Actor): Promise<{ edges: number }> {
  const org = scopeOrg(actor);
  const staffGlobal = isStaff(actor) && !org;

  // The org filter is applied at the data-pull stage so we only derive edges the
  // caller owns. Staff-global pulls everything (org param null disables filters).
  const orgParam = staffGlobal ? null : org;

  const eventVendors = await q<EventVendorRow>(
    `select ev.event_id,
            ev.vendor_id,
            e.venue_id,
            e.planner_id,
            e.client_id,
            e.date_time
       from event_vendors ev
       join events e on e.id = ev.event_id
      where $1::uuid is null
         or e.organization_id = $1
         or ev.organization_id = $1`,
    [orgParam],
  );

  const preferred = await q<PreferredRow>(
    `select pv.venue_id, pv.vendor_id, pv.tier, pv.created_at
       from preferred_vendors pv
       left join venues v on v.id = pv.venue_id
      where $1::uuid is null or v.organization_id = $1`,
    [orgParam],
  );

  const sponsorships = await q<SponsorshipRow>(
    `select so.venue_id, so.organization_id, so.status, so.created_at
       from sponsorship_opportunities so
      where $1::uuid is null or so.organization_id = $1`,
    [orgParam],
  );

  // Revenue rows: quotes (accepted/converted) + invoices, joined to their event
  // for the venue/client context. Both carry vendor_id + total.
  const revenue = await q<RevenueRow>(
    `select qt.vendor_id, e.venue_id, e.client_id, qt.total, qt.created_at
       from quotes qt
       left join events e on e.id = qt.event_id
      where qt.total is not null
        and ($1::uuid is null or e.organization_id = $1 or qt.vendor_id in (
              select id from vendors where organization_id = $1))
     union all
     select iv.vendor_id, e.venue_id, iv.client_id, iv.total, iv.created_at
       from invoices iv
       left join events e on e.id = iv.event_id
      where iv.total is not null
        and ($1::uuid is null or iv.organization_id = $1 or e.organization_id = $1)`,
    [orgParam],
  );

  const edges = aggregateEdges(
    deriveEdgesFromData({ eventVendors, preferred, sponsorships, revenue }),
  );

  // Persist. Replace the org's derived rows transactionally so stale edges drop.
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (staffGlobal) {
      await client.query(`delete from relationship_edges`);
    } else {
      await client.query(`delete from relationship_edges where organization_id = $1`, [org]);
    }
    for (const e of edges) {
      await client.query(
        `insert into relationship_edges
           (organization_id, from_type, from_id, to_type, to_id, edge_type,
            weight, revenue, last_at, meta)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (from_type, from_id, to_type, to_id, edge_type)
         do update set weight = excluded.weight,
                       revenue = excluded.revenue,
                       last_at = excluded.last_at,
                       organization_id = excluded.organization_id,
                       updated_at = now()`,
        [
          staffGlobal ? null : org,
          e.from_type,
          e.from_id,
          e.to_type,
          e.to_id,
          e.edge_type,
          e.weight,
          e.revenue,
          e.last_at,
          e.meta ? JSON.stringify(e.meta) : null,
        ],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  return { edges: edges.length };
}

// ---------------------------------------------------------------------------
// Read (getGraph)
// ---------------------------------------------------------------------------

export type EdgeRow = {
  id: string;
  from_type: EntityType;
  from_id: string;
  to_type: EntityType;
  to_id: string;
  edge_type: EdgeType;
  weight: number;
  revenue: string | number | null;
  last_at: string | null;
};

export type GraphNode = {
  type: EntityType;
  id: string;
  label: string;
};

export type GraphResult = {
  center: GraphNode;
  nodes: GraphNode[];
  edges: Array<{
    from_type: EntityType;
    from_id: string;
    to_type: EntityType;
    to_id: string;
    edge_type: EdgeType;
    weight: number;
    revenue: number;
    last_at: string | null;
  }>;
  insights: string[];
};

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

/** Resolve display names for a batch of (type,id) nodes, org-agnostic lookups. */
async function resolveNames(
  nodes: Array<{ type: EntityType; id: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byType = new Map<EntityType, Set<string>>();
  for (const n of nodes) {
    if (!byType.has(n.type)) byType.set(n.type, new Set());
    byType.get(n.type)!.add(n.id);
  }
  const tableFor: Partial<Record<EntityType, { table: string; expr: string }>> = {
    venue: { table: "venues", expr: "name" },
    vendor: { table: "vendors", expr: "coalesce(category, 'Vendor')" },
    organization: { table: "organizations", expr: "name" },
    sponsor: { table: "organizations", expr: "name" },
    planner: { table: "users", expr: "coalesce(name, email, 'Planner')" },
    client: { table: "users", expr: "coalesce(name, email, 'Client')" },
    contact: { table: "users", expr: "coalesce(name, email, 'Contact')" },
  };
  for (const [type, ids] of byType) {
    const meta = tableFor[type];
    if (!meta || ids.size === 0) continue;
    const rows = await q<{ id: string; label: string | null }>(
      `select id, ${meta.expr} as label from ${meta.table} where id = any($1::uuid[])`,
      [[...ids]],
    );
    for (const r of rows) out.set(`${type}:${r.id}`, r.label ?? type);
  }
  return out;
}

/**
 * Neighbors + insights for one node, restricted to the actor org's edges. Staff
 * with no org see all edges. The node's own type/id are validated as uuids by
 * the route layer.
 */
export async function getGraph(
  actor: Actor,
  entityType: EntityType,
  entityId: string,
): Promise<GraphResult> {
  const org = scopeOrg(actor);
  const staffGlobal = isStaff(actor) && !org;
  const orgParam = staffGlobal ? null : org;

  const rows = await q<EdgeRow>(
    `select id, from_type, from_id, to_type, to_id, edge_type, weight, revenue, last_at
       from relationship_edges
      where ($1::uuid is null or organization_id = $1)
        and ( (from_type = $2 and from_id = $3)
           or (to_type = $2 and to_id = $3) )
      order by weight desc, revenue desc, id asc
      limit 200`,
    [orgParam, entityType, entityId],
  );

  // Normalize every edge so the "center" node is always the `from` side for the
  // insight renderer (keeps strings readable: "<center> worked with <other>").
  const derived: DerivedEdge[] = rows.map((r) => {
    const centerIsFrom = r.from_type === entityType && r.from_id === entityId;
    return centerIsFrom
      ? {
          from_type: r.from_type,
          from_id: r.from_id,
          to_type: r.to_type,
          to_id: r.to_id,
          edge_type: r.edge_type,
          weight: r.weight,
          revenue: num(r.revenue),
          last_at: r.last_at,
        }
      : {
          from_type: r.to_type,
          from_id: r.to_id,
          to_type: r.from_type,
          to_id: r.from_id,
          edge_type: r.edge_type,
          weight: r.weight,
          revenue: num(r.revenue),
          last_at: r.last_at,
        };
  });

  // Collect node ids to resolve names for.
  const nodeKeys = new Map<string, { type: EntityType; id: string }>();
  nodeKeys.set(`${entityType}:${entityId}`, { type: entityType, id: entityId });
  for (const d of derived) {
    nodeKeys.set(`${d.to_type}:${d.to_id}`, { type: d.to_type, id: d.to_id });
  }
  const names = await resolveNames([...nodeKeys.values()]);
  const labelFor = (type: EntityType, id: string): string =>
    names.get(`${type}:${id}`) ?? type;

  const insights = graphInsights(derived, { nameFor: (t, id) => names.get(`${t}:${id}`) ?? null });

  const nodes: GraphNode[] = [...nodeKeys.values()].map((n) => ({
    type: n.type,
    id: n.id,
    label: labelFor(n.type, n.id),
  }));

  return {
    center: { type: entityType, id: entityId, label: labelFor(entityType, entityId) },
    nodes,
    edges: derived.map((d) => ({
      from_type: d.from_type,
      from_id: d.from_id,
      to_type: d.to_type,
      to_id: d.to_id,
      edge_type: d.edge_type,
      weight: d.weight,
      revenue: d.revenue,
      last_at: d.last_at,
    })),
    insights,
  };
}

// ---------------------------------------------------------------------------
// Single-edge upsert
// ---------------------------------------------------------------------------

export type UpsertEdgeInput = {
  from_type: EntityType;
  from_id: string;
  to_type: EntityType;
  to_id: string;
  edge_type: EdgeType;
  weight?: number;
  revenue?: number;
  last_at?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Insert or merge one edge owned by the actor's org (IDOR-safe). */
export async function upsertEdge(actor: Actor, input: UpsertEdgeInput): Promise<EdgeRow> {
  const org = scopeOrg(actor);
  const row = await q1<EdgeRow>(
    `insert into relationship_edges
       (organization_id, from_type, from_id, to_type, to_id, edge_type,
        weight, revenue, last_at, meta)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (from_type, from_id, to_type, to_id, edge_type)
     do update set weight = excluded.weight,
                   revenue = excluded.revenue,
                   last_at = coalesce(excluded.last_at, relationship_edges.last_at),
                   meta = coalesce(excluded.meta, relationship_edges.meta),
                   updated_at = now()
     returning id, from_type, from_id, to_type, to_id, edge_type, weight, revenue, last_at`,
    [
      org,
      input.from_type,
      input.from_id,
      input.to_type,
      input.to_id,
      input.edge_type,
      input.weight ?? 1,
      input.revenue ?? 0,
      input.last_at ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  );
  return row as EdgeRow;
}
