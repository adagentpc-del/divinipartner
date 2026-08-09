/**
 * Regression test for a live-discovered, high-severity bug (found tracing the
 * vendor quote-submission flow end to end, ALFY2 pack post-audit product
 * pass, 2026-08-09): computeSubtotal only recognized a `qty` line-item field,
 * but every real caller (AutoQuoteDraft.tsx, the production vendor-quote UI;
 * bids.ts's vendor-quote route) sends `quantity`. Every vendor quote
 * submitted through the actual product silently landed on subtotal 0.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSubtotal } from "../server/src/lib/quoteMath.ts";

test("quantity field (the real production shape) computes a correct subtotal", () => {
  const subtotal = computeSubtotal([
    { name: "Full AV package", quantity: 1, unit_price: 6200 },
  ]);
  assert.equal(subtotal, 6200);
});

test("qty field (legacy/back-compat shape) still computes a correct subtotal", () => {
  const subtotal = computeSubtotal([{ label: "Item", qty: 2, unit_price: 100 }]);
  assert.equal(subtotal, 200);
});

test("amount field takes precedence over quantity*unit_price when both are present", () => {
  const subtotal = computeSubtotal([
    { name: "Flat-rate item", amount: 500, quantity: 1, unit_price: 6200 },
  ]);
  assert.equal(subtotal, 500);
});

test("exclusion-kind line items are never counted toward the subtotal", () => {
  const subtotal = computeSubtotal([
    { name: "Included service", quantity: 1, unit_price: 1000 },
    { name: "Excluded item", quantity: 1, unit_price: 500, kind: "exclusion" },
  ]);
  assert.equal(subtotal, 1000);
});

test("multiple real-shaped line items sum correctly", () => {
  const subtotal = computeSubtotal([
    { name: "Speakers", quantity: 2, unit_price: 800 },
    { name: "Technician", quantity: 1, unit_price: 600 },
  ]);
  assert.equal(subtotal, 2200);
});

test("a line item with neither amount nor a usable quantity/unit_price pair contributes 0, not NaN", () => {
  const subtotal = computeSubtotal([{ name: "Malformed item" }]);
  assert.equal(subtotal, 0);
});
