/**
 * Friction Elimination - data-access for U1 (Event Intelligence Assistant) and
 * U2 (Event Readiness Score). Mirrors server/src/db/events.ts conventions:
 * org-scoped, IDOR-safe via the events repo, pool q/q1 helpers.
 *
 *   - saveEventPlan / getEventPlans : persist + read generated plans
 *     (event_plans, db/schema-fe-event-intel.sql). Access is gated by the
 *     events repo's getEvent(), which throws NotFound/Forbidden, so a plan can
 *     only be saved against / read for an event the actor can already see.
 *
 *   - gatherEventReadinessSignals : reads the existing tables to derive the
 *     seven readiness signals consumed by lib/eventReadiness.ts. No score math
 *     lives here; that stays in the pure module.
 *
 * Tables used for readiness (confirmed against db/schema.sql + phase files):
 *   - events            (venue_id, guest_count)            -> venue, guest list target
 *   - event_vendors     (event_id)                         -> vendors selected
 *   - quotes            (event_id, status)                 -> vendors quoting + contracts signed
 *   - documents         (related_object_*, document_type)  -> insurance, signed contracts
 *   - guests            (event_id)                         -> guest list completeness
 *   - invoices/payments (event_id / invoice_id)            -> payments made
 *   - itinerary_items   (event_id)                         -> timeline built
 */
import { q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent } from "./events.js";
import type { ReadinessSignals } from "../lib/eventReadiness.js";
import type { EventIntake, EventPlan } from "../lib/eventAssistant.js";

export type EventPlanRow = {
  id: string;
  event_id: string | null;
  intake: EventIntake | null;
  plan: EventPlan | null;
  created_by: string | null;
  created_at: string;
};

/**
 * Persist a generated plan. When `eventId` is provided the event is access-
 * checked first (getEvent throws NotFound/Forbidden for a forged or foreign
 * id). When `eventId` is null the plan is saved as a standalone draft owned by
 * the actor (still keyed by created_by for later listing).
 */
export async function saveEventPlan(
  actor: Actor,
  eventId: string | null,
  intake: EventIntake,
  plan: EventPlan,
): Promise<EventPlanRow> {
  if (eventId) {
    await getEvent(actor, eventId); // access gate (IDOR-safe)
  }
  const row = await q1<EventPlanRow>(
    `insert into event_plans (event_id, intake, plan, created_by)
       values ($1, $2::jsonb, $3::jsonb, $4)
     returning id, event_id, intake, plan, created_by, created_at`,
    [eventId, JSON.stringify(intake), JSON.stringify(plan), actor.user.id],
  );
  return row as EventPlanRow;
}

/** List the saved plans for an event, newest first (access-checked). */
export async function getEventPlans(actor: Actor, eventId: string): Promise<EventPlanRow[]> {
  await getEvent(actor, eventId); // access gate (IDOR-safe)
  return q<EventPlanRow>(
    `select id, event_id, intake, plan, created_by, created_at
       from event_plans
      where event_id = $1
      order by created_at desc
      limit 100`,
    [eventId],
  );
}

/**
 * Gather the seven readiness signals for an event from the existing tables.
 * Access-checked via getEvent. Pure score math is left to
 * computeEventReadiness in lib/eventReadiness.ts.
 */
export async function gatherEventReadinessSignals(
  actor: Actor,
  eventId: string,
): Promise<ReadinessSignals> {
  const ev = await getEvent(actor, eventId); // access gate + the event row

  // Venue selected: events.venue_id is set.
  const venueSelected = !!ev.venue_id;

  // Vendors selected: a row in event_vendors, OR a quote exists for the event.
  const vendorRow = await q1<{ n: number }>(
    `select count(*)::int as n from event_vendors where event_id = $1`,
    [eventId],
  );
  const quoteAnyRow = await q1<{ n: number }>(
    `select count(*)::int as n from quotes where event_id = $1`,
    [eventId],
  );
  const vendorsSelected = (vendorRow?.n ?? 0) > 0 || (quoteAnyRow?.n ?? 0) > 0;

  // Insurance uploaded: a document related to this event whose type names
  // insurance / COI. documents.related_object_type is free text; match the
  // event id on related_object_id and look for an insurance-flavored type.
  const insuranceRow = await q1<{ n: number }>(
    `select count(*)::int as n
       from documents
      where related_object_id = $1
        and (
          document_type ilike '%insurance%'
          or document_type ilike '%coi%'
          or document_type ilike '%certificate of insurance%'
        )`,
    [eventId],
  );
  const insuranceUploaded = (insuranceRow?.n ?? 0) > 0;

  // Guest list complete: there are guests, and (when an expected count is
  // known) the list covers at least 80% of it. Without an expected count, any
  // guests count as a started-and-present list.
  const guestRow = await q1<{ n: number }>(
    `select count(*)::int as n from guests where event_id = $1`,
    [eventId],
  );
  const guestCount = guestRow?.n ?? 0;
  const expected = typeof ev.guest_count === "number" ? ev.guest_count : null;
  const guestListComplete =
    guestCount > 0 && (expected == null || expected <= 0 || guestCount >= Math.ceil(expected * 0.8));

  // Contracts signed: an accepted quote for the event, OR an approved
  // contract / agreement document related to the event.
  const acceptedQuoteRow = await q1<{ n: number }>(
    `select count(*)::int as n from quotes where event_id = $1 and status = 'accepted'`,
    [eventId],
  );
  const signedDocRow = await q1<{ n: number }>(
    `select count(*)::int as n
       from documents
      where related_object_id = $1
        and approval_status = 'approved'
        and (document_type ilike '%contract%' or document_type ilike '%agreement%')`,
    [eventId],
  );
  const contractsSigned = (acceptedQuoteRow?.n ?? 0) > 0 || (signedDocRow?.n ?? 0) > 0;

  // Payments made: a payment row tied to an invoice for this event.
  const paymentRow = await q1<{ n: number }>(
    `select count(*)::int as n
       from payments p
       join invoices i on i.id = p.invoice_id
      where i.event_id = $1`,
    [eventId],
  );
  const paymentsMade = (paymentRow?.n ?? 0) > 0;

  // Timeline built: at least one itinerary item exists for the event.
  const itineraryRow = await q1<{ n: number }>(
    `select count(*)::int as n from itinerary_items where event_id = $1`,
    [eventId],
  );
  const timelineBuilt = (itineraryRow?.n ?? 0) > 0;

  return {
    venueSelected,
    vendorsSelected,
    insuranceUploaded,
    guestListComplete,
    contractsSigned,
    paymentsMade,
    timelineBuilt,
  };
}
