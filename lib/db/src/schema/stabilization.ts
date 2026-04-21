import { pgTable, serial, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const objectionsTable = pgTable("objections", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  proposalId: integer("proposal_id"),
  scenarioKey: text("scenario_key"),
  category: text("category").notNull(),
  // pricing | implementation | security | onboarding | white_label | operational | multi_location | adoption | switching_cost | speed
  summary: text("summary").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("raised"),
  // raised | answered | follow_up | resolved | wont_address
  recommendedResponse: text("recommended_response"),
  internalNotes: text("internal_notes"),
  tagsJson: jsonb("tags_json").$type<string[]>().default([]),
  raisedBy: text("raised_by"),
  raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const demoFollowupsTable = pgTable("demo_followups", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  prospectName: text("prospect_name"),
  demoAt: timestamp("demo_at", { withTimezone: true }),
  outcome: text("outcome"),
  // strong_interest | warm | needs_more_info | technical_review | stalled | declined
  status: text("status").notNull().default("demo_completed"),
  // demo_completed | proposal_requested | technical_review | activation_pending | stalled | closed_won | closed_lost
  interestAreas: jsonb("interest_areas").$type<string[]>().default([]),
  objectionsSummary: text("objections_summary"),
  recommendedPlanId: integer("recommended_plan_id"),
  whiteLabelInterest: text("white_label_interest").default("none"),
  // none | partial | full | undecided
  activationReadiness: text("activation_readiness").default("unknown"),
  // unknown | low | medium | high
  nextStep: text("next_step"),
  priorityFeatures: jsonb("priority_features").$type<string[]>().default([]),
  internalNotes: text("internal_notes"),
  loggedBy: text("logged_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const faqEntriesTable = pgTable("faq_entries", {
  id: serial("id").primaryKey(),
  audience: text("audience").notNull().default("internal"),
  // internal | partner | client
  category: text("category").notNull(),
  // setup | timing | onboarding | permissions | white_label | billing | inventory | workflow | post_order | artwork
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Objection = typeof objectionsTable.$inferSelect;
export type DemoFollowup = typeof demoFollowupsTable.$inferSelect;
export type FaqEntry = typeof faqEntriesTable.$inferSelect;
