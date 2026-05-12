import { Router } from "express";
import {
  db,
  workflowRulesTable,
  workflowTasksTable,
  workflowAlertsTable,
  workflowAuditTable,
  ordersTable,
  invoicesTable,
} from "@workspace/db";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { fire, logAudit, deadlineHealth, DEFAULT_RULES } from "../services/workflowEngine";
import { tick as runTick } from "../services/deadlineMonitor";
import { z } from "zod";
import {
  ListWorkflowRulesResponse,
  GetWorkflowRuleResponse,
  CreateWorkflowRuleResponse,
  UpdateWorkflowRuleResponse,
  ToggleWorkflowRuleResponse,
  DuplicateWorkflowRuleResponse,
  DeleteWorkflowRuleResponse,
  ListWorkflowTasksResponse,
  CreateWorkflowTaskResponse,
  UpdateWorkflowTaskResponse,
  CompleteWorkflowTaskResponse,
  SnoozeWorkflowTaskResponse,
  ListWorkflowAlertsResponse,
  MarkWorkflowAlertReadResponse,
  ResolveWorkflowAlertResponse,
  ListWorkflowAuditResponse,
  ApplyWorkflowOverrideResponse,
  GetWorkflowQueueResponse,
  FireWorkflowTriggerResponse,
  TickWorkflowDeadlinesResponse,
  SeedWorkflowDefaultsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router = Router();

// =====================================================================
// Rules
// =====================================================================
router.get("/workflow/rules", async (req, res) => {
  const { triggerType, isActive } = req.query;
  const conds: any[] = [];
  if (triggerType) conds.push(eq(workflowRulesTable.triggerType, String(triggerType)));
  if (isActive != null) conds.push(eq(workflowRulesTable.isActive, isActive === "true"));
  const rows = await db.select().from(workflowRulesTable).where(conds.length ? and(...conds) : (sql`TRUE` as any)).orderBy(desc(workflowRulesTable.updatedAt));
  sendValidated(req, res, ListWorkflowRulesResponse, rows, "List workflow rules");
});
router.get("/workflow/rules/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(workflowRulesTable).where(eq(workflowRulesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, GetWorkflowRuleResponse, row, "Get workflow rule");
});
const RuleBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  triggerType: z.string().min(1),
  objectType: z.string().nullable().optional(),
  conditionsJson: z.any().optional(),
  actionsJson: z.array(z.any()).optional(),
  priority: z.string().optional(),
  escalationLevel: z.string().optional(),
  portalTypes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/workflow/rules", async (req, res) => {
  const parsed = RuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(workflowRulesTable).values(parsed.data as any).returning();
  await logAudit({ eventType: "rule_fired", summary: `Rule created: ${row.name}`, details: { ruleId: row.id }, isAutomated: false });
  sendValidated(req, res, CreateWorkflowRuleResponse, row, "Create workflow rule");
});
router.patch("/workflow/rules/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = RuleBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(workflowRulesTable).set({ ...parsed.data, updatedAt: new Date() } as any).where(eq(workflowRulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UpdateWorkflowRuleResponse, row, "Update workflow rule");
});
router.post("/workflow/rules/:id/toggle", async (req, res) => {
  const id = parseInt(req.params.id);
  const [prev] = await db.select().from(workflowRulesTable).where(eq(workflowRulesTable.id, id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(workflowRulesTable).set({ isActive: !prev.isActive, updatedAt: new Date() }).where(eq(workflowRulesTable.id, id)).returning();
  sendValidated(req, res, ToggleWorkflowRuleResponse, row, "Toggle workflow rule");
});
router.post("/workflow/rules/:id/duplicate", async (req, res) => {
  const id = parseInt(req.params.id);
  const [src] = await db.select().from(workflowRulesTable).where(eq(workflowRulesTable.id, id));
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  const { id: _ignore, createdAt, updatedAt, ...rest } = src as any;
  const [row] = await db.insert(workflowRulesTable).values({ ...rest, name: `${src.name} (copy)`, isSystem: false, isActive: false } as any).returning();
  sendValidated(req, res, DuplicateWorkflowRuleResponse, row, "Duplicate workflow rule");
});
router.delete("/workflow/rules/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(workflowRulesTable).where(eq(workflowRulesTable.id, id));
  sendValidated(req, res, DeleteWorkflowRuleResponse, { success: true }, "Delete workflow rule");
});

// =====================================================================
// Tasks
// =====================================================================
router.get("/workflow/tasks", async (req, res) => {
  const { status, category, ownerUserId, partnerId, eventId, orderId, supplierId, invoiceId, priority, escalationLevel, autoCreated, deadlineHealth: dh, linkedObjectType } = req.query;
  const conds: any[] = [];
  if (status) {
    if (status === "open_any") conds.push(sql`${workflowTasksTable.status} IN ('open','in_progress','waiting')`);
    else conds.push(eq(workflowTasksTable.status, String(status)));
  }
  if (category) conds.push(eq(workflowTasksTable.category, String(category)));
  if (ownerUserId) conds.push(eq(workflowTasksTable.ownerUserId, String(ownerUserId)));
  if (partnerId) conds.push(eq(workflowTasksTable.partnerId, parseInt(String(partnerId))));
  if (eventId) conds.push(eq(workflowTasksTable.eventId, parseInt(String(eventId))));
  if (orderId) conds.push(eq(workflowTasksTable.orderId, parseInt(String(orderId))));
  if (supplierId) conds.push(eq(workflowTasksTable.supplierId, parseInt(String(supplierId))));
  if (invoiceId) conds.push(eq(workflowTasksTable.invoiceId, parseInt(String(invoiceId))));
  if (priority) conds.push(eq(workflowTasksTable.priority, String(priority)));
  if (escalationLevel) conds.push(eq(workflowTasksTable.escalationLevel, String(escalationLevel)));
  if (autoCreated != null) conds.push(eq(workflowTasksTable.autoCreated, autoCreated === "true"));
  if (linkedObjectType) conds.push(eq(workflowTasksTable.linkedObjectType, String(linkedObjectType)));
  let rows = await db.select().from(workflowTasksTable).where(conds.length ? and(...conds) : (sql`TRUE` as any)).orderBy(desc(workflowTasksTable.createdAt)).limit(500);
  // recompute deadline health on the fly so it's always fresh
  rows = rows.map(r => ({ ...r, deadlineHealth: r.dueDate ? deadlineHealth(r.dueDate) : r.deadlineHealth })) as any;
  if (dh) rows = rows.filter(r => r.deadlineHealth === dh);
  sendValidated(req, res, ListWorkflowTasksResponse, rows, "List workflow tasks");
});
const TaskBody = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  escalationLevel: z.string().optional(),
  ownerUserId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  linkedObjectType: z.string().nullable().optional(),
  linkedObjectId: z.number().int().nullable().optional(),
  partnerId: z.number().int().nullable().optional(),
  eventId: z.number().int().nullable().optional(),
  orderId: z.number().int().nullable().optional(),
  orderItemId: z.number().int().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  invoiceId: z.number().int().nullable().optional(),
  assetId: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/workflow/tasks", async (req, res) => {
  const parsed = TaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = { ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null, autoCreated: false } as any;
  const [row] = await db.insert(workflowTasksTable).values(data).returning();
  await logAudit({ eventType: "task_created", summary: `Manual task: ${row.title}`, details: { taskId: row.id }, isAutomated: false, objectType: row.linkedObjectType ?? undefined, objectId: row.linkedObjectId ?? undefined });
  sendValidated(req, res, CreateWorkflowTaskResponse, row, "Create workflow task");
});
router.patch("/workflow/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = TaskBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data: any = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  const [row] = await db.update(workflowTasksTable).set(data).where(eq(workflowTasksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UpdateWorkflowTaskResponse, row, "Update workflow task");
});
router.post("/workflow/tasks/:id/complete", async (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, notes } = req.body || {};
  const [row] = await db.update(workflowTasksTable).set({ status: "done", completedAt: new Date(), completedByUserId: userId ?? null, notes: notes ?? undefined, updatedAt: new Date() } as any).where(eq(workflowTasksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ eventType: "task_created", summary: `Task completed: ${row.title}`, details: { taskId: id }, isAutomated: false, actorUserId: userId });
  sendValidated(req, res, CompleteWorkflowTaskResponse, row, "Complete workflow task");
});
router.post("/workflow/tasks/:id/snooze", async (req, res) => {
  const id = parseInt(req.params.id);
  const { days = 1 } = req.body || {};
  const [prev] = await db.select().from(workflowTasksTable).where(eq(workflowTasksTable.id, id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }
  const base = prev.dueDate ? new Date(prev.dueDate).getTime() : Date.now();
  const newDue = new Date(base + Number(days) * 86400_000);
  const [row] = await db.update(workflowTasksTable).set({ dueDate: newDue, status: "waiting", updatedAt: new Date() }).where(eq(workflowTasksTable.id, id)).returning();
  sendValidated(req, res, SnoozeWorkflowTaskResponse, row, "Snooze workflow task");
});

// =====================================================================
// Alerts
// =====================================================================
router.get("/workflow/alerts", async (req, res) => {
  const { isResolved, severity, partnerId, orderId, invoiceId } = req.query;
  const conds: any[] = [];
  if (isResolved != null) conds.push(eq(workflowAlertsTable.isResolved, isResolved === "true"));
  if (severity) conds.push(eq(workflowAlertsTable.severity, String(severity)));
  if (partnerId) conds.push(eq(workflowAlertsTable.partnerId, parseInt(String(partnerId))));
  if (orderId) conds.push(eq(workflowAlertsTable.orderId, parseInt(String(orderId))));
  if (invoiceId) conds.push(eq(workflowAlertsTable.invoiceId, parseInt(String(invoiceId))));
  const rows = await db.select().from(workflowAlertsTable).where(conds.length ? and(...conds) : (sql`TRUE` as any)).orderBy(desc(workflowAlertsTable.createdAt)).limit(300);
  sendValidated(req, res, ListWorkflowAlertsResponse, rows, "List workflow alerts");
});
router.post("/workflow/alerts/:id/read", async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db.update(workflowAlertsTable).set({ isRead: true }).where(eq(workflowAlertsTable.id, id)).returning();
  sendValidated(req, res, MarkWorkflowAlertReadResponse, row, "Mark workflow alert read");
});
router.post("/workflow/alerts/:id/resolve", async (req, res) => {
  const id = parseInt(req.params.id);
  const { userId, note } = req.body || {};
  const [row] = await db.update(workflowAlertsTable).set({ isResolved: true, isRead: true, resolvedAt: new Date(), resolvedByUserId: userId ?? null }).where(eq(workflowAlertsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ eventType: "alert_created", summary: `Alert resolved: ${row.title}`, details: { alertId: id, note }, isAutomated: false, actorUserId: userId });
  sendValidated(req, res, ResolveWorkflowAlertResponse, row, "Resolve workflow alert");
});

