/**
 * Phase 8 - Reporting / Exports (blueprint 41).
 *
 * Returns STRUCTURED data (columns + rows) the SPA can render as a table and
 * download as CSV. No PDF dependency; the shape is `{ title, columns, rows }`
 * where columns are { key, label } and rows are objects keyed by column key.
 *
 * Reports are org-scoped for non-admins; the admin revenue report requires an
 * admin and spans the whole platform (the route enforces this).
 */
import { q } from "../pool.js";
import type { Actor } from "../db.js";

export interface ReportColumn {
  key: string;
  label: string;
}
export interface Report {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
}

export const REPORT_TYPES = [
  { key: "event_summary", label: "Event summary", admin: false },
  { key: "bid_comparison", label: "Bid comparison", admin: false },
  { key: "payment_report", label: "Payment report", admin: false },
  { key: "vendor_performance", label: "Vendor performance", admin: false },
  { key: "admin_revenue", label: "Platform revenue", admin: true },
] as const;

function wrap(
  key: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
): Report {
  return { key, title, columns, rows, generated_at: new Date().toISOString() };
}

function isAdminActor(actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** org-scope predicate for non-admins (params start at $1). */
function scope(actor: Actor, isAdmin: boolean, col = "organization_id"): { clause: string; params: unknown[] } {
  if (isAdminActor(actor, isAdmin)) return { clause: "", params: [] };
  return { clause: `where ${col} = $1`, params: [actor.org?.id ?? null] };
}

/** Event summary: one row per event the org owns (or all, for admin). */
export async function eventSummary(actor: Actor, isAdmin: boolean): Promise<Report> {
  const s = scope(actor, isAdmin, "e.organization_id");
  const rows = await q<Record<string, unknown>>(
    `select e.name, e.type, e.status,
            to_char(e.date_time, 'YYYY-MM-DD') as date,
            e.guest_count, e.budget,
            ve.name as venue
       from events e left join venues ve on ve.id = e.venue_id
       ${s.clause}
      order by e.created_at desc limit 1000`,
    s.params,
  );
  return wrap("event_summary", "Event summary", [
    { key: "name", label: "Event" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date" },
    { key: "guest_count", label: "Guests" },
    { key: "budget", label: "Budget" },
    { key: "venue", label: "Venue" },
  ], rows);
}

/** Bid comparison: quotes grouped by bid for an event. */
export async function bidComparison(
  actor: Actor,
  isAdmin: boolean,
  eventId: string,
): Promise<Report> {
  // visibility: admin, or the actor's org is connected to the event
  const guard = isAdminActor(actor, isAdmin)
    ? { clause: `where q.event_id = $1`, params: [eventId] as unknown[] }
    : {
        clause: `where q.event_id = $1 and (e.organization_id = $2 or e.client_id = $3 or e.planner_id = $3)`,
        params: [eventId, actor.org?.id ?? null, actor.user.id] as unknown[],
      };
  const rows = await q<Record<string, unknown>>(
    `select b.category, o.name as vendor, q.status,
            q.subtotal, q.platform_fee, q.total
       from quotes q
       join bids b on b.id = q.bid_id
       join events e on e.id = q.event_id
       left join vendors vd on vd.id = q.vendor_id
       left join organizations o on o.id = vd.organization_id
       ${guard.clause}
      order by q.total asc nulls last limit 500`,
    guard.params,
  );
  return wrap("bid_comparison", "Bid comparison", [
    { key: "category", label: "Category" },
    { key: "vendor", label: "Vendor" },
    { key: "status", label: "Status" },
    { key: "subtotal", label: "Subtotal" },
    { key: "platform_fee", label: "Platform fee" },
    { key: "total", label: "Total" },
  ], rows);
}

/** Payment report: payments tied to the org's invoices (or all, for admin). */
export async function paymentReport(actor: Actor, isAdmin: boolean): Promise<Report> {
  const admin = isAdminActor(actor, isAdmin);
  const rows = await q<Record<string, unknown>>(
    `select to_char(p.created_at,'YYYY-MM-DD') as date,
            p.amount, p.method, p.status, p.platform_fee, p.payout_status,
            p.external_payment_flag as external
       from payments p
       join invoices i on i.id = p.invoice_id
       ${admin ? "" : "where i.organization_id = $1"}
      order by p.created_at desc limit 1000`,
    admin ? [] : [actor.org?.id ?? null],
  );
  return wrap("payment_report", "Payment report", [
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "method", label: "Method" },
    { key: "status", label: "Status" },
    { key: "platform_fee", label: "Platform fee" },
    { key: "payout_status", label: "Payout" },
    { key: "external", label: "External" },
  ], rows);
}

/** Vendor performance: quotes won/lost + volume per vendor org. */
export async function vendorPerformance(actor: Actor, isAdmin: boolean): Promise<Report> {
  const admin = isAdminActor(actor, isAdmin);
  const rows = await q<Record<string, unknown>>(
    `select o.name as vendor,
            count(q.id)::int as quotes,
            count(q.id) filter (where q.status in ('accepted','converted'))::int as won,
            coalesce(sum(q.total) filter (where q.status in ('accepted','converted')),0) as won_volume,
            round(avg(coalesce(vd.review_score,0))::numeric,2) as rating
       from organizations o
       join vendors vd on vd.organization_id = o.id
       left join quotes q on q.vendor_id = vd.id
       ${admin ? "" : "where o.id = $1"}
      group by o.name
      order by won desc, quotes desc limit 500`,
    admin ? [] : [actor.org?.id ?? null],
  );
  return wrap("vendor_performance", "Vendor performance", [
    { key: "vendor", label: "Vendor" },
    { key: "quotes", label: "Quotes" },
    { key: "won", label: "Won" },
    { key: "won_volume", label: "Won volume" },
    { key: "rating", label: "Rating" },
  ], rows);
}

/** Admin revenue: platform-wide GMV + fees per month (admin only). */
export async function adminRevenue(): Promise<Report> {
  const rows = await q<Record<string, unknown>>(
    `select to_char(date_trunc('month', created_at),'YYYY-MM') as month,
            count(*)::int as invoices,
            coalesce(sum(total),0) as gmv,
            coalesce(sum(platform_fee),0) as platform_fees
       from invoices
      group by 1 order by 1 desc limit 36`,
  );
  return wrap("admin_revenue", "Platform revenue", [
    { key: "month", label: "Month" },
    { key: "invoices", label: "Invoices" },
    { key: "gmv", label: "GMV" },
    { key: "platform_fees", label: "Platform fees" },
  ], rows);
}
