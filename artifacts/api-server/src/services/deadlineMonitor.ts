// @ts-nocheck
import {
  db,
  ordersTable,
  orderItemsTable,
  invoicesTable,
  eventsTable,
  assetsTable,
} from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { fire, deadlineHealth } from "./workflowEngine";

const TICK_MS = Number(process.env.WORKFLOW_TICK_MS || 60_000);
let timer: NodeJS.Timeout | null = null;
let running = false;

/** Sweep orders/invoices/events/items and fire deadline + readiness triggers. */
export async function tick() {
  if (running) return;
  running = true;
  try {
    await sweepInvoices();
    await sweepOrders();
    await sweepEvents();
    await sweepAssets();
  } catch (e: any) {
    console.error("[deadlineMonitor] tick failed:", e.message);
  } finally {
    running = false;
  }
}

async function sweepInvoices() {
  const rows = await db.select().from(invoicesTable);
  for (const inv of rows) {
    if (!inv.dueDate) continue;
    if (inv.status === "paid" || inv.status === "void" || inv.status === "cancelled") continue;
    const due = new Date(inv.dueDate);
    if (isNaN(due.getTime())) continue;
    const days = Math.floor((due.getTime() - Date.now()) / 86400_000);
    const ctx = {
      objectType: "invoice",
      objectId: inv.id,
      invoiceId: inv.id,
      partnerId: inv.partnerId ?? null,
      orderId: inv.orderId ?? null,
      invoiceNumber: inv.invoiceNumber,
      dueDate: inv.dueDate,
      daysUntilDue: days,
      daysOverdue: days < 0 ? -days : 0,
      kind: "invoice_due",
    };
    if (days < 0 && inv.status !== "paid") await fire("invoice.overdue", ctx);
    else if (days <= 7 && days >= 0) await fire("deadline.approaching", ctx);
  }
}

async function sweepOrders() {
  // NOTE: filter in JS instead of `where(isNotNull(...))` — earlier builds produced
  // an empty WHERE clause due to a drizzle/bundle interaction with this column.
  const allOrders = await db.select().from(ordersTable);
  const orders = allOrders.filter(o => !!o.supplierDueDate);
  for (const o of orders) {
    if (!o.supplierDueDate) continue;
    if (["completed", "cancelled", "fulfilled"].includes(o.status)) continue;
    const due = new Date(o.supplierDueDate);
    if (isNaN(due.getTime())) continue;
    const days = Math.floor((due.getTime() - Date.now()) / 86400_000);
    const ctx = {
      objectType: "order",
      objectId: o.id,
      orderId: o.id,
      partnerId: o.partnerId ?? null,
      eventId: o.eventId ?? null,
      supplierId: o.assignedSupplierId ?? null,
      orderNumber: o.orderNumber,
      daysUntilDue: days,
      kind: "order_supplier_due",
    };
    if (days < 0) await fire("deadline.overdue", ctx);
    else if (days <= 7) await fire("deadline.approaching", ctx);
  }
}

async function sweepEvents() {
  const events = await db.select().from(eventsTable);
  for (const ev of events) {
    const startStr = (ev as any).eventStartDate || (ev as any).installDate;
    if (!startStr) continue;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) continue;
    const days = Math.floor((start.getTime() - Date.now()) / 86400_000);
    if (days < 0 || days > 21) continue;
    const ctx = {
      objectType: "event",
      objectId: ev.id,
      eventId: ev.id,
      partnerId: (ev as any).partnerId ?? null,
      eventName: (ev as any).name,
      eventDate: startStr,
      daysUntilEvent: days,
    };
    await fire("event.approaching", ctx);
  }
}

async function sweepAssets() {
  // Assets uploaded > 24h ago and still pending → "asset.missing_approval"
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const stale = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.approvalStatus, "pending"), eq(assetsTable.isCurrent, true)));
  for (const a of stale) {
    if (a.createdAt > cutoff) continue;
    const ctx = {
      objectType: "asset",
      objectId: a.id,
      assetId: a.id,
      orderId: a.orderId ?? null,
      partnerId: a.partnerId ?? null,
      eventId: a.eventId ?? null,
      assetTitle: a.title,
    };
    await fire("asset.awaiting_approval", ctx);
  }
}

export function startDeadlineMonitor() {
  if (timer) return;
  // Run once shortly after boot, then on the interval
  setTimeout(() => { tick().catch(() => {}); }, 5_000);
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  console.log(`[deadlineMonitor] started (tick every ${TICK_MS}ms)`);
}

export function stopDeadlineMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Helper for routes/UI: classify a date. */
export function classifyDeadline(due: Date | string | null) {
  return deadlineHealth(due);
}
