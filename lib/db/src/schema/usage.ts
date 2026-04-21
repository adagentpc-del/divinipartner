import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  partnerId: integer("partner_id"),
  userId: text("user_id"),
  role: text("role"),
  objectType: text("object_type"),
  objectId: integer("object_id"),
  meta: jsonb("meta"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byType: index("usage_events_type_idx").on(t.eventType),
  byPartner: index("usage_events_partner_idx").on(t.partnerId),
  byTime: index("usage_events_time_idx").on(t.occurredAt),
}));

export const feedbackItems = pgTable("feedback_items", {
  id: serial("id").primaryKey(),
  submitterUserId: text("submitter_user_id"),
  submitterRole: text("submitter_role"),
  partnerId: integer("partner_id"),
  screenPath: text("screen_path"),
  category: text("category").notNull().default("other"),
  severity: text("severity").notNull().default("medium"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  tags: text("tags").array(),
  assignedToUserId: text("assigned_to_user_id"),
  internalNotes: text("internal_notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStatus: index("feedback_status_idx").on(t.status),
  byPartner: index("feedback_partner_idx").on(t.partnerId),
}));
