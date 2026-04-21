import { eq } from "drizzle-orm";
import { db, orders as ordersTable, orderItems as orderItemsTable, assets as assetsTable, invoices as invoicesTable } from "@workspace/db";
import { logAudit } from "./workflowEngine";

export type ValidationResult = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

export async function validateTransition(
  objectType: "asset" | "order_item" | "invoice",
  objectId: number,
  action: "approve" | "unblock" | "send",
  ctx: { overrideNote?: string | null; actorUserId?: string | null } = {},
): Promise<ValidationResult> {
  const r: ValidationResult = { ok: true, warnings: [], errors: [] };

  if (objectType === "asset" && action === "approve") {
    const [a] = await db.select().from(assetsTable).where(eq(assetsTable.id, objectId));
    if (a?.orderId) {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, a.orderId));
      const missing = items.filter(i => !i.artworkFileUrl).length;
      if (missing > 0) r.warnings.push(`${missing} order item(s) on this order still have no artwork attached.`);
    }
  }

  if (objectType === "order_item" && action === "unblock") {
    const [it] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, objectId));
    if (!it) { r.ok = false; r.errors.push("Order item not found"); return r; }
    if (!it.artworkFileUrl) {
      if (ctx.overrideNote) {
        r.warnings.push("Unblocking without artwork — override recorded.");
      } else {
        r.ok = false;
        r.errors.push("Cannot unblock: artwork is not attached. Provide an overrideNote to proceed anyway.");
      }
    }
  }

  if (objectType === "invoice" && action === "send") {
    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, objectId));
    if (inv?.orderId) {
      const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, inv.orderId));
      if (ord && ord.status === "new") r.warnings.push("Order has not yet been approved — sending invoice early.");
    }
  }

  if (ctx.overrideNote) {
    await logAudit({
      eventType: `guardrail.override.${objectType}.${action}`,
      actorUserId: ctx.actorUserId ?? null,
      isAutomated: false,
      objectType, objectId,
      summary: `Override on ${action} of ${objectType} #${objectId}`,
      details: { overrideNote: ctx.overrideNote, warnings: r.warnings, errors: r.errors },
    });
  }
  return r;
}
