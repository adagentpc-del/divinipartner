/**
 * Lifecycle self-maintenance - auto-close + relationship-graph refresh.
 *
 * Two gaps are closed here:
 *
 *  (1) AUTO-CLOSE. When a terminal event fires (a quote is accepted, a sponsor
 *      purchase is paid), the deal is advanced to its won/closed state and
 *      closed_at is stamped. This is IDEMPOTENT: the UPDATE only matches rows
 *      whose closed_at is still NULL, so re-firing the same terminal event is a
 *      no-op (it never double-closes, never re-stamps, never reopens). The
 *      function reports whether it was the FIRST close, so callers only run the
 *      side effects (graph refresh) once.
 *
 *  (2) RELATIONSHIP GRAPH REFRESH. The graph (relationship_edges) was only ever
 *      rebuilt wholesale by db/relationship.ts::rebuildEdges(actor). On a deal
 *      close we instead do an INCREMENTAL upsert of just the affected edges
 *      (the parties on this one deal), bumping weight by 1 and adding the deal
 *      revenue, merged on the table's existing unique constraint
 *      (from_type, from_id, to_type, to_id, edge_type). This is cheaper than a
 *      full recompute and keeps the graph live as deals close. It is BEST-EFFORT:
 *      refreshRelationshipGraphFor never throws, so a graph hiccup can never
 *      block or roll back the terminal-event transaction.
 *
 * Server imports use the .js extension per project convention. Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import type { EntityType, EdgeType } from "../lib/relationshipGraph.js";

// ---------------------------------------------------------------------------
// Incremental relationship-edge refresh
// ---------------------------------------------------------------------------

/** One edge to (re)apply incrementally. weight/revenue ADD to the stored edge. */
export type EdgeDelta = {
  organization_id: string | null;
  from_type: EntityType;
  from_id: string | null;
  to_type: EntityType;
  to_id: string | null;
  edge_type: EdgeType;
  weight?: number;
  revenue?: number;
  last_at?: string | null;
};

/**
 * Incrementally upsert a batch of edges. For an existing edge the weight and
 * revenue are INCREMENTED (deal count + dollars accrue), and last_at advances to
 * the most recent. A brand-new edge is inserted with the supplied deltas. Merged
 * on the relationship_edges unique constraint. Best-effort and self-contained: a
 * single transaction that swallows its own errors so the caller is never blocked
 * (the wholesale rebuildEdges(actor) path remains available as a backstop).
 *
 * Returns the number of edges applied (0 on any failure).
 */
