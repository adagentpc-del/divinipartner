/**
 * Event Inventory Model + Locations + Transfers (live-ops phase, Part
 * 17-20, 2026-08-09).
 *
 * Distinct from the pre-existing org-scoped supplier warehouse catalog
 * (server/src/db/inventory.ts, the `inventory_items` table) -- that is a
 * different domain (pre-event sellable/rentable stock) from this one
 * (day-of physical inventory tracked at one specific event).
 *
 * recordMovement() is the one write path for arrivals, transfers, and
 * departures -- it is wrapped in a transaction with a row lock on the
 * item (`select ... for update`), so two concurrent transfer requests
 * for the same item serialize rather than both succeeding against a
 * stale read, and each is validated against the CURRENT derived quantity
 * at the source location (never negative), and both locations must
 * belong to the SAME event as the item (never a cross-event transfer).
 *
 * Part 21-22 adds count-in/count-out reconciliation (countIn, countOut,
 * listInventoryCounts, resolveInventoryCount). Every count ALWAYS writes a
 * real movement via recordMovement (the one quantity ledger) -- counts are
 * never a second, disconnected tally. A tracking row in
 * event_inventory_counts is created ONLY when there is something to
 * reconcile: a count-in short of expected_quantity, or a count-out with
 * damaged/missing quantity. A clean count creates no row (no noisy
 * alerts). countOut() never auto-creates a change order or financial
 * charge for damaged/missing quantity -- resolution_note is a free-text
 * record of what was decided, not a liability assignment.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { quantityAtLocation, totalQuantity, cumulativeArrived, quantitiesByLocation, inventoryAlerts, type Movement, type InventoryAlert } from "../lib/inventoryMath.js";
import { recordActivity } from "./eventActivity.js";

export type LocationRow = {
  id: string;
  event_id: string;
  name: string;
  parent_id: string | null;
  floorplan_id: string | null;
  notes: string | null;
  created_at: string;
};

export async function createLocation(
  actor: Actor,
  eventId: string,
  input: { name: string; parent_id?: string | null; floorplan_id?: string | null; notes?: string | null },
): Promise<LocationRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can create event locations");
  }
  if (!input.name?.trim()) throw new ForbiddenError("location name is required");
  if (input.parent_id) {
    const parent = await q1<{ id: string }>(`select id from event_locations where id = $1 and event_id = $2`, [
      input.parent_id,
      eventId,
    ]);
    if (!parent) throw new ForbiddenError("parent location must belong to the same event");
  }
  return q1<LocationRow>(
    `insert into event_locations (event_id, name, parent_id, floorplan_id, notes)
     values ($1,$2,$3,$4,$5) returning *`,
    [eventId, input.name.trim(), input.parent_id ?? null, input.floorplan_id ?? null, input.notes ?? null],
  ) as Promise<LocationRow>;
}

export async function listLocations(actor: Actor, eventId: string): Promise<LocationRow[]> {
  await getEvent(actor, eventId);
  return q<LocationRow>(`select * from event_locations where event_id = $1 order by created_at asc`, [eventId]);
}

export type InventoryItemRow = {
  id: string;
  event_id: string;
  name: string;
  category: string;
  unit: string;
  expected_quantity: string | null;
  source_vendor_org_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryItemWithQuantity = InventoryItemRow & {
  current_total: number;
  by_location: Array<{ location_id: string; quantity: number }>;
};

export async function createInventoryItem(
  actor: Actor,
  eventId: string,
  input: {
    name: string;
    category: string;
    unit?: string;
    expected_quantity?: number | null;
    source_vendor_org_id?: string | null;
    notes?: string | null;
  },
): Promise<InventoryItemRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can add event inventory items");
  }
  if (!input.name?.trim()) throw new ForbiddenError("item name is required");
  return q1<InventoryItemRow>(
    `insert into event_inventory_items (event_id, name, category, unit, expected_quantity, source_vendor_org_id, notes)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      eventId,
      input.name.trim(),
      input.category,
      input.unit ?? "unit",
      input.expected_quantity ?? null,
      input.source_vendor_org_id ?? null,
      input.notes ?? null,
    ],
  ) as Promise<InventoryItemRow>;
}

async function movementsForEvent(eventId: string): Promise<Movement[]> {
  return q<Movement>(
    `select item_id, quantity::float8 as quantity, from_location_id, to_location_id
       from event_inventory_movements where event_id = $1`,
    [eventId],
  );
}

/** Every item with its derived current total and per-location breakdown --
 *  nothing here is a stored counter, it is computed fresh from the
 *  movement ledger on every call. */
