/**
 * Banquet Event Order / BEO (moat roadmap Phase 2c, 2026-08-14).
 *
 * A BEO is the hospitality-industry-standard document venue/catering/AV
 * professionals expect: event overview, venue setup/access, the run-of-show
 * timeline, and -- the part the Final Event Schedule (executionPacket.ts)
 * deliberately does not carry, since that document is pure day-of logistics
 * -- what is actually ORDERED from each awarded vendor, with real pricing
 * pulled from their awarded quote. Rather than a second, divergent overview/
 * venue/schedule assembly, this reuses buildExecutionPacket() (which already
 * enforces the actor's real event access via getEvent()) for everything
 * except the vendor order section, which is new.
 */
import { q } from "../pool.js";
import type { Actor } from "../db.js";
import { buildExecutionPacket, type ExecutionPacketSnapshot } from "./executionPacket.js";
import type { DerivedItem } from "./itinerary.js";

export type BeoLineItem = { description: string; amount: number };

export type BeoVendorOrder = {
  contract_id: string;
  vendor_org_id: string;
  vendor_name: string;
  category: string | null;
  awarded_amount: string;
  line_items: BeoLineItem[];
};

export type BeoData = {
  event: ExecutionPacketSnapshot["event"];
  venue: ExecutionPacketSnapshot["venue"];
  schedule: DerivedItem[];
  key_contacts: ExecutionPacketSnapshot["key_contacts"];
  vendor_orders: BeoVendorOrder[];
  generated_at: string;
};

export async function buildBeo(actor: Actor, eventId: string): Promise<BeoData> {
  const packet = await buildExecutionPacket(actor, eventId);

  const rows = await q<{
    contract_id: string;
    vendor_org_id: string;
    vendor_name: string | null;
    category: string | null;
    awarded_amount: string;
    line_items: unknown;
  }>(
    `select c.id as contract_id, c.vendor_org_id, coalesce(o.name, 'Vendor') as vendor_name,
            v.category, c.awarded_amount, qt.line_items
       from event_vendor_contracts c
       left join organizations o on o.id = c.vendor_org_id
       left join quotes qt on qt.id = c.quote_id
       left join vendors v on v.id = qt.vendor_id
      where c.event_id = $1 and c.status = 'active'
      order by c.created_at asc`,
    [eventId],
  );

  const vendor_orders: BeoVendorOrder[] = rows.map((r) => ({
    contract_id: r.contract_id,
    vendor_org_id: r.vendor_org_id,
    vendor_name: r.vendor_name ?? "Vendor",
    category: r.category,
    awarded_amount: r.awarded_amount,
    line_items: Array.isArray(r.line_items) ? (r.line_items as BeoLineItem[]) : [],
  }));

  return {
    event: packet.event,
    venue: packet.venue,
    schedule: packet.schedule.items,
    key_contacts: packet.key_contacts,
    vendor_orders,
    generated_at: new Date().toISOString(),
  };
}
