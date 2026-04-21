import { pgTable, serial, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { partnersTable } from "./partners";
import { eventsTable } from "./events";
import { ordersTable, orderItemsTable } from "./orders";
import { suppliersTable } from "./suppliers";
import { invoicesTable } from "./invoices";
import { assetsTable } from "./assets";

// =====================================================================
// Workflow Rules — admin-configurable, fired by trigger engine
// =====================================================================
export const workflowRulesTable = pgTable("workflow_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  // e.g. asset.uploaded | asset.approved | order.submitted | order.approved | supplier.assigned
  // supplier.status_changed | production.blocked | production.ready | invoice.created
  // invoice.sent | invoice.overdue | inventory.shortage | deadline.approaching
  // deadline.overdue | reconciliation.discrepancy | event.approaching | asset.missing

  objectType: text("object_type"),
  // partner | event | order | order_item | supplier_assignment | invoice | asset | inventory_reservation

  conditionsJson: jsonb("conditions_json").$type<Record<string, any>>().default({}),
  actionsJson: jsonb("actions_json").$type<Array<{ type: string; params?: Record<string, any> }>>().default([]),

  priority: text("priority").notNull().default("medium"), // low | medium | high | urgent
  escalationLevel: text("escalation_level").notNull().default("none"), // none | low | medium | high | urgent
  portalTypes: jsonb("portal_types").$type<string[]>().default([]),

  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),

  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  triggerIdx: index("workflow_rules_trigger_idx").on(t.triggerType, t.isActive),
}));

// =====================================================================
// Workflow Tasks — auto- or manually created actionable items
// =====================================================================
export const workflowTasksTable = pgTable("workflow_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),

  category: text("category").notNull().default("general"),
  // approval | asset_follow_up | supplier_follow_up | billing_follow_up | reconciliation
  // | inventory_action | production_review | event_prep | general

  status: text("status").notNull().default("open"),
  // open | in_progress | waiting | done | cancelled

  priority: text("priority").notNull().default("medium"),
  escalationLevel: text("escalation_level").notNull().default("none"),
  deadlineHealth: text("deadline_health"), // on_track | due_soon | at_risk | overdue | blocked

  ownerUserId: text("owner_user_id"),
  dueDate: timestamp("due_date"),

  linkedObjectType: text("linked_object_type"),
  linkedObjectId: integer("linked_object_id"),

  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  orderItemId: integer("order_item_id").references(() => orderItemsTable.id, { onDelete: "set null" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id, { onDelete: "set null" }),
  assetId: integer("asset_id").references(() => assetsTable.id, { onDelete: "set null" }),

  notes: text("notes"),
  autoCreated: boolean("auto_created").notNull().default(false),
  sourceRuleId: integer("source_rule_id").references(() => workflowRulesTable.id, { onDelete: "set null" }),
  // Idempotency key — engine sets this to avoid duplicate auto-tasks
  dedupeKey: text("dedupe_key"),

  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("workflow_tasks_status_idx").on(t.status, t.dueDate),
  linkedIdx: index("workflow_tasks_linked_idx").on(t.linkedObjectType, t.linkedObjectId),
  dedupeIdx: uniqueIndex("workflow_tasks_dedupe_unique_idx").on(t.dedupeKey),
}));

// =====================================================================
// Workflow Alerts — lightweight notification rows
// =====================================================================
export const workflowAlertsTable = pgTable("workflow_alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message"),
  severity: text("severity").notNull().default("info"), // info | warning | critical

  linkedObjectType: text("linked_object_type"),
  linkedObjectId: integer("linked_object_id"),

  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id, { onDelete: "set null" }),
  assetId: integer("asset_id").references(() => assetsTable.id, { onDelete: "set null" }),

  isRead: boolean("is_read").notNull().default(false),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id"),

  autoCreated: boolean("auto_created").notNull().default(false),
  sourceRuleId: integer("source_rule_id").references(() => workflowRulesTable.id, { onDelete: "set null" }),
  dedupeKey: text("dedupe_key"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  unresolvedIdx: index("workflow_alerts_unresolved_idx").on(t.isResolved, t.severity),
  dedupeIdx: uniqueIndex("workflow_alerts_dedupe_unique_idx").on(t.dedupeKey),
}));

// =====================================================================
// Workflow Audit — every automated action and override is logged here
// =====================================================================
export const workflowAuditTable = pgTable("workflow_audit", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  // rule_fired | task_created | alert_created | status_auto_updated
  // override_applied | blocked | unblocked | comm_drafted | escalation_set

  summary: text("summary").notNull(),
  detailsJson: jsonb("details_json").$type<Record<string, any>>().default({}),

  isAutomated: boolean("is_automated").notNull().default(true),
  actorUserId: text("actor_user_id"),
  sourceRuleId: integer("source_rule_id").references(() => workflowRulesTable.id, { onDelete: "set null" }),

  objectType: text("object_type"),
  objectId: integer("object_id"),

  partnerId: integer("partner_id"),
  eventId: integer("event_id"),
  orderId: integer("order_id"),
  supplierId: integer("supplier_id"),
  invoiceId: integer("invoice_id"),
  assetId: integer("asset_id"),

  overrideNote: text("override_note"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  objectIdx: index("workflow_audit_object_idx").on(t.objectType, t.objectId),
}));

export type WorkflowRule = typeof workflowRulesTable.$inferSelect;
export type WorkflowTask = typeof workflowTasksTable.$inferSelect;
export type WorkflowAlert = typeof workflowAlertsTable.$inferSelect;
export type WorkflowAudit = typeof workflowAuditTable.$inferSelect;
