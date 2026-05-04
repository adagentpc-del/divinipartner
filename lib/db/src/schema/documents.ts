import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const DOCUMENT_CATEGORIES = [
  "compliance",
  "insurance",
  "corporate",
  "sales",
  "onboarding",
  "guides",
  "internal",
  "other",
] as const;

export const DOCUMENT_TYPES = [
  "w9",
  "act_docs",
  "articles_registration",
  "certificate_of_insurance",
  "insurance_certificate",
  "capability_sheet",
  "vendor_onboarding_packet",
  "product_guide",
  "artwork_upload_guide",
  "installation_guide",
  "partner_packet",
  "customer_support_docs",
  "internal_only_document",
  "other",
] as const;

export const VISIBILITY_LEVELS = [
  "public_sales",
  "customer_requestable",
  "internal_only",
] as const;

export const ACCESS_STATUSES = [
  "pending",
  "available",
  "expired",
  "revoked",
] as const;

export const REQUEST_STATUSES = [
  "pending",
  "approved",
  "denied",
  "sent",
  "fulfilled",
] as const;

export const DOCUMENT_EVENT_TYPES = [
  "uploaded",
  "updated",
  "assigned",
  "requested",
  "approved",
  "denied",
  "sent",
  "email_opened",
  "viewed",
  "downloaded",
  "expired",
  "revoked",
] as const;

export const documentLibraryTable = pgTable("document_library", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  documentType: text("document_type").notNull(),
  visibilityLevel: text("visibility_level").notNull().default("internal_only"),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileMimeType: text("file_mime_type").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull().default(0),
  versionLabel: text("version_label"),
  expirationDate: timestamp("expiration_date", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  isCustomerDownloadable: boolean("is_customer_downloadable").notNull().default(false),
  requiresAdminApproval: boolean("requires_admin_approval").notNull().default(true),
  autoSendWhenRequested: boolean("auto_send_when_requested").notNull().default(false),
  internalNotes: text("internal_notes"),
  uploadedByUserId: text("uploaded_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  categoryIdx: index("doc_lib_category_idx").on(t.category),
  typeIdx: index("doc_lib_type_idx").on(t.documentType),
  visibilityIdx: index("doc_lib_visibility_idx").on(t.visibilityLevel),
  activeIdx: index("doc_lib_active_idx").on(t.isActive),
}));

export const documentCustomerAssignmentsTable = pgTable("document_customer_assignments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentLibraryTable.id, { onDelete: "cascade" }),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name"),
  assignedByUserId: text("assigned_by_user_id"),
  accessStatus: text("access_status").notNull().default("available"),
  signedUrlExpiresAt: timestamp("signed_url_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  documentIdx: index("doc_assign_document_idx").on(t.documentId),
  emailIdx: index("doc_assign_email_idx").on(t.customerEmail),
  partnerIdx: index("doc_assign_partner_idx").on(t.partnerId),
}));

export const documentRequestsTable = pgTable("document_requests", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  requesterCompany: text("requester_company"),
  requestedDocumentTypes: jsonb("requested_document_types").$type<string[]>(),
  requestMessage: text("request_message"),
  status: text("status").notNull().default("pending"),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  statusIdx: index("doc_req_status_idx").on(t.status),
  emailIdx: index("doc_req_email_idx").on(t.requesterEmail),
  partnerIdx: index("doc_req_partner_idx").on(t.partnerId),
}));

export const documentEventsTable = pgTable("document_events", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documentLibraryTable.id, { onDelete: "set null" }),
  requestId: integer("request_id").references(() => documentRequestsTable.id, { onDelete: "set null" }),
  assignmentId: integer("assignment_id").references(() => documentCustomerAssignmentsTable.id, { onDelete: "set null" }),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  eventType: text("event_type").notNull(),
  eventMetadata: jsonb("event_metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  performedByUserId: text("performed_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventTypeIdx: index("doc_evt_type_idx").on(t.eventType),
  documentIdx: index("doc_evt_document_idx").on(t.documentId),
  partnerIdx: index("doc_evt_partner_idx").on(t.partnerId),
  timeIdx: index("doc_evt_time_idx").on(t.createdAt),
}));

export const insertDocumentLibrarySchema = createInsertSchema(documentLibraryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentLibrary = z.infer<typeof insertDocumentLibrarySchema>;
export type DocumentLibrary = typeof documentLibraryTable.$inferSelect;

export const insertDocumentAssignmentSchema = createInsertSchema(documentCustomerAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentAssignment = z.infer<typeof insertDocumentAssignmentSchema>;
export type DocumentCustomerAssignment = typeof documentCustomerAssignmentsTable.$inferSelect;

export const insertDocumentRequestSchema = createInsertSchema(documentRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentRequest = z.infer<typeof insertDocumentRequestSchema>;
export type DocumentRequest = typeof documentRequestsTable.$inferSelect;

export const insertDocumentEventSchema = createInsertSchema(documentEventsTable).omit({ id: true, createdAt: true });
export type InsertDocumentEvent = z.infer<typeof insertDocumentEventSchema>;
export type DocumentEvent = typeof documentEventsTable.$inferSelect;
