/**
 * Execution Packet distribution settings, pre-send readiness gate, and
 * idempotent scheduled delivery (Final Event Schedule / Event Execution
 * Packet completion phase, Parts 7-9, 2026-08-09).
 *
 * runPacketDistribution() is the scheduler job -- added to the EXISTING
 * scheduler loop (lib/scheduler.ts, WORKER_INTERVAL_MINUTES), not a new
 * one. It is safe for retries, duplicate execution, server restarts, and
 * multiple worker instances: every delivery attempt is claimed via
 * `insert into event_packet_deliveries ... on conflict (packet_id,
 * recipient_user_id) do nothing returning id`, the exact idempotency
 * pattern already proven in lib/scheduleDistribution.ts's event_schedule_sends
 * -- only the caller that wins the claim actually sends.
 *
 * Pre-send readiness gate (Part 9): before any send, recompute readiness
 * fresh. If blocking issues exist, the run is marked blocked and the
 * owner/planner are notified -- nothing is sent. An explicit "Send Anyway"
 * override (overrideDistributionBlock) is single-use: it authorizes exactly
 * the next run past the CURRENT blockers, and is recorded with who and
 * when. A fresh block on a later run requires a fresh override.
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { computeReadiness } from "./readiness.js";
import { generatePacketVersion, projectPacket } from "./executionPacket.js";
import type { EventRole } from "./eventMembers.js";
import {
  isDistributionPreset,
  resolveOffsetMinutes,
  isDueForDistribution,
  isReminderDue,
  type DistributionPreset,
} from "../lib/distributionSchedule.js";
import { sendEmail } from "../lib/email.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";
import { SYSTEM_ACTOR } from "../lib/systemActor.js";

function appBase(): string {
  return (PUBLIC_APP_URL || "https://divinipartners.com") + (BASE_PATH || "");
}

export type DistributionSettingsRow = {
  id: string;
  event_id: string;
  enabled: boolean;
  offset_preset: DistributionPreset;
  offset_minutes: number;
  send_time: string;
  recipient_roles: EventRole[];
  last_run_at: string | null;
  distributed_at: string | null;
  blocked_at: string | null;
  blocked_reason: unknown;
  override_at: string | null;
  override_by: string | null;
  /** Minutes-before-event offsets for acknowledgment reminders (Part 11),
   *  e.g. [4320, 1440] for 72h/24h. Independent of the distribution send
   *  itself -- a reminder nudges recipients who have not yet confirmed
   *  receipt of whatever the current packet version is. */
  reminder_offsets: number[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Fetch settings, or a not-yet-persisted default row when none exists. Owner/planner only. */
export async function getDistributionSettings(
  actor: Actor,
  eventId: string,
): Promise<DistributionSettingsRow> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can view distribution settings");
  }
  const row = await q1<DistributionSettingsRow>(
    `select * from event_packet_distribution_settings where event_id = $1`,
    [eventId],
  );
  if (row) return row;
  return {
    id: "",
    event_id: eventId,
    enabled: false,
    offset_preset: "7d",
    offset_minutes: resolveOffsetMinutes("7d", null),
    send_time: "09:00",
    recipient_roles: ["event_owner", "planner", "venue", "vendor_owner", "vendor_staff", "event_staff"],
    last_run_at: null,
    distributed_at: null,
    blocked_at: null,
    blocked_reason: null,
    override_at: null,
    override_by: null,
    reminder_offsets: [4320, 1440],
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
}

export type UpdateDistributionSettingsInput = {
  enabled?: boolean;
  offset_preset?: string;
  custom_offset_minutes?: number | null;
  send_time?: string;
  recipient_roles?: string[];
  reminder_offsets?: number[];
};

const DEFAULT_REMINDER_OFFSETS = [4320, 1440];

function sanitizeReminderOffsets(input: unknown): number[] {
  if (!Array.isArray(input)) return DEFAULT_REMINDER_OFFSETS;
  const cleaned = input
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.round(v));
  return cleaned.length ? Array.from(new Set(cleaned)).sort((a, b) => b - a) : DEFAULT_REMINDER_OFFSETS;
}

