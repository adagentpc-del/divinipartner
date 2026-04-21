import {
  db,
  workflowRulesTable,
  workflowTasksTable,
  workflowAlertsTable,
  workflowAuditTable,
  type WorkflowRule,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

// =====================================================================
// Types
// =====================================================================
export type TriggerContext = {
  // Generic identifiers — set whichever apply
  partnerId?: number | null;
  eventId?: number | null;
  orderId?: number | null;
  orderItemId?: number | null;
  supplierId?: number | null;
  invoiceId?: number | null;
  assetId?: number | null;
  // Free-form fields evaluated by conditions / interpolated by actions
  [key: string]: any;
};

export type Action =
  | { type: "create_task"; params: { title: string; category?: string; priority?: string; ownerUserId?: string; dueInDays?: number; dueDate?: string; description?: string } }
  | { type: "create_alert"; params: { title: string; severity?: string; message?: string } }
  | { type: "draft_communication"; params: { template: string; to?: string } }
  | { type: "set_priority"; params: { priority: string } }
  | { type: "flag_blocked"; params: { reason: string } }
  | { type: "log_audit"; params: { summary: string } };

// =====================================================================
// Condition evaluator (small, predictable)
// =====================================================================
type CondClause = { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists" | "missing"; value?: any };
function evalConditions(conds: any, ctx: TriggerContext): boolean {
  if (!conds) return true;
  if (Array.isArray(conds)) return conds.every((c) => evalSingle(c, ctx));
  if (conds.all) return (conds.all as CondClause[]).every((c) => evalSingle(c, ctx));
  if (conds.any) return (conds.any as CondClause[]).some((c) => evalSingle(c, ctx));
  if (Object.keys(conds).length === 0) return true;
  // Plain object form: {field: value} → eq
  return Object.entries(conds).every(([k, v]) => ctx[k] === v);
}
function evalSingle(c: CondClause, ctx: TriggerContext): boolean {
  const v = ctx[c.field];
  switch (c.op) {
    case "eq": return v === c.value;
    case "neq": return v !== c.value;
    case "gt": return v != null && v > c.value;
    case "gte": return v != null && v >= c.value;
    case "lt": return v != null && v < c.value;
    case "lte": return v != null && v <= c.value;
    case "in": return Array.isArray(c.value) && c.value.includes(v);
    case "exists": return v != null && v !== "";
    case "missing": return v == null || v === "";
    default: return true;
  }
}

// =====================================================================
// String interpolation for action params: "{orderId}" → ctx.orderId
// =====================================================================
function interpolate(s: any, ctx: TriggerContext): any {
  if (typeof s !== "string") return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ""));
}
function interpolateParams(p: any, ctx: TriggerContext): any {
  if (p == null) return p;
  if (typeof p === "string") return interpolate(p, ctx);
  if (Array.isArray(p)) return p.map((x) => interpolateParams(x, ctx));
  if (typeof p === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(p)) out[k] = interpolateParams(v, ctx);
    return out;
  }
  return p;
}

// =====================================================================
// Audit log helper
// =====================================================================
export async function logAudit(args: {
  eventType: string;
  summary: string;
  details?: Record<string, any>;
  isAutomated?: boolean;
  actorUserId?: string | null;
  sourceRuleId?: number | null;
  objectType?: string;
  objectId?: number;
  ctx?: TriggerContext;
  overrideNote?: string | null;
}, tx?: any) {
  const exec = tx ?? db;
  await exec.insert(workflowAuditTable).values({
    eventType: args.eventType,
    summary: args.summary,
    detailsJson: args.details ?? {},
    isAutomated: args.isAutomated ?? true,
    actorUserId: args.actorUserId ?? null,
    sourceRuleId: args.sourceRuleId ?? null,
    objectType: args.objectType ?? args.ctx?.objectType ?? null,
    objectId: args.objectId ?? args.ctx?.objectId ?? null,
    partnerId: args.ctx?.partnerId ?? null,
    eventId: args.ctx?.eventId ?? null,
    orderId: args.ctx?.orderId ?? null,
    supplierId: args.ctx?.supplierId ?? null,
    invoiceId: args.ctx?.invoiceId ?? null,
    assetId: args.ctx?.assetId ?? null,
    overrideNote: args.overrideNote ?? null,
  } as any);
}

