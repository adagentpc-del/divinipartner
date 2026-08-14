/**
 * Vendor Event Performance visibility projection (live-ops phase, Part
 * 32-33, 2026-08-09). Pure, no DB.
 *
 * Deliberately NOT built on lib/packetProjection.ts's PacketAudience --
 * audienceForRole() collapses the 'finance' event role into the same
 * "event_staff" bucket as an actual event_staff member (packetProjection.ts's
 * own comment: no richer projection exists for it), which would make
 * finance indistinguishable from event_staff here. Finance needs the
 * same "see every vendor's performance" access as full/venue (matching
 * db/reconciliation.ts's requireFinanceAccess), so the caller resolves
 * that directly from the real EventRole (db/eventMembers.ts's
 * getEventRole) and passes a plain boolean instead.
 *
 * full/venue/finance coordinate every vendor's performance on this
 * event -- they are the roles that actually need to compare vendors
 * against each other. A vendor sees only their own row ("Vendor own
 * performance only," the same isolation rule already applied to sponsor
 * activation) -- a vendor must never see a rival vendor's review scores
 * or completion notes from the same event. Every other role sees none.
 *
 * Zero em dashes.
 */
export type VendorPerformanceRow = {
  vendor_org_id: string;
};

export function isVendorPerformanceVisible(
  row: VendorPerformanceRow,
  canSeeAll: boolean,
  ownOrgId: string | null,
): boolean {
  if (canSeeAll) return true;
  return !!ownOrgId && row.vendor_org_id === ownOrgId;
}

export function filterVendorPerformanceForViewer<T extends VendorPerformanceRow>(
  rows: T[],
  canSeeAll: boolean,
  ownOrgId: string | null,
): T[] {
  return rows.filter((r) => isVendorPerformanceVisible(r, canSeeAll, ownOrgId));
}