export async function listInventoryItems(actor: Actor, eventId: string): Promise<InventoryItemWithQuantity[]> {
  await getEvent(actor, eventId);
  const [items, movements] = await Promise.all([
    q<InventoryItemRow>(`select * from event_inventory_items where event_id = $1 order by created_at asc`, [eventId]),
    movementsForEvent(eventId),
  ]);
  return items.map((item) => {
    const byLoc = quantitiesByLocation(movements, item.id);
    return {
      ...item,
      current_total: totalQuantity(movements, item.id),
      by_location: [...byLoc.entries()].map(([location_id, quantity]) => ({ location_id, quantity })),
    };
  });
}

/** Alerts (Part 20, corrected Part 21-22) derived from the same movement
 *  ledger, never stored. Uses cumulative arrivals, not current on-site
 *  total, so an item that fully arrived and was later returned/departed
 *  (Part 21-22 count-out) does not falsely re-trigger "none has arrived
 *  yet." */
export async function listInventoryAlerts(actor: Actor, eventId: string): Promise<InventoryAlert[]> {
  await getEvent(actor, eventId);
  const [items, movements] = await Promise.all([
    q<InventoryItemRow>(`select * from event_inventory_items where event_id = $1 order by created_at asc`, [eventId]),
    movementsForEvent(eventId),
  ]);
  const alerts: InventoryAlert[] = [];
  for (const item of items) {
    alerts.push(
      ...inventoryAlerts(
        { id: item.id, name: item.name, expected_quantity: item.expected_quantity != null ? Number(item.expected_quantity) : null },
        cumulativeArrived(movements, item.id),
      ),
    );
  }
  return alerts;
}

export type MovementInput = {
  item_id: string;
  quantity: number;
  from_location_id?: string | null;
  to_location_id?: string | null;
  kind?: string;
  reason?: string | null;
};

async function canMoveItem(actor: Actor, eventId: string, item: { source_vendor_org_id: string | null }): Promise<boolean> {
  if (await canManageEvent(actor, eventId)) return true;
  const role = await getEventRole(actor, eventId);
  if (role === "venue") return true;
  if (role === "vendor_owner" && actor.org?.id && item.source_vendor_org_id && actor.org.id === item.source_vendor_org_id) {
    return true;
  }
  return false;
}

/**
 * Record an arrival, transfer, or departure. Transactional with a row
 * lock on the item so two concurrent requests for the same item never
 * both succeed against a stale quantity read (Part 42's "simultaneous
 * inventory transfer" concurrency scenario). Rejects: a negative result
 * at the source location, a location that does not belong to the same
 * event as the item, and an actor with no authority to move this
 * specific item.
 */