// =====================================================================
// Action runners
// =====================================================================
async function runCreateTask(rule: WorkflowRule, params: any, ctx: TriggerContext) {
  const dueDate = params.dueDate
    ? new Date(params.dueDate)
    : params.dueInDays != null
      ? new Date(Date.now() + Number(params.dueInDays) * 86400_000)
      : null;
  // Idempotency: stable key per (rule, linked object)
  const linkedObjectType = ctx.objectType || rule.objectType || null;
  const linkedObjectId = ctx.objectId ?? ctx.assetId ?? ctx.orderItemId ?? ctx.orderId ?? ctx.invoiceId ?? ctx.supplierId ?? ctx.eventId ?? ctx.partnerId ?? null;
  const dedupeKey = `rule:${rule.id}:${linkedObjectType}:${linkedObjectId}`;
  // Skip if an open dedupe match already exists
  const existing = await db.select().from(workflowTasksTable)
    .where(and(eq(workflowTasksTable.dedupeKey, dedupeKey), sql`${workflowTasksTable.status} IN ('open','in_progress','waiting')`));
  if (existing.length) return existing[0];
  const inserted = await db.insert(workflowTasksTable).values({
    title: params.title,
    description: params.description ?? null,
    category: params.category ?? "general",
    priority: params.priority ?? rule.priority ?? "medium",
    escalationLevel: rule.escalationLevel ?? "none",
    deadlineHealth: dueDate ? deadlineHealth(dueDate) : null,
    ownerUserId: params.ownerUserId ?? null,
    dueDate,
    linkedObjectType,
    linkedObjectId,
    partnerId: ctx.partnerId ?? null,
    eventId: ctx.eventId ?? null,
    orderId: ctx.orderId ?? null,
    orderItemId: ctx.orderItemId ?? null,
    supplierId: ctx.supplierId ?? null,
    invoiceId: ctx.invoiceId ?? null,
    assetId: ctx.assetId ?? null,
    autoCreated: true,
    sourceRuleId: rule.id,
    dedupeKey,
  } as any).onConflictDoNothing({ target: workflowTasksTable.dedupeKey }).returning();
  const row = inserted[0];
  if (!row) {
    const [existing2] = await db.select().from(workflowTasksTable).where(eq(workflowTasksTable.dedupeKey, dedupeKey));
    return existing2;
  }
  await logAudit({ eventType: "task_created", summary: `Auto-task: ${params.title}`, details: { taskId: row.id, ruleId: rule.id }, sourceRuleId: rule.id, objectType: linkedObjectType ?? undefined, objectId: linkedObjectId ?? undefined, ctx });
  return row;
}

async function runCreateAlert(rule: WorkflowRule, params: any, ctx: TriggerContext) {
  const linkedObjectType = ctx.objectType || rule.objectType || null;
  const linkedObjectId = ctx.objectId ?? ctx.assetId ?? ctx.orderId ?? ctx.invoiceId ?? null;
  const dedupeKey = `rule:${rule.id}:${linkedObjectType}:${linkedObjectId}:alert`;
  const existing = await db.select().from(workflowAlertsTable)
    .where(and(eq(workflowAlertsTable.dedupeKey, dedupeKey), eq(workflowAlertsTable.isResolved, false)));
  if (existing.length) return existing[0];
  const insertedA = await db.insert(workflowAlertsTable).values({
    title: params.title,
    message: params.message ?? null,
    severity: params.severity ?? "warning",
    linkedObjectType,
    linkedObjectId,
    partnerId: ctx.partnerId ?? null,
    eventId: ctx.eventId ?? null,
    orderId: ctx.orderId ?? null,
    supplierId: ctx.supplierId ?? null,
    invoiceId: ctx.invoiceId ?? null,
    assetId: ctx.assetId ?? null,
    autoCreated: true,
    sourceRuleId: rule.id,
    dedupeKey,
  } as any).onConflictDoNothing({ target: workflowAlertsTable.dedupeKey }).returning();
  const row = insertedA[0];
  if (!row) {
    const [existing2] = await db.select().from(workflowAlertsTable).where(eq(workflowAlertsTable.dedupeKey, dedupeKey));
    return existing2;
  }
  await logAudit({ eventType: "alert_created", summary: `Auto-alert: ${params.title}`, details: { alertId: row.id, ruleId: rule.id }, sourceRuleId: rule.id, ctx });
  return row;
}

