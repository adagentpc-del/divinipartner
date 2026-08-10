/**
 * WS-1 - Completion hooks. When an event (regular or charity) reaches a terminal
 * status, durably record its history so the vendors AND sponsors who participated
 * are preserved, and persist the fundraising recap.
 *
 * Everything here is:
 *   - idempotent: event_memory upserts; event_history is skip-if-exists;
 *     fundraising_recaps upserts on its unique fundraising_event_id.
 *   - best-effort: callers invoke these fire-and-log so a recording hiccup never
 *     blocks the status-change response.
 *   - deterministic: no AI, no fabrication; every value comes from real rows.
 *
 * Authorization: reuses the actor who triggered the status change. All reads go
 * through the same IDOR-gated repos (getEvent / assertFundraisingEvent).
 */
import { q, q1 } from "../pool.js";
import type { Actor } from "../db.js";
import { getEvent } from "./events.js";
import { recordEventMemory } from "./event-memory.js";
import { recordHistory } from "./templates.js";
import { getFundraisingEvent } from "./fundraising.js";
import { generateRecap } from "./donor.js";

const TERMINAL = new Set(["completed", "closed", "archived"]);

/** True when a status string is a terminal (event-over) state. */
export function isTerminalStatus(s: string | null | undefined): boolean {
  return !!s && TERMINAL.has(String(s).trim().toLowerCase());
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Record the durable archive for a core events row: the rich event_memory
 * snapshot (which now includes charity sponsors) plus a compact event_history
 * summary carrying vendor AND sponsor participation. Idempotent.
 */
export async function recordEventArchive(actor: Actor, eventId: string): Promise<void> {
  // Rich snapshot (upsert on event_id, includes charity sponsors via WS-1 edit).
  await recordEventMemory(actor, eventId);

  // Skip-if-exists keeps history idempotent across re-transitions.
  const existing = await q1<{ id: string }>(
    `select id from event_history where event_id = $1 limit 1`,
    [eventId],
  );
  if (existing) return;

  const ev = await getEvent(actor, eventId); // IDOR gate + fields

  const venueOrg = ev.venue_id
    ? await q1<{ organization_id: string | null }>(
        `select organization_id from venues where id = $1`,
        [ev.venue_id],
      )
    : null;

  // Spend: prefer collected payments, fall back to invoiced totals.
  const spendRow = await q1<{ paid: string | null; invoiced: string | null }>(
    `select
        coalesce((select sum(p.amount) from payments p
                    join invoices i on i.id = p.invoice_id
                   where i.event_id = $1
                     and (p.status is null or p.status not in ('failed','refunded'))), 0) as paid,
        coalesce((select sum(total) from invoices where event_id = $1), 0) as invoiced`,
    [eventId],
  );
  const paid = toNum(spendRow?.paid);
  const totalSpend = paid > 0 ? paid : toNum(spendRow?.invoiced);

  const vendorOrgs = await q<{ organization_id: string | null; role: string | null }>(
    `select distinct organization_id, role from event_vendors where event_id = $1 and status <> 'declined'`,
    [eventId],
  );
  const vendorOrgIds = vendorOrgs
    .map((v) => v.organization_id)
    .filter((id): id is string => !!id);
  const roleCats = Array.from(
    new Set(vendorOrgs.map((v) => v.role).filter((r): r is string => !!r)),
  );
  const categories = roleCats.length ? roleCats : ev.required_services ?? [];

  // Sponsor participation from charity purchases linked to this event.
  const sponsorRows = await q<{ sponsor_org_id: string | null; amount: string | null }>(
    `select spur.sponsor_org_id, spur.amount
       from sponsor_purchases spur
       join fundraising_events fe on fe.id = spur.fundraising_event_id
      where fe.event_id = $1`,
    [eventId],
  );
  const sponsorOrgIds = Array.from(
    new Set(sponsorRows.map((s) => s.sponsor_org_id).filter((id): id is string => !!id)),
  );
  const sponsorTotal = sponsorRows.reduce((sum, s) => sum + toNum(s.amount), 0);

  await recordHistory(actor, {
    event_id: ev.id,
    name: ev.name,
    event_type: ev.type,
    venue_id: ev.venue_id,
    venue_org_id: venueOrg?.organization_id ?? null,
    guest_count: ev.guest_count,
    total_spend: totalSpend,
    budget: ev.budget != null ? Number(ev.budget) : null,
    categories,
    vendor_org_ids: vendorOrgIds,
    sponsor_org_ids: sponsorOrgIds,
    sponsor_total: sponsorTotal,
    outcome: "completed",
  });
}

/**
 * Persist the board-ready recap for a fundraising event, plus its sponsor and
 * vendor rosters, and stamp completed_at. Idempotent (upsert on the unique
 * fundraising_event_id; completed_at only set once).
 */
export async function recordFundraisingRecap(actor: Actor, feId: string): Promise<void> {
  const fe = await getFundraisingEvent(actor, feId); // IDOR gate
  const recap = await generateRecap(actor, feId);

  const sponsors = await q<{
    sponsor_org_id: string | null;
    name: string | null;
    tier: string | null;
    amount: string | null;
    status: string | null;
  }>(
    `select spur.sponsor_org_id, o.name, pkg.tier, spur.amount, spur.status
       from sponsor_purchases spur
       left join sponsorship_packages pkg on pkg.id = spur.sponsorship_package_id
       left join organizations o on o.id = spur.sponsor_org_id
      where spur.fundraising_event_id = $1
      order by spur.created_at asc`,
    [feId],
  );

  const vendors = fe.event_id
    ? await q<Record<string, unknown>>(
        `select ev.organization_id, ev.vendor_id, ev.role, ev.status, o.name
           from event_vendors ev
           left join organizations o on o.id = ev.organization_id
          where ev.event_id = $1 and ev.status <> 'declined'
          order by ev.created_at asc`,
        [fe.event_id],
      )
    : [];

  await q1(
    `insert into fundraising_recaps
       (fundraising_event_id, organization_id, event_id, goal_amount, raised_total,
        net_raised, sponsorship_revenue, donations_total, donors_count, guest_count,
        sponsors_used, vendors_used, board_report_text, sponsor_recap_text, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (fundraising_event_id) do update set
        organization_id = excluded.organization_id,
        event_id = excluded.event_id,
        goal_amount = excluded.goal_amount,
        raised_total = excluded.raised_total,
        net_raised = excluded.net_raised,
        sponsorship_revenue = excluded.sponsorship_revenue,
        donations_total = excluded.donations_total,
        donors_count = excluded.donors_count,
        guest_count = excluded.guest_count,
        sponsors_used = excluded.sponsors_used,
        vendors_used = excluded.vendors_used,
        board_report_text = excluded.board_report_text,
        sponsor_recap_text = excluded.sponsor_recap_text,
        updated_at = now()`,
    [
      feId,
      fe.organization_id,
      fe.event_id,
      recap.goalAmount,
      recap.totalRaised,
      recap.netRaised,
      recap.sponsorshipRevenue,
      recap.donationsTotal,
      recap.donationCount,
      recap.guestCount,
      JSON.stringify(sponsors),
      JSON.stringify(vendors),
      recap.boardReport,
      recap.sponsorRecap,
    ],
  );

  await q(
    `update fundraising_events set completed_at = coalesce(completed_at, now())
      where id = $1`,
    [feId],
  );
}

/**
 * Fired when a core event reaches a terminal status. Records the event archive,
 * then persists the recap for any fundraising event linked to it. Does NOT call
 * onFundraisingCompleted (which would loop) - it records the recap directly.
 */
export async function onEventCompleted(actor: Actor, eventId: string): Promise<void> {
  await recordEventArchive(actor, eventId);
  const linked = await q<{ id: string }>(
    `select id from fundraising_events where event_id = $1`,
    [eventId],
  );
  for (const fe of linked) {
    try {
      await recordFundraisingRecap(actor, fe.id);
    } catch (err) {
      console.error(`[WS-1] fundraising recap failed for ${fe.id}`, err);
    }
  }
}

/**
 * Fired when a fundraising event reaches a terminal status. Persists the recap,
 * then archives the linked core event (if any). Does NOT call onEventCompleted
 * (which would loop) - it records the archive directly.
 */
export async function onFundraisingCompleted(actor: Actor, feId: string): Promise<void> {
  await recordFundraisingRecap(actor, feId);
  const fe = await q1<{ event_id: string | null }>(
    `select event_id from fundraising_events where id = $1`,
    [feId],
  );
  if (fe?.event_id) {
    try {
      await recordEventArchive(actor, fe.event_id);
    } catch (err) {
      console.error(`[WS-1] event archive failed for ${fe.event_id}`, err);
    }
  }
}