// =====================================================================
// Audit
// =====================================================================
router.get("/workflow/audit", async (req, res) => {
  const { objectType, objectId, sourceRuleId, isAutomated } = req.query;
  const conds: any[] = [];
  if (objectType) conds.push(eq(workflowAuditTable.objectType, String(objectType)));
  if (objectId) conds.push(eq(workflowAuditTable.objectId, parseInt(String(objectId))));
  if (sourceRuleId) conds.push(eq(workflowAuditTable.sourceRuleId, parseInt(String(sourceRuleId))));
  if (isAutomated != null) conds.push(eq(workflowAuditTable.isAutomated, isAutomated === "true"));
  const rows = await db.select().from(workflowAuditTable).where(conds.length ? and(...conds) : (sql`TRUE` as any)).orderBy(desc(workflowAuditTable.createdAt)).limit(200);
  sendValidated(req, res, ListWorkflowAuditResponse, rows, "List workflow audit");
});

// =====================================================================
// Override — manual override with required note
// =====================================================================
router.post("/workflow/override", async (req, res) => {
  const { objectType, objectId, action, note, userId, ctx } = req.body || {};
  if (!objectType || !objectId || !action || !note) { res.status(400).json({ error: "objectType, objectId, action, and note are required" }); return; }
  await logAudit({ eventType: "override_applied", summary: `Override: ${action} on ${objectType} #${objectId}`, details: { action, ctx }, isAutomated: false, actorUserId: userId, objectType, objectId, overrideNote: note });
  sendValidated(req, res, ApplyWorkflowOverrideResponse, { success: true }, "Apply workflow override");
});

