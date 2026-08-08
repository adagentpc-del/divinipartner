/**
 * Automated schedule-of-events distribution.
 *
 * Runs as a scheduler job (see lib/scheduler.ts) on the WORKER_INTERVAL_MINUTES
 * cadence. Two milestones counted down from an event's date_time
 * (lib/scheduleWindows.ts):
 *
 *   - week_before (1 to 7 days out): sends the schedule of events to the
 *     venue, vendor(s), and host (recipients.eventParticipantEmails - the
 *     full owner + vendor side of the event).
 *   - day_before (within 24 hours): sends the FINAL schedule to the same
 *     audience, and separately, when the host has opted in
 *     (events.notify_guests_schedule) and there is a published public
 *     agenda, emails every non-declined guest the shareable /agenda/:id
 *     link.
 *
 * Idempotency: event_schedule_sends is unique on (event_id, milestone,
 * audience). Each send first attempts an `insert ... on conflict do nothing
 * returning id` claim (same pattern as db/payments.ts's recordProcessorPayment)
 * - only the caller that wins the claim actually sends, so a periodic
 * re-scan or a concurrent run can never double-send. A wide, simple time
 * window in scheduleWindows.ts is therefore safe: correctness comes from the
 * claim, not from precise timing.
 *
 * Every send is wrapped so one event's failure never blocks the batch - the
 * same defensive pattern as runDueOutreach in lib/scheduler.ts.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import type { Actor, DbUser } from "../db.js";
import { buildItinerary, type BuiltItinerary } from "../db/itinerary.js";
import { recipients } from "./recipients.js";
import { sendEmail } from "./email.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";
import { isDueForMilestone, isEligibleStatus, type ScheduleMilestone } from "./scheduleWindows.js";

/** Background jobs act as the platform, not a specific user. super_admin
 *  clears buildItinerary's visibility check (actorCanSee); org stays null
 *  since nothing here is org-scoped. Never exposed to a real request. */
const SYSTEM_ACTOR: Actor = {
  user: { id: "system", oidc_sub: "system", email: null, name: "Divini Partners", role: "super_admin", organization_id: null } as DbUser,
  org: null,
};

function appBase(): string {
  return (PUBLIC_APP_URL || "https://divinipartners.com") + (BASE_PATH || "");
}

type CandidateEvent = { id: string; name: string; date_time: string; status: string | null };

async function candidateEvents(): Promise<CandidateEvent[]> {
  // Coarse SQL prefilter (anything up to 7 days out, not terminal, not
  // already started); the exact milestone match is the pure, tested
  // isDueForMilestone predicate below.
  return q<CandidateEvent>(
    `select id, name, date_time, status from events
      where date_time is not null
        and date_time > now()
        and date_time <= now() + interval '7 days'
        and status not in ('completed','closed','archived')
      order by date_time asc`,
  );
}

/** Atomically claim a (event, milestone, audience) send. Returns the claimed
 *  row id, or null when someone else already sent it. */
async function claimSend(eventId: string, milestone: ScheduleMilestone, audience: "ops" | "guests"): Promise<string | null> {
  const row = await q1<{ id: string }>(
    `insert into event_schedule_sends (event_id, milestone, audience, recipient_count)
       values ($1,$2,$3,0)
     on conflict (event_id, milestone, audience) do nothing
     returning id`,
    [eventId, milestone, audience],
  );
  return row?.id ?? null;
}

async function recordRecipientCount(sendId: string, count: number): Promise<void> {
  await q(`update event_schedule_sends set recipient_count = $2 where id = $1`, [sendId, count]).catch(() => undefined);
}

