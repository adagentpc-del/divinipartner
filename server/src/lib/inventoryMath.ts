/**
 * Event Inventory math (live-ops phase, Part 17-20, extended Part 21-22,
 * 2026-08-09). Pure, no DB -- matches the lib/arrivalStatus.ts /
 * lib/activityVisibility.ts convention.
 *
 * Every quantity here is DERIVED from the movement ledger
 * (db/eventInventory.ts's event_inventory_movements), never a stored,
 * independently-maintained counter that could drift.
 *
 * Zero em dashes.
 */

export type Movement = {
  item_id: string;
  quantity: number;
  from_location_id: string | null;
  to_location_id: string | null;
};

/** Net quantity of one item currently at one location. */
export function quantityAtLocation(movements: Movement[], itemId: string, locationId: string): number {
  let total = 0;
  for (const m of movements) {
    if (m.item_id !== itemId) continue;
    if (m.to_location_id === locationId) total += m.quantity;
    if (m.from_location_id === locationId) total -= m.quantity;
  }
  return total;
}

/** Net quantity of one item currently anywhere at the event (excludes
 *  anything that has left, i.e. moved to a null to_location). */
export function totalQuantity(movements: Movement[], itemId: string): number {
  let total = 0;
  for (const m of movements) {
    if (m.item_id !== itemId) continue;
    if (m.to_location_id != null) total += m.quantity;
    if (m.from_location_id != null) total -= m.quantity;
  }
  return total;
}

/** Cumulative quantity that has EVER arrived at the event from outside
 *  (any movement with a null from_location_id), regardless of later
 *  transfers or departures. Distinguishes "this never showed up" from
 *  "it arrived, was used, and has since been returned/departed" -- both
 *  read as a currentTotal of 0, but only the first is a real problem. */
export function cumulativeArrived(movements: Movement[], itemId: string): number {
  let total = 0;
  for (const m of movements) {
    if (m.item_id !== itemId) continue;
    if (m.from_location_id == null && m.to_location_id != null) total += m.quantity;
  }
  return total;
}

/** Every location an item currently has stock at, with its quantity --
 *  omits zero/negative entries (nothing there right now). */
export function quantitiesByLocation(movements: Movement[], itemId: string): Map<string, number> {
  const byLoc = new Map<string, number>();
  for (const m of movements) {
    if (m.item_id !== itemId) continue;
    if (m.to_location_id) byLoc.set(m.to_location_id, (byLoc.get(m.to_location_id) ?? 0) + m.quantity);
    if (m.from_location_id) byLoc.set(m.from_location_id, (byLoc.get(m.from_location_id) ?? 0) - m.quantity);
  }
  for (const [loc, qty] of byLoc) {
    if (qty <= 0) byLoc.delete(loc);
  }
  return byLoc;
}

export type InventoryAlert = {
  item_id: string;
  severity: "warning" | "critical";
  message: string;
};

/**
 * Deterministic, thresholded alerts -- "do not create noisy alerts
 * without useful thresholds." Only two conditions fire, both real and
 * actionable:
 *   1. Some of an item has arrived (cumulativeArrivedQty > 0) but it is
 *      still short of expected_quantity by more than 10% -- a genuine
 *      partial-delivery shortage, not "the first unit hasn't shown up yet."
 *   2. Nothing has arrived at all and expected_quantity is set -- flagged
 *      only as a warning (could just be early), never critical on its own.
 * Deliberately based on CUMULATIVE arrivals, not the current on-site
 * total: once an item has been fully counted out (returned/departed at
 * closeout, Part 21-22), currentTotal legitimately drops back to 0, which
 * is indistinguishable from "never arrived" if this used currentTotal --
 * that would falsely re-fire "none has arrived yet" on an item that in
 * fact showed up and was used. Damage/missing-based alerts are added once
 * Part 21-22's count-out workflow exists (those quantities do not exist
 * yet at this point in the build order) -- this function is the one place
 * to extend, not a new alert generator.
 */
export function inventoryAlerts(
  item: { id: string; name: string; expected_quantity: number | null },
  cumulativeArrivedQty: number,
): InventoryAlert[] {
  if (item.expected_quantity == null || item.expected_quantity <= 0) return [];
  const alerts: InventoryAlert[] = [];
  const shortfall = item.expected_quantity - cumulativeArrivedQty;
  const shortfallRatio = shortfall / item.expected_quantity;
  if (cumulativeArrivedQty > 0 && shortfallRatio > 0.1) {
    alerts.push({
      item_id: item.id,
      severity: shortfallRatio > 0.5 ? "critical" : "warning",
      message: `${item.name}: ${cumulativeArrivedQty} of ${item.expected_quantity} expected have arrived (${Math.round(shortfallRatio * 100)}% short).`,
    });
  } else if (cumulativeArrivedQty === 0) {
    alerts.push({
      item_id: item.id,
      severity: "warning",
      message: `${item.name}: none of the ${item.expected_quantity} expected have arrived yet.`,
    });
  }
  return alerts;
}
