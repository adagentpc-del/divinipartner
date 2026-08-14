/**
 * Vendor Event Performance (live-ops phase, Part 32-33, 2026-08-09).
 *
 * Distinct from the pre-existing "Divini Vendor Scorecard"
 * (server/src/lib/vendorScorecard.ts), which is a global, lifetime,
 * cross-event aggregate for one vendor. This is the per-EVENT view: how
 * did this vendor actually do on THIS event, built entirely from real
 * data already recorded by this event's own systems --
 *   - completion status/notes: db/closeout.ts's event_vendor_completions
 *     (Part 26)
 *   - reviews received for this specific event: the pre-existing
 *     reviews table, filtered by event_id AND reviewee_org_id (the
 *     generic Reviews composer has no event filter; this does)
 *   - inventory issues attributed to them: db/eventInventory.ts's
 *     event_inventory_counts, joined through event_inventory_items'
 *     source_vendor_org_id (Part 21-22)
 * No new scoring formula, no fabricated number -- every field here is a
 * real count or a real average of real ratings.
 *
 * Visibility (Part 33): lib/vendorPerformanceVisibility.ts -- full/
 * venue/finance see every vendor; a vendor sees only their own row.
 *
 * Zero em dashes.
 */
import { q } from "../pool.js";
import { type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { filterVendorPerformanceForViewer, type VendorPerformanceRow as VisibilityRow } from "../lib/vendorPerformanceVisibility.js";

export type VendorEventPerformanceRow = {
  vendor_org_id: string;
  vendor_name: string;
  completion_status: string;
  completion_notes: string | null;
  review_count: number;
  review_avg_rating: number | null;
  open_inventory_issues: number;
};

export async function listVendorEventPerformance(actor: Actor, eventId: string): Promise<VendorEventPerformanceRow[]> {
  await getEvent(actor, eventId);

  const rows = await q<{
    vendor_org_id: string;
    vendor_name: string;
    completion_status: string;
    completion_notes: string | null;
  }>(
    `select ev.organization_id as vendor_org_id,
            coalesce(o.name, 'Vendor') as vendor_name,
            coalesce(c.status, 'pending') as completion_status,
            c.notes as completion_notes
       from event_vendors ev
       left join organizations o on o.id = ev.organization_id
       left join event_vendor_completions c on c.event_id = ev.event_id and c.vendor_org_id = ev.organization_id
      where ev.event_id = $1
      order by vendor_name asc`,
    [eventId],
  );

  const reviewRows = await q<{ reviewee_org_id: string; count: string; avg_rating: string | null }>(
    `select reviewee_org_id, count(*)::int as count, avg(rating)::numeric as avg_rating
       from reviews
      where event_id = $1 and reviewee_org_id is not null
      group by reviewee_org_id`,
    [eventId],
  );
  const reviewsByOrg = new Map(reviewRows.map((r) => [r.reviewee_org_id, r]));

  const issueRows = await q<{ source_vendor_org_id: string; count: string }>(
    `select i.source_vendor_org_id, count(*)::int as count
       from event_inventory_counts c
       join event_inventory_items i on i.id = c.item_id
      where c.event_id = $1 and c.status != 'resolved' and i.source_vendor_org_id is not null
      group by i.source_vendor_org_id`,
    [eventId],
  );
  const issuesByOrg = new Map(issueRows.map((r) => [r.source_vendor_org_id, Number(r.count)]));

  const result: VendorEventPerformanceRow[] = rows.map((r) => {
    const review = reviewsByOrg.get(r.vendor_org_id);
    return {
      vendor_org_id: r.vendor_org_id,
      vendor_name: r.vendor_name,
      completion_status: r.completion_status,
      completion_notes: r.completion_notes,
      review_count: review ? Number(review.count) : 0,
      review_avg_rating: review?.avg_rating != null ? Number(review.avg_rating) : null,
      open_inventory_issues: issuesByOrg.get(r.vendor_org_id) ?? 0,
    };
  });

  const canSeeAll = (await canManageEvent(actor, eventId)) || (await isVenueOrFinance(actor, eventId));
  return filterVendorPerformanceForViewer(result as VisibilityRow[], canSeeAll, actor.org?.id ?? null) as VendorEventPerformanceRow[];
}

async function isVenueOrFinance(actor: Actor, eventId: string): Promise<boolean> {
  const role = await getEventRole(actor, eventId);
  return role === "venue" || role === "finance";
}
