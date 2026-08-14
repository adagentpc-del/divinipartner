/**
 * API keys (moat roadmap Phase 2a, 2026-08-14): programmatic access for
 * external integrations, authenticated the same way a session JWT is --
 * `Authorization: Bearer <key>` -- but recognized by a fixed prefix so
 * server/src/auth.ts can route it to `resolveApiKey` instead of
 * `verifySession`.
 *
 * A key resolves to the CREATING user's id, then flows through the exact
 * same `db.getActor(userId, email)` every session-authenticated request
 * uses -- so every existing route's authorization (org-scoped checks,
 * requireAdmin, entitlement gates) applies unchanged to API-key traffic.
 * There is no parallel permission system to keep in sync.
 *
 * Only a sha256 hash is ever stored. The plaintext key is returned exactly
 * once, at creation, and cannot be recovered afterward -- same convention as
 * every other secret-issuance flow in this codebase.
 */
import { randomBytes, createHash } from "node:crypto";
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";

export const API_KEY_PREFIX = "dvp_live_";

export type ApiKeyRow = {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new plaintext key: prefix + 32 random bytes, base64url. Never
 *  guessable, never stored anywhere but the hash. */
function generateKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

/** Short, non-secret display fragment shown in the UI after creation so a
 *  user can tell keys apart without ever seeing the full value again. */
function displayPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 8);
}

/** Create a new API key for the actor's org. Returns the plaintext key ONCE
 *  alongside the row -- callers must show/copy it immediately. */
export async function createApiKey(
  actor: Actor,
  name: string,
): Promise<{ key: string; row: ApiKeyRow }> {
  if (!actor.org?.id) throw new ForbiddenError("no active organization");
  const trimmed = (name || "").trim();
  if (!trimmed) throw new ForbiddenError("name required");
  const key = generateKey();
  const row = await q1<ApiKeyRow>(
    `insert into api_keys (organization_id, user_id, name, key_hash, key_prefix, created_by)
     values ($1,$2,$3,$4,$5,$6)
     returning id, organization_id, user_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at`,
    [actor.org.id, actor.user.id, trimmed, hashKey(key), displayPrefix(key), actor.user.id],
  );
  return { key, row: row as ApiKeyRow };
}

/** Every non-revoked-or-not key for the actor's org (revoked ones stay listed
 *  for audit visibility, distinguished by revoked_at). */
export async function listApiKeys(actor: Actor): Promise<ApiKeyRow[]> {
  if (!actor.org?.id) throw new ForbiddenError("no active organization");
  return q<ApiKeyRow>(
    `select id, organization_id, user_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at
       from api_keys where organization_id = $1 order by created_at desc`,
    [actor.org.id],
  );
}

export async function revokeApiKey(actor: Actor, id: string): Promise<ApiKeyRow> {
  const existing = await q1<{ organization_id: string }>(`select organization_id from api_keys where id = $1`, [id]);
  if (!existing) throw new NotFoundError("api key not found");
  if (!isAdmin(actor) && existing.organization_id !== actor.org?.id) {
    throw new ForbiddenError("no access to this api key");
  }
  const row = await q1<ApiKeyRow>(
    `update api_keys set revoked_at = now() where id = $1 and revoked_at is null
     returning id, organization_id, user_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at`,
    [id],
  );
  return (row ?? (await q1<ApiKeyRow>(
    `select id, organization_id, user_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at
       from api_keys where id = $1`,
    [id],
  ))) as ApiKeyRow;
}

/**
 * Resolve a presented Bearer token (already confirmed to start with
 * API_KEY_PREFIX) to the creating user's id + email, or null if the key is
 * unknown or revoked. Best-effort stamps last_used_at; never throws.
 *
 * Also returns the org the key was ISSUED for (`organization_id`) alongside
 * the user's CURRENT active org (`currentOrganizationId`, users.organization_id).
 * A key is scoped to the org it was created in; callers must reject it if the
 * two differ, otherwise a key silently re-scopes to whatever org the creating
 * user later switches into (e.g. after joining or being added to a second org).
 */
export async function resolveApiKey(
  rawKey: string,
): Promise<{ userId: string; email: string | null; organizationId: string; currentOrganizationId: string | null } | null> {
  const row = await q1<{
    id: string;
    user_id: string;
    email: string | null;
    revoked_at: string | null;
    organization_id: string;
    current_organization_id: string | null;
  }>(
    `select k.id, k.user_id, u.email, k.revoked_at, k.organization_id, u.organization_id as current_organization_id
       from api_keys k join users u on u.id = k.user_id
      where k.key_hash = $1`,
    [hashKey(rawKey)],
  );
  if (!row || row.revoked_at) return null;
  q1(`update api_keys set last_used_at = now() where id = $1`, [row.id]).catch(() => undefined);
  return {
    userId: row.user_id,
    email: row.email,
    organizationId: row.organization_id,
    currentOrganizationId: row.current_organization_id,
  };
}
