/**
 * Sponsor Activation visibility projection (live-ops phase, Part 23-24,
 * 2026-08-09). Pure, no DB -- matches the lib/incidentVisibility.ts /
 * lib/activityVisibility.ts convention.
 *
 * Deliberately simple: full (owner/planner) and venue coordinate every
 * sponsor's activation, since both need the whole floor picture. A sponsor
 * sees only their own org's items ("Sponsor own activation only", already
 * the command center's stated design for the sponsors field). Every other
 * audience (vendor, vendor_staff, event_staff) sees none -- sponsor
 * activation is not their concern, matching how the command center's
 * `sponsors` field is null for those audiences.
 *
 * Zero em dashes.
 */
import type { PacketAudience } from "./packetProjection.js";

export type SponsorActivationStatus = "not_started" | "in_progress" | "complete" | "issue";
export const SPONSOR_ACTIVATION_STATUSES: SponsorActivationStatus[] = [
  "not_started",
  "in_progress",
  "complete",
  "issue",
];

export type SponsorActivationRow = {
  id: string;
  event_id: string;
  sponsor_org_id: string;
  status: string;
};

export function isSponsorActivationVisible(
  item: SponsorActivationRow,
  audience: PacketAudience,
  ownOrgId: string | null,
): boolean {
  if (audience === "full" || audience === "venue") return true;
  if (audience === "sponsor") return !!ownOrgId && item.sponsor_org_id === ownOrgId;
  return false;
}

export function filterSponsorActivationsForAudience<T extends SponsorActivationRow>(
  items: T[],
  audience: PacketAudience,
  ownOrgId: string | null,
): T[] {
  return items.filter((i) => isSponsorActivationVisible(i, audience, ownOrgId));
}

export type SponsorActivationSummary = {
  total_sponsors: number;
  activations_total: number;
  activations_complete: number;
  activations_issue: number;
};

/** Aggregate counters for the command center's `sponsors` field, computed
 *  from whatever slice of rows the caller has already scoped to the right
 *  audience (full/venue get every row; a sponsor caller passes only their
 *  own org's rows). */
export function summarizeActivations(items: SponsorActivationRow[]): SponsorActivationSummary {
  const sponsorOrgs = new Set(items.map((i) => i.sponsor_org_id));
  return {
    total_sponsors: sponsorOrgs.size,
    activations_total: items.length,
    activations_complete: items.filter((i) => i.status === "complete").length,
    activations_issue: items.filter((i) => i.status === "issue").length,
  };
}
