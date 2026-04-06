import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { requestsTable } from "./requests";

export const requestUploadsTable = pgTable("request_uploads", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
  uploadType: text("upload_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRequestUploadSchema = createInsertSchema(requestUploadsTable).omit({ id: true, createdAt: true });
export type InsertRequestUpload = z.infer<typeof insertRequestUploadSchema>;
export type RequestUpload = typeof requestUploadsTable.$inferSelect;
