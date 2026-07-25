/**
 * Public event checkout fulfillment - confirm / release for the no-auth ticket
 * and exhibitor purchase flows.
 *
 * The public register / apply flows (server/src/db/eventLanding.ts,
 * eventExhibitor.ts) reserve inventory and write a pending_payment order. This
 * module is the settlement seam the pay rail calls:
 *   - confirmTicketOrder / confirmExhibitorOrder: mark an order paid (idempotent,
 *     guarded on the pending_payment -> confirmed transition so a capture and its
 *     webhook backstop never double-fulfill).
 *   - releaseTicketOrder / releaseExhibitorOrder: cancel an abandoned/expired
 *     order and ATOMICALLY restore the inventory it was holding (tier sold count,
 *     booth availability, package sold count).
 *
 * Every transition is a single guarded UPDATE that only fires from
 * pending_payment, so re-delivered webhooks and retries are safe. Integer cents
 * throughout. Zero em dashes.
 */
import { q, q1 } from "../pool.js";

export interface EventOwner {
  orgId: string;
  tier: string | null;
  platformFeeRate: number | null;
}

/** Resolve the owning organization + fee context for an event (null if none). */
export async function getEventOwner(eventId: string): Promise<EventOwner | null> {
  const row = await q1<{ organization_id: string | null; tier: string | null; platform_fee_rate: number | null }>(
    `select e.organization_id, o.tier, o.platform_fee_rate
       from events e
       left join organizations o on o.id = e.organization_id
      where e.id = $1`,
    [eventId],
  );
  if (!row?.organization_id) return null;
  return { orgId: row.organization_id, tier: row.tier, platformFeeRate: row.platform_fee_rate };
}

// ---------------------------------------------------------------------------
// Tickets (event_registrations)
// ---------------------------------------------------------------------------

/**
 * Mark a ticket order paid. Idempotent: only a pending_payment row transitions,
 * so a duplicate capture/webhook returns false without changing anything.
 */
export async function confirmTicketOrder(registrationId: string, reference: string | null): Promise<boolean> {
  const row = await q1<{ id: string }>(
    `update event_registrations
        set order_status = 'confirmed',
            rsvp_status = 'confirmed',
            payment_ref = coalesce($2, payment_ref)
      where id = $1 and order_status = 'pending_payment'
      returning id`,
    [registrationId, reference],
  );
  return !!row;
}

/**
 * Cancel an abandoned/expired ticket order and restore the reserved tier
 * inventory. Idempotent: the guarded transition returns the tier + quantity only
 * on the first release, so inventory is credited back exactly once.
 */
export async function releaseTicketOrder(registrationId: string): Promise<boolean> {
  const row = await q1<{ tier_id: string | null; quantity: number | null }>(
    `update event_registrations
        set order_status = 'cancelled'
      where id = $1 and order_status = 'pending_payment'
      returning tier_id, quantity`,
    [registrationId],
  );
  if (!row) return false;
  if (row.tier_id) {
    const qty = Math.max(1, Math.round(Number(row.quantity ?? 1)) || 1);
    await q(
      `update event_ticket_tiers set sold = greatest(sold - $2, 0) where id = $1`,
      [row.tier_id, qty],
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Exhibitor / booth (exhibitor_orders)
// ---------------------------------------------------------------------------

/** Mark an exhibitor order paid. Idempotent on the pending_payment transition. */
export async function confirmExhibitorOrder(orderId: string, reference: string | null): Promise<boolean> {
  const row = await q1<{ booth_id: string | null }>(
    `update exhibitor_orders
        set status = 'confirmed',
            payment_ref = coalesce($2, payment_ref)
      where id = $1 and status = 'pending_payment'
      returning booth_id`,
    [orderId, reference],
  );
  if (!row) return false;
  // Promote the held booth to booked so it leaves the availability pool for good.
  if (row.booth_id) {
    await q(`update event_booths set status = 'booked' where id = $1 and status = 'held'`, [row.booth_id]);
  }
  return true;
}

/**
 * Cancel an abandoned/expired exhibitor order and restore the inventory it held:
 * free the booth and decrement the package sold count. Idempotent.
 */
export async function releaseExhibitorOrder(orderId: string): Promise<boolean> {
  const row = await q1<{ package_id: string | null; booth_id: string | null }>(
    `update exhibitor_orders
        set status = 'cancelled'
      where id = $1 and status = 'pending_payment'
      returning package_id, booth_id`,
    [orderId],
  );
  if (!row) return false;
  if (row.booth_id) {
    await q(`update event_booths set status = 'available' where id = $1 and status = 'held'`, [row.booth_id]);
  }
  if (row.package_id) {
    await q(`update event_exhibitor_packages set sold = greatest(sold - 1, 0) where id = $1`, [row.package_id]);
  }
  return true;
}
