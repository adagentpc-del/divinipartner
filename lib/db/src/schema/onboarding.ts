import { pgTable, serial, text, timestamp, jsonb, uniqueIndex, integer } from "drizzle-orm/pg-core";

export const onboardingProgressTable = pgTable(
  "onboarding_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(), // super_admin | internal_admin | partner_manager | client | vendor
    flow: text("flow").notNull(), // launch_wizard | partner_self_serve | client_first_order | vendor_first_use
    stepKey: text("step_key").notNull(),
    status: text("status").notNull().default("pending"), // pending | completed | skipped | dismissed
    partnerId: integer("partner_id"),
    dataJson: jsonb("data_json"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueStep: uniqueIndex("onboarding_progress_unique").on(t.userId, t.flow, t.stepKey),
  }),
);

export type OnboardingProgress = typeof onboardingProgressTable.$inferSelect;