async function runAction(rule: WorkflowRule, action: Action, ctx: TriggerContext) {
  const params = interpolateParams(action.params || {}, ctx);
  switch (action.type) {
    case "create_task": return runCreateTask(rule, params, ctx);
    case "create_alert": return runCreateAlert(rule, params, ctx);
    case "draft_communication":
      // Stub: drop a comm draft into the audit trail (real comms wiring is a follow-up).
      await logAudit({ eventType: "comm_drafted", summary: `Comm draft: ${params.template}`, details: { template: params.template, to: params.to }, sourceRuleId: rule.id, ctx });
      return null;
    case "set_priority":
      await logAudit({ eventType: "escalation_set", summary: `Priority set to ${params.priority}`, details: params, sourceRuleId: rule.id, ctx });
      return null;
    case "flag_blocked":
      await logAudit({ eventType: "blocked", summary: `Flagged blocked: ${params.reason}`, details: params, sourceRuleId: rule.id, ctx });
      return null;
    case "log_audit":
      await logAudit({ eventType: "rule_fired", summary: params.summary, details: params, sourceRuleId: rule.id, ctx });
      return null;
  }
}

// =====================================================================
// Public API: fire(triggerType, ctx) — called from hooks & scheduler
// =====================================================================
export async function fire(triggerType: string, ctx: TriggerContext = {}): Promise<{ ruleCount: number; results: any[] }> {
  try {
    const rules = await db.select().from(workflowRulesTable).where(and(eq(workflowRulesTable.triggerType, triggerType), eq(workflowRulesTable.isActive, true)));
    const results: any[] = [];
    for (const rule of rules) {
      if (!evalConditions(rule.conditionsJson, ctx)) continue;
      await logAudit({ eventType: "rule_fired", summary: `Rule "${rule.name}" fired by ${triggerType}`, details: { triggerType, ruleId: rule.id }, sourceRuleId: rule.id, ctx });
      const actions = (rule.actionsJson || []) as Action[];
      for (const a of actions) {
        try {
          const r = await runAction(rule, a, ctx);
          results.push({ ruleId: rule.id, action: a.type, result: r });
        } catch (e: any) {
          await logAudit({ eventType: "rule_fired", summary: `Action ${a.type} failed: ${e.message}`, details: { error: e.message }, sourceRuleId: rule.id, ctx });
        }
      }
    }
    return { ruleCount: rules.length, results };
  } catch (e: any) {
    console.error(`[workflowEngine] fire(${triggerType}) failed:`, e.message);
    return { ruleCount: 0, results: [] };
  }
}

// =====================================================================
// Deadline health classifier
// =====================================================================
export function deadlineHealth(due: Date | string | null): "on_track" | "due_soon" | "at_risk" | "overdue" | null {
  if (!due) return null;
  const d = typeof due === "string" ? new Date(due) : due;
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((d.getTime() - Date.now()) / 86400_000);
  if (days < 0) return "overdue";
  if (days <= 2) return "at_risk";
  if (days <= 7) return "due_soon";
  return "on_track";
}