export async function recordMovement(actor: Actor, eventId: string, input: MovementInput): Promise<Movement & { id: string }> {
  await getEvent(actor, eventId);
  if (!(input.quantity > 0)) throw new ForbiddenError("quantity must be a positive number");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const item = (
      await client.query<{ id: string; event_id: string; source_vendor_org_id: string | null }>(
        `select id, event_id, source_vendor_org_id from event_inventory_items where id = $1 for update`,
        [input.item_id],
      )
    ).rows[0];
    if (!item) throw new NotFoundError("inventory item not found");
    if (item.event_id !== eventId) {
      throw new ForbiddenError("this item does not belong to this event");
    }
    if (!(await canMoveItem(actor, eventId, item))) {
      throw new ForbiddenError("you do not have authority to move this inventory item");
    }

    for (const locId of [input.from_location_id, input.to_location_id]) {
      if (!locId) continue;
      const loc = (await client.query<{ id: string }>(`select id from event_locations where id = $1 and event_id = $2`, [
        locId,
        eventId,
      ])).rows[0];
      if (!loc) throw new ForbiddenError("a transfer location must belong to the same event as the item");
    }

    if (input.from_location_id) {
      const existing = (
        await client.query<Movement>(
          `select item_id, quantity::float8 as quantity, from_location_id, to_location_id
             from event_inventory_movements where event_id = $1 and item_id = $2`,
          [eventId, input.item_id],
        )
      ).rows;
      const available = quantityAtLocation(existing, input.item_id, input.from_location_id);
      if (available < input.quantity) {
        throw new ForbiddenError(
          `not enough stock at the source location: ${available} available, ${input.quantity} requested`,
        );
      }
    }

    const row = (
      await client.query<{
        id: string;
        item_id: string;
        quantity: string;
        from_location_id: string | null;
        to_location_id: string | null;
      }>(
        `insert into event_inventory_movements
           (event_id, item_id, quantity, from_location_id, to_location_id, kind, moved_by, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, item_id, quantity, from_location_id, to_location_id`,
        [
          eventId,
          input.item_id,
          input.quantity,
          input.from_location_id ?? null,
          input.to_location_id ?? null,
          input.kind ?? "transfer",
          actor.user.id,
          input.reason ?? null,
        ],
      )
    ).rows[0];
    await client.query("commit");

    await recordActivity(actor, eventId, {
      category: "inventory",
      message: `Inventory moved: ${input.quantity} unit(s)${input.from_location_id ? " transferred" : " arrived"}${input.to_location_id ? "" : " (departed)"}`,
      relatedEntityType: "event_inventory_item",
      relatedEntityId: input.item_id,
    }).catch(() => undefined);

    return {
      id: row.id,
      item_id: row.item_id,
      quantity: Number(row.quantity),
      from_location_id: row.from_location_id,
      to_location_id: row.to_location_id,
    };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================================
// COUNT-IN / COUNT-OUT (Part 21-22)
// ============================================================================
//
// A count-in/count-out always writes a real recordMovement() row first --
// the quantity ledger stays single-sourced. event_inventory_counts is only
// created when there is something to reconcile: a count-in short of
// expected, or a count-out with damaged/missing quantity. A clean count
// needs no resolution workflow and creates no row here.

export type InventoryCountRow = {
  id: string;
  event_id: string;
  item_id: string;
  movement_id: string | null;
  kind: string;
  expected_quantity: string | null;
  counted_quantity: string;
  status: string;
  notes: string | null;
  resolution_note: string | null;
  counted_by: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Count In (Part 21): the formal vendor-delivery count against
 * expected_quantity. Always records a real arrival movement
 * (from=null -> to=location). If the item's cumulative arrived total
 * after this count is still short of expected_quantity, opens a
 * trackable shortage record (status 'open') for owner/planner
 * acknowledgment/resolution -- a clean, fully-delivered count opens no
 * such record.
 */
export async function countIn(
  actor: Actor,
  eventId: string,
  input: { item_id: string; location_id: string; counted_quantity: number; notes?: string | null },
): Promise<{ movement: Movement & { id: string }; count: InventoryCountRow | null }> {
  const movement = await recordMovement(actor, eventId, {
    item_id: input.item_id,
    quantity: input.counted_quantity,
    to_location_id: input.location_id,
    kind: "count_in",
    reason: input.notes ?? "count-in",
  });

  const item = await q1<{ expected_quantity: string | null }>(
    `select expected_quantity from event_inventory_items where id = $1`,
    [input.item_id],
  );
  const expected = item?.expected_quantity != null ? Number(item.expected_quantity) : null;
  const movements = await q<Movement>(
    `select item_id, quantity::float8 as quantity, from_location_id, to_location_id
       from event_inventory_movements where event_id = $1 and item_id = $2`,
    [eventId, input.item_id],
  );
  const arrivedSoFar = cumulativeArrived(movements, input.item_id);

  let count: InventoryCountRow | null = null;
  if (expected != null && arrivedSoFar < expected) {
    count = await q1<InventoryCountRow>(
      `insert into event_inventory_counts
         (event_id, item_id, movement_id, kind, expected_quantity, counted_quantity, status, notes, counted_by)
       values ($1,$2,$3,'count_in',$4,$5,'open',$6,$7)
       returning *`,
      [eventId, input.item_id, movement.id, expected, arrivedSoFar, input.notes ?? null, actor.user.id],
    );
  }
  return { movement, count };
}

/**
 * Count Out (Part 22): at close, record what actually came back.
 * returned_quantity + damaged_quantity + missing_quantity together leave
 * the location in one departure movement (to=null). Damaged and missing
 * quantities each open a trackable record for the resolution workflow --
 * NEVER an automatic financial charge (spec constraint: "do not
 * automatically assign financial liability"). A fully clean return opens
 * no record.
 */
export async function countOut(
  actor: Actor,
  eventId: string,
  input: {
    item_id: string;
    location_id: string;
    returned_quantity: number;
    damaged_quantity?: number;
    missing_quantity?: number;
    notes?: string | null;
  },
): Promise<{ movement: Movement & { id: string }; counts: InventoryCountRow[] }> {
  const damaged = input.damaged_quantity ?? 0;
  const missing = input.missing_quantity ?? 0;
  const total = input.returned_quantity + damaged + missing;
  if (!(total > 0)) throw new ForbiddenError("count-out total must be a positive number");

  const movement = await recordMovement(actor, eventId, {
    item_id: input.item_id,
    quantity: total,
    from_location_id: input.location_id,
    kind: "count_out",
    reason: input.notes ?? "count-out",
  });

  const counts: InventoryCountRow[] = [];
  for (const [status, qty] of [
    ["damaged", damaged],
    ["missing", missing],
  ] as const) {
    if (qty <= 0) continue;
    const row = await q1<InventoryCountRow>(
      `insert into event_inventory_counts
         (event_id, item_id, movement_id, kind, counted_quantity, status, notes, counted_by)
       values ($1,$2,$3,'count_out',$4,$5,$6,$7)
       returning *`,
      [eventId, input.item_id, movement.id, qty, status, input.notes ?? null, actor.user.id],
    );
    if (row) counts.push(row);
  }
  return { movement, counts };
}

/** Role-scoped: owner/planner/venue see every count issue; a vendor sees
 *  only issues on items they sourced -- the same isolation rule
 *  recordMovement()'s canMoveItem already enforces for the underlying
 *  movements. */
export async function listInventoryCounts(actor: Actor, eventId: string): Promise<InventoryCountRow[]> {
  await getEvent(actor, eventId);
  const role = await getEventRole(actor, eventId);
  if (role === "vendor_owner" || role === "vendor_staff") {
    if (!actor.org?.id) return [];
    return q<InventoryCountRow>(
      `select c.* from event_inventory_counts c
         join event_inventory_items i on i.id = c.item_id
        where c.event_id = $1 and i.source_vendor_org_id = $2
        order by c.created_at desc`,
      [eventId, actor.org.id],
    );
  }
  if (role !== "venue" && !(await canManageEvent(actor, eventId))) return [];
  return q<InventoryCountRow>(`select * from event_inventory_counts where event_id = $1 order by created_at desc`, [
    eventId,
  ]);
}

/** Resolve/acknowledge/dispute a count issue -- owner/planner only. Never
 *  creates a financial record; resolution_note is a free-text decision
 *  log, not a charge. */
export async function resolveInventoryCount(
  actor: Actor,
  eventId: string,
  countId: string,
  input: { status: "acknowledged" | "disputed" | "resolved" | "confirmed_returned"; resolution_note?: string | null },
): Promise<InventoryCountRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can resolve an inventory count issue");
  }
  const row = await q1<InventoryCountRow>(
    `update event_inventory_counts
        set status = $3, resolution_note = coalesce($4, resolution_note),
            resolved_by = $5, resolved_at = case when $3 = 'resolved' then now() else resolved_at end
      where id = $1 and event_id = $2
      returning *`,
    [countId, eventId, input.status, input.resolution_note ?? null, actor.user.id],
  );
  if (!row) throw new NotFoundError("inventory count issue not found");
  return row;
}
