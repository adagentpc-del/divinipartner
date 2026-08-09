/**
 * node-pg returns `timestamptz` columns as native Date objects, not
 * strings -- even where a TypeScript type declares the field `string |
 * null` (that type describes what a JSON response over the wire looks
 * like, since Express's res.json() implicitly stringifies Dates; it does
 * NOT describe the in-process value before serialization). Anywhere a raw
 * query result flows into a structure that gets persisted to jsonb (always
 * a string once round-tripped) and later compared by value against a
 * freshly-built copy, a stray Date object causes a spurious "changed"
 * result even when nothing changed -- this bit both
 * db/executionPacket.ts's buildExecutionPacket() and db/itinerary.ts's
 * buildItinerary() live, in two different spots each. Normalize with this
 * at the point a raw query result is assembled into anything that might
 * get diffed or persisted as JSON.
 *
 * Zero em dashes.
 */
export function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