export async function applyEdgeDeltas(edges: EdgeDelta[]): Promise<number> {
  const valid = edges.filter(
    (e) => e.from_id && e.to_id && e.from_id !== e.to_id,
  );
  if (valid.length === 0) return 0;

  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query("begin");
    for (const e of valid) {
      await client.query(
        `insert into relationship_edges
           (organization_id, from_type, from_id, to_type, to_id, edge_type,
            weight, revenue, last_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (from_type, from_id, to_type, to_id, edge_type)
         do update set weight = relationship_edges.weight + excluded.weight,
                       revenue = relationship_edges.revenue + excluded.revenue,
                       last_at = greatest(
                         coalesce(relationship_edges.last_at, excluded.last_at),
                         coalesce(excluded.last_at, relationship_edges.last_at)
                       ),
                       organization_id = coalesce(
                         relationship_edges.organization_id, excluded.organization_id),
                       updated_at = now()`,
        [
          e.organization_id,
          e.from_type,
          e.from_id,
          e.to_type,
          e.to_id,
          e.edge_type,
          e.weight ?? 1,
          e.revenue ?? 0,
          e.last_at ?? null,
        ],
      );
      applied++;
    }
    await client.query("commit");
    return applied;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    console.error("applyEdgeDeltas failed (non-fatal):", err);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Refresh the relationship edges implied by a closed QUOTE deal. The parties are
 * the event's venue + client and the quote's vendor. We bump the worked_together
 * pair counts and the revenue edge (with the quote total) for this single deal.
 * Best-effort: never throws.
 */
export async function refreshRelationshipGraphForQuote(quoteId: string): Promise<void> {
  try {
    const row = await q1<{
      vendor_id: string | null;
      venue_id: string | null;
      client_id: string | null;
      organization_id: string | null;
      total: string | number | null;
      closed_at: string | null;
    }>(
      `select qt.vendor_id,
              e.venue_id,
              e.client_id,
              e.organization_id,
              qt.total,
              qt.closed_at
         from quotes qt
         left join events e on e.id = qt.event_id
        where qt.id = $1`,
      [quoteId],
    );
    if (!row) return;
    const at = row.closed_at ?? new Date().toISOString();
    const amt = numeric(row.total);
    const org = row.organization_id ?? null;

    const deltas: EdgeDelta[] = [
      // venue <-> vendor worked together on this closed deal
      edge(org, "venue", row.venue_id, "vendor", row.vendor_id, "worked_together", { last_at: at }),
      // client <-> vendor worked together
      edge(org, "client", row.client_id, "vendor", row.vendor_id, "worked_together", { last_at: at }),
      // revenue edges carry the dollar amount
      edge(org, "venue", row.venue_id, "vendor", row.vendor_id, "revenue", { revenue: amt, last_at: at }),
      edge(org, "client", row.client_id, "vendor", row.vendor_id, "revenue", { revenue: amt, last_at: at }),
    ].filter((d): d is EdgeDelta => d !== null);

    await applyEdgeDeltas(deltas);
  } catch (err) {
    console.error("refreshRelationshipGraphForQuote failed (non-fatal):", err);
  }
}

/**
 * Refresh the relationship edges implied by a closed SPONSOR PURCHASE. The
 * parties are the sponsor org and the nonprofit org that owns the package. We
 * bump a sponsor_history edge and a revenue edge (with the purchase amount).
 * Best-effort: never throws.
 */
export async function refreshRelationshipGraphForSponsorPurchase(
  purchaseId: string,
): Promise<void> {
  try {
    const row = await q1<{
      sponsor_org_id: string | null;
      nonprofit_org_id: string | null;
      amount: string | number | null;
      closed_at: string | null;
    }>(
      `select sp.sponsor_org_id,
              pk.organization_id as nonprofit_org_id,
              sp.amount,
              sp.closed_at
         from sponsor_purchases sp
         left join sponsorship_packages pk on pk.id = sp.sponsorship_package_id
        where sp.id = $1`,
      [purchaseId],
    );
    if (!row) return;
    const at = row.closed_at ?? new Date().toISOString();
    const amt = numeric(row.amount);
    // The owning org of the edge is the nonprofit that hosts the sponsorship.
    const org = row.nonprofit_org_id ?? row.sponsor_org_id ?? null;

    const deltas: EdgeDelta[] = [
      edge(org, "sponsor", row.sponsor_org_id, "organization", row.nonprofit_org_id, "sponsor_history", {
        last_at: at,
      }),
      edge(org, "sponsor", row.sponsor_org_id, "organization", row.nonprofit_org_id, "revenue", {
        revenue: amt,
        last_at: at,
      }),
    ].filter((d): d is EdgeDelta => d !== null);

    await applyEdgeDeltas(deltas);
  } catch (err) {
    console.error("refreshRelationshipGraphForSponsorPurchase failed (non-fatal):", err);
  }
}

// ---------------------------------------------------------------------------
// Auto-close (idempotent)
// ---------------------------------------------------------------------------

/**
 * Auto-close a QUOTE on its won terminal event (quote accepted). Advances the
 * quote to 'accepted' and stamps closed_at, but ONLY if it has not already been
 * closed (closed_at is null). Returns { firstClose } so the caller runs the
 * graph refresh exactly once. Idempotent: a second call is a no-op and returns
 * firstClose = false (never re-stamps, never reopens).
 *
 * The route already calls quotes.setQuoteStatus(id, 'accepted'); this stamps the
 * close moment alongside it without changing that contract. Calling this is
 * harmless even if the status was set separately.
 */
export async function autoCloseQuote(quoteId: string): Promise<{ firstClose: boolean }> {
  const row = await q1<{ id: string }>(
    `update quotes
        set status = 'accepted',
            closed_at = now()
      where id = $1
        and closed_at is null
      returning id`,
    [quoteId],
  );
  const firstClose = !!row;
  if (firstClose) await refreshRelationshipGraphForQuote(quoteId);
  return { firstClose };
}

/**
 * Auto-close a SPONSOR PURCHASE on its terminal event (payment recorded).
 * Stamps closed_at if not already closed. The status is set to 'paid' by the
 * existing markPaid path; here we only record the close moment and trigger the
 * graph refresh once. Idempotent on closed_at.
 */
export async function autoCloseSponsorPurchase(
  purchaseId: string,
): Promise<{ firstClose: boolean }> {
  const row = await q1<{ id: string }>(
    `update sponsor_purchases
        set closed_at = now()
      where id = $1
        and closed_at is null
      returning id`,
    [purchaseId],
  );
  const firstClose = !!row;
  if (firstClose) await refreshRelationshipGraphForSponsorPurchase(purchaseId);
  return { firstClose };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function numeric(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
  return 0;
}

function edge(
  organization_id: string | null,
  from_type: EntityType,
  from_id: string | null,
  to_type: EntityType,
  to_id: string | null,
  edge_type: EdgeType,
  opts: { weight?: number; revenue?: number; last_at?: string | null } = {},
): EdgeDelta | null {
  if (!from_id || !to_id || from_id === to_id) return null;
  return {
    organization_id,
    from_type,
    from_id,
    to_type,
    to_id,
    edge_type,
    weight: opts.weight ?? 1,
    revenue: opts.revenue ?? 0,
    last_at: opts.last_at ?? null,
  };
}
