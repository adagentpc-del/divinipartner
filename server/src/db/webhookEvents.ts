/**
 * Webhook event ledger (ALFY2 pack Section 09). Gives every processor
 * webhook -- not just the ones that happen to touch the payments table --
 * event-level idempotency plus attempt/failure observability. See
 * db/schema-webhook-events.sql for the full rationale.
 *
 * Zero em dashes.
 */
import { q1 } from "../pool.js";

/**
 * Record a webhook event exactly once. Returns true when this is the first
 * time this (provider, event_id) pair has been seen -- the caller should
 * process it. Returns false when it is a duplicate delivery -- the caller
 * should short-circuit without reprocessing (still respond 2xx so the
 * processor stops retrying).
 */
export async function recordWebhookEventOnce(
  provider: string,
  eventId: string,
  eventType: string | null,
): Promise<boolean> {
  if (!eventId) return true; // no id to dedupe on; process it (best effort)
  const row = await q1<{ id: string }>(
    `insert into webhook_events (provider, event_id, event_type, status)
       values ($1, $2, $3, 'received')
     on conflict (provider, event_id) do nothing
     returning id`,
    [provider, eventId, eventType],
  );
  return !!row;
}

/** Mark a previously-recorded event's processing outcome. Best-effort. */
export async function markWebhookEventOutcome(
  provider: string,
  eventId: string,
  status: "processed" | "failed",
  lastError?: string | null,
): Promise<void> {
  if (!eventId) return;
  await q1(
    `update webhook_events
        set status = $3, processed_at = now(), attempt_count = attempt_count + 1,
            last_error = $4
      where provider = $1 and event_id = $2`,
    [provider, eventId, status, lastError ? String(lastError).slice(0, 2000) : null],
  );
}