// =====================================================================
// Queue dashboard rollup
// =====================================================================
router.get("/workflow/queue", async (req, res) => {
  const tasks = await db.select().from(workflowTasksTable).where(sql`${workflowTasksTable.status} IN ('open','in_progress','waiting')`).orderBy(desc(workflowTasksTable.createdAt));
  const alerts = await db.select().from(workflowAlertsTable).where(eq(workflowAlertsTable.isResolved, false)).orderBy(desc(workflowAlertsTable.createdAt));
  const tasksWithHealth = tasks.map(t => ({ ...t, deadlineHealth: t.dueDate ? deadlineHealth(t.dueDate) : null }));

  const counters = {
    openTasks: tasksWithHealth.length,
    overdueTasks: tasksWithHealth.filter(t => t.deadlineHealth === "overdue").length,
    dueSoonTasks: tasksWithHealth.filter(t => t.deadlineHealth === "due_soon" || t.deadlineHealth === "at_risk").length,
    urgentTasks: tasksWithHealth.filter(t => t.priority === "urgent").length,
    escalatedTasks: tasksWithHealth.filter(t => ["high", "urgent"].includes(t.escalationLevel)).length,
    unresolvedAlerts: alerts.length,
    criticalAlerts: alerts.filter(a => a.severity === "critical").length,
  };

  // Buckets by category for at-a-glance
  const byCategory: Record<string, number> = {};
  for (const t of tasksWithHealth) byCategory[t.category] = (byCategory[t.category] || 0) + 1;

  sendValidated(req, res, GetWorkflowQueueResponse, {
    counters,
    byCategory,
    tasks: tasksWithHealth.slice(0, 100),
    alerts: alerts.slice(0, 50),
  }, "Get workflow queue");
});

// =====================================================================
// Manual fire (testing) + tick
// =====================================================================
router.post("/workflow/fire", async (req, res) => {
  const { triggerType, ctx } = req.body || {};
  if (!triggerType) { res.status(400).json({ error: "triggerType required" }); return; }
  const r = await fire(triggerType, ctx || {});
  sendValidated(req, res, FireWorkflowTriggerResponse, r, "Fire workflow trigger");
});
router.post("/workflow/tick", async (req, res) => {
  await runTick();
  sendValidated(req, res, TickWorkflowDeadlinesResponse, { success: true }, "Tick workflow deadlines");
});
// Re-seed defaults (idempotent: only seeds if table empty)
router.post("/workflow/seed-defaults", async (req, res) => {
  sendValidated(req, res, SeedWorkflowDefaultsResponse, { defaults: DEFAULT_RULES.length }, "Seed workflow defaults");
});

export default router;
