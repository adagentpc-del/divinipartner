/**
 * Regression tests for Event Inventory math (lib/inventoryMath.ts).
 * Every quantity is derived from a movement ledger; these tests lock in
 * the arithmetic and the alert thresholds ("do not create noisy alerts
 * without useful thresholds").
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quantityAtLocation,
  totalQuantity,
  quantitiesByLocation,
  inventoryAlerts,
  type Movement,
} from "../server/src/lib/inventoryMath.ts";

const ITEM = "item-champagne";
const MAIN_BAR = "loc-main-bar";
const VIP_BAR = "loc-vip-bar";

test("an arrival (from=null) increases quantity at the destination", () => {
  const movements: Movement[] = [{ item_id: ITEM, quantity: 144, from_location_id: null, to_location_id: MAIN_BAR }];
  assert.equal(quantityAtLocation(movements, ITEM, MAIN_BAR), 144);
  assert.equal(totalQuantity(movements, ITEM), 144);
});

test("a transfer moves quantity from one location to another without changing the total", () => {
  const movements: Movement[] = [
    { item_id: ITEM, quantity: 144, from_location_id: null, to_location_id: MAIN_BAR },
    { item_id: ITEM, quantity: 12, from_location_id: MAIN_BAR, to_location_id: VIP_BAR },
  ];
  assert.equal(quantityAtLocation(movements, ITEM, MAIN_BAR), 132);
  assert.equal(quantityAtLocation(movements, ITEM, VIP_BAR), 12);
  assert.equal(totalQuantity(movements, ITEM), 144);
});

test("a departure (to=null) decreases the total (returned/disposed/lost)", () => {
  const movements: Movement[] = [
    { item_id: ITEM, quantity: 144, from_location_id: null, to_location_id: MAIN_BAR },
    { item_id: ITEM, quantity: 10, from_location_id: MAIN_BAR, to_location_id: null },
  ];
  assert.equal(quantityAtLocation(movements, ITEM, MAIN_BAR), 134);
  assert.equal(totalQuantity(movements, ITEM), 134);
});

test("movements for a different item are ignored", () => {
  const movements: Movement[] = [
    { item_id: ITEM, quantity: 100, from_location_id: null, to_location_id: MAIN_BAR },
    { item_id: "item-other", quantity: 50, from_location_id: null, to_location_id: MAIN_BAR },
  ];
  assert.equal(quantityAtLocation(movements, ITEM, MAIN_BAR), 100);
});

test("quantitiesByLocation omits locations that have been fully drained to zero", () => {
  const movements: Movement[] = [
    { item_id: ITEM, quantity: 12, from_location_id: null, to_location_id: MAIN_BAR },
    { item_id: ITEM, quantity: 12, from_location_id: MAIN_BAR, to_location_id: VIP_BAR },
  ];
  const byLoc = quantitiesByLocation(movements, ITEM);
  assert.equal(byLoc.has(MAIN_BAR), false);
  assert.equal(byLoc.get(VIP_BAR), 12);
});

test("inventoryAlerts: nothing has arrived yet -> a warning, not critical", () => {
  const alerts = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 0);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "warning");
});

test("inventoryAlerts: a small, expected variance (under 10% short) does not alert", () => {
  const alerts = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 140);
  assert.deepEqual(alerts, []);
});

test("inventoryAlerts: a real partial-delivery shortage (over 10% short) warns", () => {
  const alerts = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 100);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "warning");
});

test("inventoryAlerts: a severe shortage (over 50% short) escalates to critical", () => {
  const alerts = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 50);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "critical");
});

test("inventoryAlerts: fully delivered (meets or exceeds expected) never alerts", () => {
  const alerts = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 144);
  assert.deepEqual(alerts, []);
  const over = inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: 144 }, 150);
  assert.deepEqual(over, []);
});

test("inventoryAlerts: no expected_quantity set means nothing to compare against, no alert", () => {
  assert.deepEqual(inventoryAlerts({ id: ITEM, name: "Champagne", expected_quantity: null }, 0), []);
});