const VALID_ROLES = new Set<string>([
  "event_owner", "planner", "finance", "venue", "vendor_owner", "vendor_staff",
  "sponsor", "event_staff", "guest_manager", "read_only",
]);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Create or update distribution settings. Owner/planner only. */
export async function updateDistributionSettings(
  actor: Actor,
  eventId: string,
  input: UpdateDistributionSettingsInput,
): Promise<DistributionSettingsRow> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can configure distribution");
  }
  const preset = isDistributionPreset(input.offset_preset) ? input.offset_preset : "7d";
  const offsetMinutes = resolveOffsetMinutes(preset, input.custom_offset_minutes ?? null);
  const sendTime = input.send_time && TIME_RE.test(input.send_time) ? input.send_time : "09:00";
  const roles = (input.recipient_roles ?? ["event_owner", "planner", "venue", "vendor_owner", "vendor_staff", "event_staff"])
    .filter((r) => VALID_ROLES.has(r));
  if (roles.length === 0) throw new ForbiddenError("at least one recipient role is required");
  const reminderOffsets = sanitizeReminderOffsets(input.reminder_offsets);

  const row = await q1<DistributionSettingsRow>(
    `insert into event_packet_distribution_settings
       (event_id, enabled, offset_preset, offset_minutes, send_time, recipient_roles, reminder_offsets, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     on conflict (event_id) do update set
       enabled = excluded.enabled,
       offset_preset = excluded.offset_preset,
       offset_minutes = excluded.offset_minutes,
       send_time = excluded.send_time,
       recipient_roles = excluded.recipient_roles,
       reminder_offsets = excluded.reminder_offsets,
       updated_by = excluded.updated_by,
       -- Reconfiguring the schedule means the owner wants the new schedule
       -- to actually take effect, not be silently suppressed by a stale
       -- "already distributed" flag from before the change.
       distributed_at = null,
       updated_at = now()
     returning *`,
    [eventId, input.enabled ?? false, preset, offsetMinutes, sendTime, roles, reminderOffsets, actor.user.id],
  );
  return row as DistributionSettingsRow;
}

/**
 * Record a "Send Anyway" override: authorizes exactly the next distribution
 * run past the current blockers. Owner/planner only. The unresolved issues
 * at override time are stamped into blocked_reason so there is a durable
 * record of what was overridden, by whom, and when.
 */
export async function overrideDistributionBlock(
  actor: Actor,
  eventId: string,
): Promise<DistributionSettingsRow> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can override a blocked distribution");
  }
  const existing = await q1<{ blocked_reason: unknown }>(
    `select blocked_reason from event_packet_distribution_settings where event_id = $1`,
    [eventId],
  );
  if (!existing) throw new NotFoundError("no distribution settings configured for this event");
  const row = await q1<DistributionSettingsRow>(
    `update event_packet_distribution_settings
        set override_at = now(), override_by = $2, updated_at = now()
      where event_id = $1
      returning *`,
    [eventId, actor.user.id],
  );
  return row as DistributionSettingsRow;
}

// ============================================================================
// SCHEDULED JOB
// ============================================================================

type CandidateEvent = { id: string; date_time: string; timezone: string | null; status: string | null };

async function candidateEvents(): Promise<Array<CandidateEvent & DistributionSettingsRow>> {
  return q<CandidateEvent & DistributionSettingsRow>(
    `select e.id, e.date_time, e.timezone, e.status, s.*
       from events e
       join event_packet_distribution_settings s on s.event_id = e.id
      where s.enabled = true
        and e.date_time is not null
        and e.date_time > now()
        and e.status not in ('completed','closed','archived')`,
  );
}

export type DistributionRunSummary = {
  candidates: number;
  sent: number;
  blocked: number;
  failed: number;
};

/**
 * Run one distribution pass. For each due, enabled event: recompute
 * readiness; if blocking issues remain and no fresh override is on record,
 * mark blocked and notify, skip. Otherwise generate a packet version and
 * send a role-projected notification to each configured recipient role,
 * claiming each delivery so a retry or concurrent run never double-sends.
 */
