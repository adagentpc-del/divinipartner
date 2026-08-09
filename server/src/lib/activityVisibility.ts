/**
 * Live Activity Timeline visibility projection (live-ops phase, Part 12,
 * 2026-08-09). Pure, no DB -- matches the lib/packetProjection.ts
 * convention.
 *
 * Not every activity row is visible to every role (Part 12's own
 * examples): a vendor check-in is broadly visible (operational
 * awareness), a financial/settlement event is finance-only, a
 * medical/security incident is restricted, a sponsor activation is
 * relevant-scope only. Each category has a default visibility scope
 * (DEFAULT_CATEGORY_SCOPE); an individual row can narrow (never widen)
 * that default via its own explicit visibility_scope, e.g. a specific
 * incident marked restricted beyond the category default.
 *
 * A row is visible to an actor if any of:
 *   1. the actor's own audience is in the row's effective scope, or
 *   2. the row is attributed to the actor's own organization, or
 *   3. the row is attributed to the actor themself (their own action).
 * (2) and (3) exist so a vendor always sees their own check-in/action even
 * if the category default were narrower than their audience.
 *
 * Zero em dashes.
 */
import type { PacketAudience } from "./packetProjection.js";

export type ActivityCategory =
  | "check_in"
  | "task"
  | "schedule"
  | "status"
  | "change"
  | "incident"
  | "inventory"
  | "sponsor"
  | "closeout"
  | "guest";

export type ActivitySeverity = "info" | "warning" | "critical";

export type ActivityRow = {
  id: string;
  event_id: string;
  actor_id: string | null;
  actor_org_id: string | null;
  category: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  message: string;
  payload: unknown;
  severity: string;
  visibility_scope: string[] | null;
  created_at: string;
};

/** Every audience bucket except full is intentionally never the DEFAULT for
 *  categories with real financial or safety sensitivity -- those stay
 *  full-only unless a specific row explicitly widens itself. */
export const DEFAULT_CATEGORY_SCOPE: Record<ActivityCategory, PacketAudience[]> = {
  check_in: ["full", "venue", "vendor", "vendor_staff"],
  task: ["full", "venue", "vendor", "vendor_staff", "event_staff"],
  schedule: ["full", "venue", "vendor", "vendor_staff"],
  status: ["full", "venue", "vendor", "vendor_staff", "event_staff", "sponsor"],
  change: ["full"],
  incident: ["full"],
  inventory: ["full", "venue"],
  sponsor: ["full", "sponsor"],
  closeout: ["full"],
  guest: ["full"],
};

function isKnownCategory(c: string): c is ActivityCategory {
  return Object.prototype.hasOwnProperty.call(DEFAULT_CATEGORY_SCOPE, c);
}

export function isActivityVisible(
  row: ActivityRow,
  audience: PacketAudience,
  ownOrgId: string | null,
  ownUserId: string,
): boolean {
  if (row.actor_id && row.actor_id === ownUserId) return true;
  if (row.actor_org_id && ownOrgId && row.actor_org_id === ownOrgId) return true;
  const scope = row.visibility_scope ?? (isKnownCategory(row.category) ? DEFAULT_CATEGORY_SCOPE[row.category] : ["full"]);
  return scope.includes(audience);
}

export function filterActivityForAudience(
  rows: ActivityRow[],
  audience: PacketAudience,
  ownOrgId: string | null,
  ownUserId: string,
): ActivityRow[] {
  return rows.filter((r) => isActivityVisible(r, audience, ownOrgId, ownUserId));
}
