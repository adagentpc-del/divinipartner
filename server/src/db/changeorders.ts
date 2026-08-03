/**
 * Divini Change Desk (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 8; originally built pre-spec as "Change Orders," blueprint section
 * 23). Controls scope, price, AND schedule changes to an in-flight event:
 * added/removed scope with a price delta, an optional requested new date,
 * sent for acceptance, then optionally folded into the invoice. Carries a
 * scope-creep flag so planners + admins can watch for runaway add-ons.
 * Every status transition is preserved in an append-only history table,
 * never overwritten (spec constraint 9).
 */
import { q, q1, pool } from "../pool.js";

export const CHANGE_ORDER_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "revision_requested",
  "added_to_invoice",
  "paid",
  "closed",
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  revision_requested: "Revision requested",
  added_to_invoice: "Added to invoice",
  paid: "Paid",
  closed: "Closed",
};

export interface ChangeOrderLineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
}

export interface ChangeOrderRow {
  id: string;
  change_order_number: string | null;
  event_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  vendor_id: string | null;
  requested_by: string | null;
  title: string | null;
  description: string | null;
  reason: string | null;
  line_items: ChangeOrderLineItem[] | null;
  subtotal: string | null;
  platform_fee: string | null;
  amount: string | null;
  scope_creep_flag: boolean;
  requested_new_date: string | null;
  schedule_change_note: string | null;
  status: string | null;
  responded_at: string | null;
  created_at: string;
}

function sum(items: ChangeOrderLineItem[] | undefined): number {
  if (!items?.length) return 0;
  return Math.round(items.reduce((acc, li) => acc + (Number(li.amount) || 0), 0) * 100) / 100;
}

/**
 * Scope-creep heuristic: a change order is flagged when its delta is large
 * relative to the event budget, when many add-ons accumulate, or when explicitly
 * marked. Conservative defaults; the route can pass an explicit flag too.
 */
export function detectScopeCreep(args: {
  amount: number;
  eventBudget?: number | null;
  priorChangeOrderCount?: number;
  explicit?: boolean;
}): boolean {
  if (args.explicit) return true;
  if ((args.priorChangeOrderCount ?? 0) >= 3) return true;
  if (args.eventBudget && args.eventBudget > 0) {
    return args.amount / args.eventBudget >= 0.15;
  }
  return false;
}

export interface CreateChangeOrderInput {
  event_id: string;
  quote_id?: string | null;
  invoice_id?: string | null;
  vendor_id?: string | null;
  title?: string | null;
  description?: string | null;
  reason?: string | null;
  line_items?: ChangeOrderLineItem[];
  platform_fee_rate?: number;
  scope_creep_flag?: boolean;
  requested_new_date?: string | null;
  schedule_change_note?: string | null;
  status?: ChangeOrderStatus;
}

function nextChangeOrderNumber(seq: number): string {
  const year = new Date().getFullYear();
  return `CO-${year}-${String(seq).padStart(5, "0")}`;
}

export async function createChangeOrder(
  requestedBy: string | null,
  input: CreateChangeOrderInput,
): Promise<ChangeOrderRow> {
  const lineItems = input.line_items ?? [];
  const subtotal = sum(lineItems);
  const feeRate = Number(input.platform_fee_rate) || 0;
  const platformFee = Math.round(subtotal * feeRate * 100) / 100;
  const amount = Math.round((subtotal + platformFee) * 100) / 100;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const budgetRow = (
      await client.query<{ budget: string | null }>(`select budget from events where id = $1`, [input.event_id])
    ).rows[0];
    const priorCount = (
      await client.query<{ c: string }>(`select count(*)::int as c from change_orders where event_id = $1`, [
        input.event_id,
      ])
    ).rows[0];
    const totalCount = (await client.query<{ c: string }>(`select count(*)::int as c from change_orders`)).rows[0];

    const scopeCreep = detectScopeCreep({
      amount,
      eventBudget: budgetRow?.budget != null ? Number(budgetRow.budget) : null,
      priorChangeOrderCount: Number(priorCount?.c) || 0,
      explicit: input.scope_creep_flag,
    });

    const status = input.status ?? "draft";
    const row = (
      await client.query<ChangeOrderRow>(
        `insert into change_orders
           (change_order_number, event_id, quote_id, invoice_id, vendor_id, requested_by, title,
            description, reason, line_items, subtotal, platform_fee, amount, scope_creep_flag,
            requested_new_date, schedule_change_note, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)
         returning *`,
        [
          nextChangeOrderNumber((Number(totalCount?.c) || 0) + 1),
          input.event_id,
          input.quote_id ?? null,
          input.invoice_id ?? null,
          input.vendor_id ?? null,
          requestedBy,
          input.title ?? null,
          input.description ?? null,
          input.reason ?? null,
          JSON.stringify(lineItems),
          subtotal,
          platformFee,
          amount,
          scopeCreep,
          input.requested_new_date ?? null,
          input.schedule_change_note ?? null,
          status,
        ],
      )
    ).rows[0];
    await client.query(
      `insert into change_order_status_history (change_order_id, from_status, to_status, changed_by)
       values ($1, null, $2, $3)`,
      [row.id, status, requestedBy],
    );
    await client.query("commit");
    return row;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function listChangeOrders(eventId: string, filters?: { status?: string }): Promise<ChangeOrderRow[]> {
  const params: unknown[] = [eventId];
  let extra = "";
  if (filters?.status) {
    params.push(filters.status);
    extra = ` and status = $${params.length}`;
  }
  return q<ChangeOrderRow>(
    `select * from change_orders where event_id = $1${extra} order by created_at desc`,
    params,
  );
}

export async function getChangeOrder(id: string): Promise<ChangeOrderRow | null> {
  return q1<ChangeOrderRow>(`select * from change_orders where id = $1`, [id]);
}

const ALLOWED: ReadonlySet<ChangeOrderStatus> = new Set(CHANGE_ORDER_STATUSES);

export async function updateChangeOrderStatus(
  id: string,
  status: ChangeOrderStatus,
  changedBy: string | null = null,
): Promise<ChangeOrderRow | null> {
  if (!ALLOWED.has(status)) throw new Error(`invalid change order status: ${status}`);
  const stamp =
    status === "accepted" || status === "declined" || status === "revision_requested" ? ", responded_at = now()" : "";

  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = (await client.query<{ status: string | null }>(`select status from change_orders where id = $1`, [id])).rows[0];
    if (!existing) {
      await client.query("rollback");
      return null;
    }
    const row = (
      await client.query<ChangeOrderRow>(
        `update change_orders set status = $2, updated_at = now()${stamp} where id = $1 returning *`,
        [id, status],
      )
    ).rows[0];
    await client.query(
      `insert into change_order_status_history (change_order_id, from_status, to_status, changed_by)
       values ($1,$2,$3,$4)`,
      [id, existing.status, status, changedBy],
    );
    await client.query("commit");
    return row;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export type ChangeOrderStatusHistoryRow = {
  id: string;
  change_order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
};

/** Append-only status history for a change order (spec constraint 9: never
 *  overwrite revision history). */
export async function listStatusHistory(changeOrderId: string): Promise<ChangeOrderStatusHistoryRow[]> {
  return q<ChangeOrderStatusHistoryRow>(
    `select * from change_order_status_history where change_order_id = $1 order by changed_at desc`,
    [changeOrderId],
  );
}

export const __test = { sum, detectScopeCreep, nextChangeOrderNumber };
