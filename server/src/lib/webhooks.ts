/**
 * Outbound webhook delivery (moat roadmap Phase 2a, 2026-08-14).
 *
 * v1 is deliberately scoped to a small, high-value event set and a simple
 * delivery model: synchronous, best-effort, single-attempt HTTP POST --
 * matching lib/notify.ts's fire-and-forget convention already used
 * throughout this codebase, rather than standing up new retry/backoff queue
 * infrastructure nothing else here has either. Every attempt (success or
 * failure) is logged to webhook_deliveries as a real audit trail, which is
 * ready-built infrastructure for a future retry worker if that's ever
 * needed.
 *
 * Each payload is HMAC-SHA256 signed with the endpoint's own secret (Stripe /
 * GitHub convention: `X-Divini-Signature: sha256=<hex>` over the raw JSON
 * body) so a receiver can verify the request actually came from this
 * platform.
 */
import { createHmac } from "node:crypto";
import { q, q1 } from "../pool.js";

export const WEBHOOK_EVENT_TYPES = ["quote.awarded", "invoice.paid", "event.status_changed"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

type EndpointForDelivery = { id: string; url: string; secret: string };

function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Fire the given event to every enabled webhook endpoint on `organizationId`
 * that wants it (empty event_types on an endpoint means "all types"). Never
 * throws -- delivery failures are logged to webhook_deliveries, not
 * propagated to the caller, so a slow or broken receiver can never affect
 * the platform action that triggered the event (award, payment, status
 * change). Deliberately not awaited by callers for the same reason.
 */
export async function emitWebhookEvent(
  organizationId: string | null | undefined,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  if (!organizationId) return;
  try {
    const endpoints = await q<EndpointForDelivery>(
      `select id, url, secret from webhook_endpoints
        where organization_id = $1 and enabled = true
          and (event_types = '{}' or $2 = any(event_types))`,
      [organizationId, eventType],
    );
    if (endpoints.length === 0) return;
    const payload = { type: eventType, created_at: new Date().toISOString(), data };
    const body = JSON.stringify(payload);
    await Promise.all(
      endpoints.map(async (ep) => {
        let responseStatus: number | null = null;
        let success = false;
        let errorMessage: string | null = null;
        try {
          const res = await fetch(ep.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-divini-signature": sign(ep.secret, body),
              "x-divini-event": eventType,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          responseStatus = res.status;
          success = res.ok;
          if (!res.ok) errorMessage = `receiver returned HTTP ${res.status}`;
        } catch (e) {
          errorMessage = e instanceof Error ? e.message : "delivery failed";
        }
        await q1(
          `insert into webhook_deliveries (endpoint_id, event_type, payload, success, response_status, error_message)
           values ($1,$2,$3::jsonb,$4,$5,$6)`,
          [ep.id, eventType, body, success, responseStatus, errorMessage],
        ).catch(() => undefined);
      }),
    );
  } catch {
    // Endpoint lookup itself failed (e.g. DB hiccup) -- swallow, this must
    // never break the caller's real action.
  }
}
