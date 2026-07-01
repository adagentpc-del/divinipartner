/**
 * Pricing V2 money math tests. Imports ONLY the pure pricingMath module (no DB,
 * no config), so it runs with zero side effects. Asserts exact cents.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOnTopCharge,
  decomposeGrossOnTop,
  venueShareOfFee,
} from "../server/src/lib/pricingMath.ts";

test("on-top fee at $5000 -> client 5250, vendor 5000, fee 250, venue 50", () => {
  const r = computeOnTopCharge(5000);
  assert.equal(r.platformFee, 250);
  assert.equal(r.vendorPayout, 5000);
  assert.equal(r.clientTotal, 5250);
  assert.equal(r.venueShare, 50);
  assert.equal(r.subtotal, 5000);
  assert.equal(r.feeRate, 0.05);
});

test("on-top fee at $2000 -> client 2100, vendor 2000, fee 100, venue 20", () => {
  const r = computeOnTopCharge(2000);
  assert.equal(r.platformFee, 100);
  assert.equal(r.vendorPayout, 2000);
  assert.equal(r.clientTotal, 2100);
  assert.equal(r.venueShare, 20);
});

test("on-top fee at $750 -> client 787.50, vendor 750, fee 37.50, venue 7.50", () => {
  const r = computeOnTopCharge(750);
  assert.equal(r.platformFee, 37.5);
  assert.equal(r.vendorPayout, 750);
  assert.equal(r.clientTotal, 787.5);
  assert.equal(r.venueShare, 7.5);
});

test("default rate is 5 percent and default venue fraction is 20 percent", () => {
  const r = computeOnTopCharge(1000);
  assert.equal(r.platformFee, 50);
  assert.equal(r.venueShare, 10);
});

test("explicit rate argument is honored", () => {
  const r = computeOnTopCharge(1000, 0.025);
  assert.equal(r.platformFee, 25);
  assert.equal(r.clientTotal, 1025);
  assert.equal(r.feeRate, 0.025);
});

test("decompose round-trips: decompose(round(Q*1.05)).subtotal === Q for a sweep", () => {
  const sizes = [
    0, 1, 5, 9, 10, 19, 25, 37.5, 50, 99, 100, 123.45, 250, 500, 750, 999.99,
    1000, 1234.56, 2000, 4999.99, 5000, 12345.67, 99999.99,
  ];
  for (const q of sizes) {
    const gross = Math.round(q * 1.05 * 100) / 100;
    const back = decomposeGrossOnTop(gross);
    assert.equal(
      back.subtotal,
      Math.round(q * 100) / 100,
      `subtotal mismatch for Q=${q} (gross=${gross}, got ${back.subtotal})`,
    );
  }
});

test("decompose: netPayout equals subtotal and no processing fee under V2", () => {
  const back = decomposeGrossOnTop(5250);
  assert.equal(back.subtotal, 5000);
  assert.equal(back.platformFee, 250);
  assert.equal(back.netPayout, 5000);
  assert.equal(back.processingFee, 0);
});

test("vendor is never shorted across a sweep (vendorPayout >= subtotal input)", () => {
  for (let s = 0; s <= 100000; s += 137.13) {
    const r = computeOnTopCharge(s);
    const base = Math.max(0, Math.round(s * 100) / 100);
    assert.ok(r.vendorPayout >= base, `vendor shorted at subtotal=${s}`);
    assert.equal(r.vendorPayout, base);
  }
});

test("platform fee is never negative", () => {
  for (const s of [-1000, -0.01, 0, 0.01, 1, 5000, 99999.99]) {
    const r = computeOnTopCharge(s);
    assert.ok(r.platformFee >= 0, `negative platform fee at subtotal=${s}`);
  }
  // Decomposition path too.
  for (const g of [-500, 0, 1, 100, 5250]) {
    const back = decomposeGrossOnTop(g);
    assert.ok(back.platformFee >= 0, `negative platform fee at gross=${g}`);
  }
});

test("venue share never exceeds the platform fee", () => {
  for (let s = 0; s <= 50000; s += 311.11) {
    const r = computeOnTopCharge(s);
    assert.ok(r.venueShare <= r.platformFee, `venue share > fee at subtotal=${s}`);
  }
  // venueShareOfFee clamps the fraction to [0, 1].
  assert.ok(venueShareOfFee(100, 5) <= 100);
  assert.equal(venueShareOfFee(100, 5), 100);
  assert.equal(venueShareOfFee(100, -1), 0);
  assert.equal(venueShareOfFee(250, 0.2), 50);
});

test("negative and non-numeric subtotals floor to a $0 charge", () => {
  const neg = computeOnTopCharge(-9999);
  assert.equal(neg.subtotal, 0);
  assert.equal(neg.platformFee, 0);
  assert.equal(neg.clientTotal, 0);
  assert.equal(neg.vendorPayout, 0);
  assert.equal(neg.venueShare, 0);
  const nan = computeOnTopCharge(Number("not-a-number"));
  assert.equal(nan.clientTotal, 0);
});
