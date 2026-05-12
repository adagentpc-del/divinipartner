/**
 * Helpers for sourcing admin-editor row types from the shared Drizzle schema
 * (see docs/admin-editor-type-audit.md). The DB returns `timestamp` columns
 * as `Date` objects, but the JSON wire format on the client surfaces them as
 * ISO strings — so when we use the schema's `$inferSelect` row directly, we
 * convert any `Date` field to `string` while preserving everything else
 * (including `numeric` columns, which Drizzle already exposes as `string | null`).
 */
export type SerializedRow<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};