// =====================================================================
// Default system rules — seeded on boot if workflow_rules is empty
// =====================================================================
export const DEFAULT_RULES: Array<Partial<WorkflowRule>> = [
  {
    name: "Missing artwork follow-up",
    description: "When an order is approved with line items requiring artwork that has not been uploaded, create a follow-up task.",
    triggerType: "order.approved",
    objectType: "order",
    conditionsJson: { all: [{ field: "missingArtworkCount", op: "gt", value: 0 }] },
    actionsJson: [
      { type: "create_task", params: { title: "Chase missing artwork for order {orderNumber}", category: "asset_follow_up", priority: "high", dueInDays: 2 } },
      { type: "create_alert", params: { title: "Order {orderNumber} missing artwork", severity: "warning", message: "{missingArtworkCount} line item(s) need artwork." } },
    ],
    priority: "high",
    escalationLevel: "medium",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Supplier unassigned follow-up",
    description: "When an order is approved without a supplier assignment on a line item, create a follow-up task.",
    triggerType: "order.approved",
    objectType: "order",
    conditionsJson: { all: [{ field: "unassignedItemCount", op: "gt", value: 0 }] },
    actionsJson: [
      { type: "create_task", params: { title: "Assign supplier on order {orderNumber}", category: "supplier_follow_up", priority: "high", dueInDays: 1 } },
    ],
    priority: "high",
    escalationLevel: "medium",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Asset awaiting approval",
    description: "When a new asset is uploaded, create a review task.",
    triggerType: "asset.uploaded",
    objectType: "asset",
    actionsJson: [
      { type: "create_task", params: { title: "Review asset: {assetTitle}", category: "approval", priority: "medium", dueInDays: 1 } },
    ],
    priority: "medium",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Asset revision requested",
    description: "When an asset is sent back for revision, draft a communication and follow-up task.",
    triggerType: "asset.revision_requested",
    objectType: "asset",
    actionsJson: [
      { type: "create_task", params: { title: "Follow up on revision: {assetTitle}", category: "asset_follow_up", priority: "high", dueInDays: 2 } },
      { type: "draft_communication", params: { template: "asset_revision_requested" } },
    ],
    priority: "high",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Production blocked escalation",
    description: "When a line item is flagged blocked, create an alert + task.",
    triggerType: "production.blocked",
    objectType: "order_item",
    actionsJson: [
      { type: "create_alert", params: { title: "Production blocked on order {orderNumber}", severity: "critical", message: "{blockedReason}" } },
      { type: "create_task", params: { title: "Resolve production block on order {orderNumber}", category: "production_review", priority: "urgent", dueInDays: 1 } },
    ],
    priority: "urgent",
    escalationLevel: "high",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Invoice sent — payment follow-up",
    description: "When an invoice is sent, schedule a payment follow-up task on the due date.",
    triggerType: "invoice.sent",
    objectType: "invoice",
    actionsJson: [
      { type: "create_task", params: { title: "Confirm payment for invoice {invoiceNumber}", category: "billing_follow_up", priority: "medium", dueInDays: 30 } },
    ],
    priority: "medium",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Invoice overdue escalation",
    description: "When an invoice becomes overdue, create a high-priority follow-up.",
    triggerType: "invoice.overdue",
    objectType: "invoice",
    actionsJson: [
      { type: "create_alert", params: { title: "Invoice {invoiceNumber} overdue", severity: "critical", message: "Past due by {daysOverdue} days." } },
      { type: "create_task", params: { title: "Chase overdue invoice {invoiceNumber}", category: "billing_follow_up", priority: "urgent", dueInDays: 1 } },
      { type: "draft_communication", params: { template: "invoice_overdue" } },
    ],
    priority: "urgent",
    escalationLevel: "high",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Event approaching readiness check",
    description: "When an event is within 14 days, surface readiness issues.",
    triggerType: "event.approaching",
    objectType: "event",
    conditionsJson: { all: [{ field: "daysUntilEvent", op: "lte", value: 14 }] },
    actionsJson: [
      { type: "create_task", params: { title: "Event readiness check: {eventName}", category: "event_prep", priority: "high", dueInDays: 1 } },
    ],
    priority: "high",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Supplier due-soon vendor reminder",
    description: "When a supplier-assigned line item is approaching its due date, draft a vendor reminder.",
    triggerType: "deadline.approaching",
    objectType: "order_item",
    conditionsJson: { all: [{ field: "kind", op: "eq", value: "supplier_due" }, { field: "daysUntilDue", op: "lte", value: 5 }] },
    actionsJson: [
      { type: "draft_communication", params: { template: "vendor_due_reminder" } },
      { type: "create_task", params: { title: "Vendor reminder due for order {orderNumber}", category: "supplier_follow_up", priority: "medium", dueInDays: 1 } },
    ],
    priority: "medium",
    isSystem: true,
    isActive: true,
  },
  {
    name: "Reconciliation discrepancy follow-up",
    description: "When reconciliation flags a discrepancy, create a review task.",
    triggerType: "reconciliation.discrepancy",
    objectType: "order",
    actionsJson: [
      { type: "create_task", params: { title: "Reconcile discrepancy on order {orderNumber}", category: "reconciliation", priority: "high", dueInDays: 3 } },
      { type: "create_alert", params: { title: "Reconciliation discrepancy: {orderNumber}", severity: "warning" } },
    ],
    priority: "high",
    isSystem: true,
    isActive: true,
  },
];

export async function seedDefaultRulesIfEmpty() {
  try {
    const existing = await db.select({ id: workflowRulesTable.id }).from(workflowRulesTable).limit(1);
    if (existing.length) return { seeded: false, count: 0 };
    await db.insert(workflowRulesTable).values(DEFAULT_RULES as any);
    console.log(`[workflowEngine] Seeded ${DEFAULT_RULES.length} default rules.`);
    return { seeded: true, count: DEFAULT_RULES.length };
  } catch (e: any) {
    console.error("[workflowEngine] seedDefaultRulesIfEmpty failed:", e.message);
    return { seeded: false, count: 0 };
  }
}
