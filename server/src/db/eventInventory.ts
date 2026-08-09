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
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { quantityAtLocation, totalQuantity, quantitiesByLocation, inventoryAlerts, type Movement, type InventoryAlert } from "../lib/inventoryMath.js";
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

/** Alerts (Part 20) derived from the same movement ledger, never stored. */
export async function listInventoryAlerts(actor: Actor, eventId: string): Promise<InventoryAlert[]> {
  const items = await listInventoryItems(actor, eventId);
  const alerts: InventoryAlert[] = [];
  for (const item of items) {
    alerts.push(
      ...inventoryAlerts(
        { id: item.id, name: item.name, expected_quantity: item.expected_quantity != null ? Number(item.expected_quantity) : null },
        item.current_total,
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
export async function recordMovement(actor: Actor, eventId: string, input: MovementInput): Promise<Movement> {
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
        item_id: string;
        quantity: string;
        from_location_id: string | null;
        to_location_id: string | null;
      }>(
        `insert into event_inventory_movements
           (event_id, item_id, quantity, from_location_id, to_location_id, kind, moved_by, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning item_id, quantity, from_location_id, to_location_id`,
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

    return { item_id: row.item_id, quantity: Number(row.quantity), from_location_id: row.from_location_id, to_location_id: row.to_location_id };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