function formatOpsScheduleEmail(itinerary: BuiltItinerary, milestone: ScheduleMilestone): { subject: string; text: string } {
  const when = itinerary.event.date_time ? new Date(itinerary.event.date_time).toLocaleString() : "an unscheduled time";
  const heading = milestone === "week_before" ? "Schedule of events" : "Final schedule of events";
  const lines: string[] = [
    `${heading} for ${itinerary.event.name}`,
    `Event time: ${when}`,
    "",
  ];
  if (itinerary.items.length === 0) {
    lines.push("No itinerary items are set yet.");
  } else {
    for (const item of itinerary.items) {
      const time = item.start_time ? new Date(item.start_time).toLocaleString() : "Time TBD";
      const loc = item.location ? ` @ ${item.location}` : "";
      lines.push(`- [${time}] ${item.title}${loc} (${item.owner_label ?? item.owner_role})`);
    }
  }
  if (itinerary.checks.some((c) => c.severity === "error" || c.severity === "warning")) {
    lines.push("", "Open items to confirm:");
    for (const c of itinerary.checks) {
      if (c.severity === "error" || c.severity === "warning") lines.push(`- ${c.message}`);
    }
  }
  const subjectPrefix = milestone === "week_before" ? "Schedule" : "Final schedule";
  return { subject: `${subjectPrefix} of events: ${itinerary.event.name}`, text: lines.join("\n") };
}

/** Send the ops-side (venue + vendors + host) schedule for one event, if due
 *  and not already sent. Returns true when a send happened. */
async function sendOpsScheduleIfDue(ev: CandidateEvent, milestone: ScheduleMilestone, now: Date): Promise<boolean> {
  if (!isDueForMilestone(new Date(ev.date_time), milestone, now)) return false;
  const claimId = await claimSend(ev.id, milestone, "ops");
  if (!claimId) return false; // already sent by a prior run

  const itinerary = await buildItinerary(SYSTEM_ACTOR, ev.id);
  const to = await recipients.eventParticipantEmails(ev.id); // owner side + vendor side
  if (to.length === 0) {
    await recordRecipientCount(claimId, 0);
    return true;
  }
  const { subject, text } = formatOpsScheduleEmail(itinerary, milestone);
  await sendEmail({ to, subject, text });
  await recordRecipientCount(claimId, to.length);
  return true;
}

/** Send the guest-facing agenda link for one event, if the host opted in,
 *  the day_before window is active, and a public agenda actually exists. */
async function sendGuestScheduleIfDue(ev: CandidateEvent, now: Date): Promise<boolean> {
  if (!isDueForMilestone(new Date(ev.date_time), "day_before", now)) return false;

  const flag = await q1<{ notify_guests_schedule: boolean }>(
    `select notify_guests_schedule from events where id = $1`,
    [ev.id],
  );
  if (!flag?.notify_guests_schedule) return false;

  const publicItemCount = await q1<{ n: string }>(
    `select count(*) as n from itinerary_items where event_id = $1 and is_public = true`,
    [ev.id],
  );
  if (Number(publicItemCount?.n ?? 0) === 0) return false; // nothing to show

  const claimId = await claimSend(ev.id, "day_before", "guests");
  if (!claimId) return false;

  const guestRows = await q<{ email: string | null }>(
    `select email from guests where event_id = $1 and coalesce(rsvp_status, '') != 'declined'`,
    [ev.id],
  );
  const to = Array.from(
    new Set(guestRows.map((g) => (g.email || "").trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))),
  );
  if (to.length === 0) {
    await recordRecipientCount(claimId, 0);
    return true;
  }
  const link = `${appBase()}/agenda/${ev.id}`;
  await sendEmail({
    to,
    subject: `The schedule for ${ev.name} is ready`,
    text:
      `The schedule for ${ev.name} is ready to view.\n\n${link}\n\n` +
      `Check the times and locations ahead of the event.`,
  });
  await recordRecipientCount(claimId, to.length);
  return true;
}

export type ScheduleDistributionSummary = {
  candidates: number;
  opsSent: number;
  guestsSent: number;
  failed: number;
};

export async function runEventScheduleDistribution(now: Date = new Date()): Promise<ScheduleDistributionSummary> {
  const events = await candidateEvents();
  let opsSent = 0;
  let guestsSent = 0;
  let failed = 0;

  for (const ev of events) {
    if (!isEligibleStatus(ev.status)) continue;
    try {
      if (await sendOpsScheduleIfDue(ev, "week_before", now)) opsSent++;
      if (await sendOpsScheduleIfDue(ev, "day_before", now)) opsSent++;
      if (await sendGuestScheduleIfDue(ev, now)) guestsSent++;
    } catch (err) {
      failed++;
       
      console.error(
        `[schedule-distribution] failed for event ${ev.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { candidates: events.length, opsSent, guestsSent, failed };
}
