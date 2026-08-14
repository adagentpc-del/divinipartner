/**
 * Outbound webhook endpoint CRUD (moat roadmap Phase 2a, 2026-08-14).
 *
 * An org registers a URL to receive real-time notifications for a scoped set
 * of high-value event types (see lib/webhooks.ts's WEBHOOK_EVENT_TYPES).
 * Authorization mirrors every other org-scoped resource in this codebase: the
 * actor's org must own the endpoint, or the actor is an admin.
 */
import { randomBytes } from "node:crypto";
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "../lib/webhooks.js";
import { isSafeUrl } from "../lib/safe-fetch.js";

export type WebhookEndpointRow = {
  id: string;
  organization_id: string;
  url: string;
  secret: string;
  enabled: boolean;
  event_types: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WebhookDeliveryRow = {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: unknown;
  success: boolean;
  response_status: number | null;
  error_message: string | null;
  created_at: string;
};

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

// SSRF hardening: a registered webhook URL must not point at a loopback,
// private, link-local, or cloud-metadata address (see lib/safe-fetch.ts).
// This is a registration-time check only -- delivery itself goes through
// safeFetch too, which revalidates every redirect hop at send time, since a
// hostname that resolves to a public address now could be repointed (DNS
// rebinding) or 302 to an internal address later.
const validUrl = isSafeUrl;

function validEventTypes(types: unknown): string[] {
  if (!Array.isArray(types)) return [];
  const allowed = new Set<string>(WEBHOOK_EVENT_TYPES as readonly string[]);
  return types.filter((t): t is string => typeof t === "string" && allowed.has(t));
}

export async function createWebhookEndpoint(
  actor: Actor,
  input: { url: string; eventTypes?: WebhookEventType[] | string[] },
): Promise<WebhookEndpointRow> {
  if (!actor.org?.id) throw new ForbiddenError("no active organization");
  if (!input.url || !validUrl(input.url)) throw new ForbiddenError("a valid https/http url is required");
  const secret = randomBytes(24).toString("hex");
  const row = await q1<WebhookEndpointRow>(
    `insert into webhook_endpoints (organization_id, url, secret, event_types, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [actor.org.id, input.url, secret, validEventTypes(input.eventTypes ?? []), actor.user.id],
  );
  return row as WebhookEndpointRow;
}

export async function listWebhookEndpoints(actor: Actor): Promise<WebhookEndpointRow[]> {
  if (!actor.org?.id) throw new ForbiddenError("no active organization");
  return q<WebhookEndpointRow>(
    `select * from webhook_endpoints where organization_id = $1 order by created_at desc`,
    [actor.org.id],
  );
}

async function assertEndpointAccess(actor: Actor, id: string): Promise<WebhookEndpointRow> {
  const row = await q1<WebhookEndpointRow>(`select * from webhook_endpoints where id = $1`, [id]);
  if (!row) throw new NotFoundError("webhook endpoint not found");
  if (!isAdmin(actor) && row.organization_id !== actor.org?.id) {
    throw new ForbiddenError("no access to this webhook endpoint");
  }
  return row;
}

export async function updateWebhookEndpoint(
  actor: Actor,
  id: string,
  input: { url?: string; enabled?: boolean; eventTypes?: string[] },
): Promise<WebhookEndpointRow> {
  await assertEndpointAccess(actor, id);
  if (input.url !== undefined && !validUrl(input.url)) throw new ForbiddenError("a valid https/http url is required");
  const row = await q1<WebhookEndpointRow>(
    `update webhook_endpoints set
       url = coalesce($2, url),
       enabled = coalesce($3, enabled),
       event_types = coalesce($4, event_types),
       updated_at = now()
     where id = $1 returning *`,
    [
      id,
      input.url ?? null,
      input.enabled ?? null,
      input.eventTypes ? validEventTypes(input.eventTypes) : null,
    ],
  );
  return row as WebhookEndpointRow;
}

export async function deleteWebhookEndpoint(actor: Actor, id: string): Promise<void> {
  await assertEndpointAccess(actor, id);
  await q1(`delete from webhook_endpoints where id = $1`, [id]);
}

export async function listWebhookDeliveries(actor: Actor, endpointId: string): Promise<WebhookDeliveryRow[]> {
  await assertEndpointAccess(actor, endpointId);
  return q<WebhookDeliveryRow>(
    `select * from webhook_deliveries where endpoint_id = $1 order by created_at desc limit 100`,
    [endpointId],
  );
}

