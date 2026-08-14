/**
 * Incident Management visibility projection (live-ops phase, Part 15-16,
 * 2026-08-09). Pure, no DB -- matches the lib/activityVisibility.ts /
 * lib/packetProjection.ts convention.
 *
 * "Do not expose: medical detail, guest PII, security detail, internal
 * investigations to general vendors or sponsors." Medical, security, and
 * guest categories are full (owner/planner) only by default. Operational
 * categories (vendor/venue/equipment/inventory/weather/transportation/
 * safety/damage) default to full + venue, since the venue is the one
 * non-owner role that genuinely needs day-of incident awareness for
 * coordination. `other` defaults to full only, the conservative choice
 * for an uncategorized report.
 *
 * The `restricted` flag is a hard cap: when true, ONLY full (owner/
 * planner), the assigned responder, and the original reporter may see
 * the incident, regardless of what the category default would otherwise
 * allow -- this is how "internal investigations" stay internal even for
 * a category that would normally be venue-visible.
 *
 * Zero em dashes.
 */
import type { PacketAudience } from "./packetProjection.js";

export type IncidentCategory =
  | "medical"
  | "security"
  | "vendor"
  | "guest"
  | "venue"
  | "equipment"
  | "inventory"
  | "weather"
  | "transportation"
  | "safety"
  | "damage"
  | "other";

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "medical",
  "security",
  "vendor",
  "guest",
  "venue",
  "equipment",
  "inventory",
  "weather",
  "transportation",
  "safety",
  "damage",
  "other",
];

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "assigned" | "monitoring" | "resolved" | "closed";

/** Categories that are restricted by default when a caller does not
 *  explicitly set `restricted` -- see db/incidents.ts's createIncident. */
export const RESTRICTED_BY_DEFAULT_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(["medical", "security", "guest"]);

export const DEFAULT_INCIDENT_SCOPE: Record<IncidentCategory, PacketAudience[]> = {
  medical: ["full"],
  security: ["full"],
  guest: ["full"],
  vendor: ["full", "venue"],
  venue: ["full", "venue"],
  equipment: ["full", "venue"],
  inventory: ["full", "venue"],
  weather: ["full", "venue"],
  transportation: ["full", "venue"],
  safety: ["full", "venue"],
  damage: ["full", "venue"],
  other: ["full"],
};

export type IncidentRow = {
  id: string;
  event_id: string;
  category: string;
  severity: string;
  location: string | null;
  description: string;
  submitted_by: string | null;
  assigned_to: string | null;
  status: string;
  resolution: string | null;
  restricted: boolean;
  attachments: unknown;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function isKnownCategory(c: string): c is IncidentCategory {
  return Object.prototype.hasOwnProperty.call(DEFAULT_INCIDENT_SCOPE, c);
}

export function isIncidentVisible(
  incident: IncidentRow,
  audience: PacketAudience,
  ownUserId: string,
): boolean {
  if (audience === "full") return true;
  if (incident.submitted_by && incident.submitted_by === ownUserId) return true;
  if (incident.assigned_to && incident.assigned_to === ownUserId) return true;
  if (incident.restricted) return false;
  const scope = isKnownCategory(incident.category) ? DEFAULT_INCIDENT_SCOPE[incident.category] : ["full"];
  return scope.includes(audience);
}

export function filterIncidentsForAudience(
  incidents: IncidentRow[],
  audience: PacketAudience,
  ownUserId: string,
): IncidentRow[] {
  return incidents.filter((i) => isIncidentVisible(i, audience, ownUserId));
}
