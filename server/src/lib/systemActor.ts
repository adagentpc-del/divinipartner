/**
 * The platform's own actor identity, used by background jobs and
 * server-triggered writes that are not on behalf of any specific signed-in
 * user (e.g. the packet distribution scheduler, event-change packet
 * invalidation). Uses the real seeded system user row (db/schema-system-
 * user.sql, a fixed well-known UUID) rather than a placeholder string,
 * because some write paths (generatePacketVersion) store actor.user.id in
 * a uuid-typed foreign key column -- a fake non-UUID id would fail there.
 * Never exposed to a real request.
 *
 * Zero em dashes.
 */
import type { Actor, DbUser } from "../db.js";

export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export const SYSTEM_ACTOR: Actor = {
  user: {
    id: SYSTEM_USER_ID,
    oidc_sub: "system",
    email: null,
    name: "Divini Partners",
    role: "super_admin",
    organization_id: null,
    status: "active",
  } as DbUser,
  org: null,
};