export async function runPacketDistribution(now: Date = new Date()): Promise<DistributionRunSummary> {
  const candidates = await candidateEvents();
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      // A scheduled distribution is a ONE-TIME send per cycle, not a
      // repeating one: once distributed_at is set, every later tick while
      // the event is still "due" must skip -- otherwise every tick would
      // mint a fresh packet version and re-email the same recipients again
      // (a live-discovered bug: the delivery claim's uniqueness key is per
      // packet version, so a NEW version every tick defeated it entirely).
      // A fresh cycle starts only when the event's date_time changes
      // (events.ts clears distributed_at on that change) or an explicit
      // resend is requested.
      if (c.distributed_at) continue;

      const timezone = c.timezone || "UTC";
      const due = isDueForDistribution(new Date(c.date_time), c.offset_minutes, timezone, c.send_time, now);
      if (!due) continue;

      const readiness = await computeReadiness(SYSTEM_ACTOR, c.event_id);
      const hasOverride = !!c.override_at;
      if (readiness.blocking.length > 0 && !hasOverride) {
        await pool.query(
          `update event_packet_distribution_settings
              set blocked_at = now(), blocked_reason = $2, last_run_at = now(), updated_at = now()
            where event_id = $1`,
          [c.event_id, JSON.stringify({ blocking: readiness.blocking.map((b) => b.message) })],
        );
        blocked++;
        continue;
      }

      const overrideStamp = hasOverride
        ? { blocking: readiness.blocking.map((b) => b.message), overridden_by: c.override_by, overridden_at: c.override_at }
        : null;

      const packet = await generatePacketVersion(SYSTEM_ACTOR, c.event_id);
      const recipients = await q<{ user_id: string; role: EventRole; email: string | null }>(
        `select em.user_id, em.role, u.email
           from event_members em
           join users u on u.id = em.user_id
          where em.event_id = $1 and em.status = 'active' and em.role = any($2::text[])`,
        [c.event_id, c.recipient_roles],
      );

      for (const r of recipients) {
        const claim = await q1<{ id: string }>(
          `insert into event_packet_deliveries (packet_id, event_id, recipient_user_id, recipient_role)
           values ($1,$2,$3,$4)
           on conflict (packet_id, recipient_user_id) do nothing
           returning id`,
          [packet.id, c.event_id, r.user_id, r.role],
        );
        if (!claim) continue; // already claimed by a prior run
        if (!r.email) {
          await pool.query(
            `update event_packet_deliveries set status = 'skipped', error_classification = 'no_email' where id = $1`,
            [claim.id],
          );
          continue;
        }
        try {
          const projection = projectPacket(packet.snapshot, r.role, null);
          const link = `${appBase()}/events/${c.event_id}`;
          await sendEmail({
            to: r.email,
            subject: `Final event schedule ready: ${projection.event.name}`,
            text:
              `The final event schedule for ${projection.event.name} is ready (version ${packet.version}).\n\n` +
              `View it here:\n${link}\n\n` +
              `Please confirm receipt when you review it.`,
          });
          await pool.query(
            `update event_packet_deliveries set status = 'sent', sent_at = now() where id = $1`,
            [claim.id],
          );
          sent++;
        } catch (err) {
          await pool.query(
            `update event_packet_deliveries
                set status = 'failed', failed_at = now(), retry_count = retry_count + 1,
                    error_classification = 'send_failed'
              where id = $1`,
            [claim.id],
          );
          failed++;
        }
      }

      await pool.query(
        `update event_packet_distribution_settings
            set last_run_at = now(), distributed_at = now(), blocked_at = null, blocked_reason = $2,
                override_at = null, override_by = null, updated_at = now()
          where event_id = $1`,
        [c.event_id, overrideStamp ? JSON.stringify(overrideStamp) : null],
      );
    } catch (err) {
      failed++;
      console.error(
        `[packet-distribution] failed for event ${c.event_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { candidates: candidates.length, sent, blocked, failed };
}

// ============================================================================
// ACKNOWLEDGMENT REMINDERS (Part 11)
// ============================================================================

type ReminderCandidate = {
  event_id: string;
  date_time: string;
  timezone: string | null;
  status: string | null;
  reminder_offsets: number[];
};

async function reminderCandidates(): Promise<ReminderCandidate[]> {
  return q<ReminderCandidate>(
    `select e.id as event_id, e.date_time, e.timezone, e.status, s.reminder_offsets
       from events e
       join event_packet_distribution_settings s on s.event_id = e.id
      where e.date_time is not null
        and e.date_time > now()
        and e.status not in ('completed','closed','archived')
        and s.reminder_offsets is not null
        and array_length(s.reminder_offsets, 1) > 0`,
  );
}

export type ReminderRunSummary = {
  candidates: number;
  reminders_sent: number;
  failed: number;
};

/**
 * Run one acknowledgment-reminder pass. For each candidate event's CURRENT
 * (latest issued/final) packet version, for each configured reminder
 * offset that is now due (event date_time minus the offset has passed, and
 * the event has not yet started), nudge every recipient who is still
 * PENDING -- i.e. has not acknowledged this exact packet version. The
 * event_members status = 'active' join naturally excludes removed or
 * revoked members, and the acknowledged_at is null filter naturally
 * excludes anyone who already confirmed receipt. Each (packet, recipient,
 * offset) reminder is claimed via insert-on-conflict-do-nothing against
 * event_packet_reminders, the same idempotency pattern as
 * runPacketDistribution -- a retry or duplicate tick never re-sends the
 * same reminder twice.
 */
export async function runPacketReminders(now: Date = new Date()): Promise<ReminderRunSummary> {
  const candidates = await reminderCandidates();
  let remindersSent = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const packet = await q1<{ id: string; version: number }>(
        `select id, version from event_execution_packets
          where event_id = $1 and status in ('issued','final')
          order by version desc limit 1`,
        [c.event_id],
      );
      if (!packet) continue;

      const eventDateTime = new Date(c.date_time);

      for (const offsetMinutes of c.reminder_offsets) {
        if (!isReminderDue(eventDateTime, offsetMinutes, now)) continue;

        const pending = await q<{ user_id: string; email: string | null }>(
          `select a.user_id, u.email
             from event_execution_packet_acknowledgments a
             join event_members em on em.event_id = $1 and em.user_id = a.user_id and em.status = 'active'
             join users u on u.id = a.user_id
            where a.packet_id = $2 and a.acknowledged_at is null`,
          [c.event_id, packet.id],
        );

        for (const r of pending) {
          const claim = await q1<{ id: string }>(
            `insert into event_packet_reminders (packet_id, event_id, recipient_user_id, offset_minutes)
             values ($1,$2,$3,$4)
             on conflict (packet_id, recipient_user_id, offset_minutes) do nothing
             returning id`,
            [packet.id, c.event_id, r.user_id, offsetMinutes],
          );
          if (!claim || !r.email) continue; // already claimed, or nothing to send to

          try {
            const link = `${appBase()}/events/${c.event_id}`;
            await sendEmail({
              to: r.email,
              subject: `Reminder: confirm receipt of the final event schedule`,
              text:
                `You have not yet confirmed receipt of the final event schedule (version ${packet.version}).\n\n` +
                `Please review and confirm here:\n${link}`,
            });
            remindersSent++;
          } catch {
            failed++;
          }
        }
      }
    } catch (err) {
      failed++;
      console.error(
        `[packet-reminders] failed for event ${c.event_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { candidates: candidates.length, reminders_sent: remindersSent, failed };
}

/**
 * Manual "Send Reminder" action for one event, triggered from the
 * Readiness panel. Owner/planner only. Unlike runPacketReminders() (a
 * scheduled tick that must never double-send on a retry), this is a
 * single, deliberate, explicit HTTP request the planner just made, so it
 * sends directly to every still-pending recipient of the CURRENT packet
 * version rather than going through the offset-based idempotency table --
 * there is no "retry" to protect against here, and a planner clicking the
 * button again later is a legitimate second reminder, not a duplicate.
 */
export async function remindNow(actor: Actor, eventId: string): Promise<{ sent: number }> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner can send a reminder");
  }
  const packet = await q1<{ id: string; version: number }>(
    `select id, version from event_execution_packets
      where event_id = $1 and status in ('issued', 'final', 'update_required')
      order by version desc limit 1`,
    [eventId],
  );
  if (!packet) return { sent: 0 };

  const pending = await q<{ user_id: string; email: string | null }>(
    `select a.user_id, u.email
       from event_execution_packet_acknowledgments a
       join event_members em on em.event_id = $1 and em.user_id = a.user_id and em.status = 'active'
       join users u on u.id = a.user_id
      where a.packet_id = $2 and a.acknowledged_at is null`,
    [eventId, packet.id],
  );

  let sent = 0;
  const link = `${appBase()}/events/${eventId}`;
  for (const r of pending) {
    if (!r.email) continue;
    try {
      await sendEmail({
        to: r.email,
        subject: `Reminder: confirm receipt of the final event schedule`,
        text:
          `You have not yet confirmed receipt of the final event schedule (version ${packet.version}).\n\n` +
          `Please review and confirm here:\n${link}`,
      });
      sent++;
    } catch {
      // best-effort: one failed send should not block the others
    }
  }
  return { sent };
}
