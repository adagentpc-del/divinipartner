/**
 * Per-partner integration credentials (Task #5).
 *
 * Holds the per-partner webhook secret + API base URL used to talk to the
 * Venue Asset Survey app (and other future partner-scoped integrations).
 * Webhook signatures use HMAC-SHA256 of the raw request body keyed by
 * `webhookSecret`. The `apiKey` is used by the admin-triggered pull endpoint
 * to authenticate against the external survey app's API.
 *
 * Stored secrets are partner-scoped, never global, so revoking a single
 * partner's integration never breaks anyone else.
 */
import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const partnerIntegrationsTable = pgTable("partner_integrations", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  integrationType: text("integration_type").notNull(), // "venue_asset_survey"
  webhookSecret: text("webhook_secret"),               // HMAC key, generated on enable
  apiBaseUrl: text("api_base_url"),                    // e.g. https://surveys.partner.example/api
  // SECRET REFERENCE — name of the env var / Replit Secret holding the bearer
  // for admin pull. We deliberately do NOT store the secret value in the DB;
  // resolveApiKey() reads `process.env[apiKeySecretName]` at call time.
  apiKeySecretName: text("api_key_secret_name"),
  externalPartnerId: text("external_partner_id"),      // partner id in the survey app
  isEnabled: boolean("is_enabled").notNull().default(true),
  autoApprove: boolean("auto_approve").notNull().default(false),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  lastPullStatus: text("last_pull_status"),
  lastPullError: text("last_pull_error"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  partnerTypeUq: uniqueIndex("partner_integrations_partner_type_uq").on(t.partnerId, t.integrationType),
}));

export const insertPartnerIntegrationSchema = createInsertSchema(partnerIntegrationsTable).omit({
  id: true, createdAt: true, updatedAt: true, lastWebhookAt: true, lastPullAt: true,
  lastPullStatus: true, lastPullError: true,
});
export type InsertPartnerIntegration = z.infer<typeof insertPartnerIntegrationSchema>;
export type PartnerIntegration = typeof partnerIntegrationsTable.$inferSelect;
