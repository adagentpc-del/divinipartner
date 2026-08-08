/**
 * General-purpose, channel-agnostic communication suppression list (ALFY2
 * pack Section 10). See db/schema-communication-suppressions.sql for the
 * full rationale. Distinct from db/claim.ts's claim_suppression, which
 * gates the Claim Engine's cold-outreach decision logic specifically
 * (unsubscribe/removal/max-sends/profile-state) -- this table is the
 * safety net underneath the single shared sendEmail() transport, catching
 * every caller, not just outreach.
 *
 * Zero em dashes.
 */
import { q1 } from "../pool.js";

function normalize(destination: string): string {
  return destination.trim().toLowerCase();
}

/** True when this destination is suppressed on this channel. */
export async function isEmailSuppressed(destination: string): Promise<boolean> {
  const dest = normalize(destination);
  if (!dest) return false;
  const row = await q1<{ id: string }>(
    `select id from communication_suppressions
      where lower(destination) = $1 and channel = 'email'
        and (expires_at is null or expires_at > now())
      limit 1`,
    [dest],
  );
  return !!row;
}

/** Add (or refresh) a suppression entry. Idempotent per (destination, channel). */
export async function addSuppression(
  destination: string,
  reason: "bounce" | "complaint" | "unsubscribe" | "manual",
  source?: string | null,
  channel: string = "email",
): Promise<void> {
  const dest = normalize(destination);
  if (!dest) return;
  await q1(
    `insert into communication_suppressions (destination, channel, reason, source)
       values ($1, $2, $3, $4)
     on conflict (lower(destination), channel) do update
       set reason = excluded.reason, source = excluded.source, created_at = now(), expires_at = null`,
    [dest, channel, reason, source ?? null],
  );
}
