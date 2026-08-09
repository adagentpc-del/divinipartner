/**
 * Regression tests for per-event vendor performance visibility (Part
 * 32-33). Locks in "Vendor own performance only": full/venue/finance
 * (resolved as canSeeAll by the caller) see every vendor; a vendor sees
 * only their own row.
 *
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVendorPerformanceVisible,
  filterVendorPerformanceForViewer,
  type VendorPerformanceRow,
} from "../server/src/lib/vendorPerformanceVisibility.ts";

const VENDOR_A: VendorPerformanceRow = { vendor_org_id: "org-a" };
const VENDOR_B: VendorPerformanceRow = { vendor_org_id: "org-b" };

test("canSeeAll (full/venue/finance) sees every vendor's row", () => {
  assert.equal(isVendorPerformanceVisible(VENDOR_A, true, null), true);
  assert.equal(isVendorPerformanceVisible(VENDOR_B, true, "org-a"), true);
});

test("a vendor sees only their own org's row", () => {
  assert.equal(isVendorPerformanceVisible(VENDOR_A, false, "org-a"), true);
  assert.equal(isVendorPerformanceVisible(VENDOR_B, false, "org-a"), false);
});

test("a viewer with no org and no canSeeAll sees nothing", () => {
  assert.equal(isVendorPerformanceVisible(VENDOR_A, false, null), false);
});

test("filterVendorPerformanceForViewer: a vendor's filtered list never includes another vendor's row", () => {
  const filtered = filterVendorPerformanceForViewer([VENDOR_A, VENDOR_B], false, "org-a");
  assert.deepEqual(filtered, [VENDOR_A]);
});
