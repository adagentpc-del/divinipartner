import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const requestFilesTable = pgTable("request_files", {
  id: serial("id").primaryKey(),
  requestType: text("request_type").notNull(),
  requestId: integer("request_id").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRequestFileSchema = createInsertSchema(requestFilesTable).omit({ id: true, createdAt: true });
export type InsertRequestFile = z.infer<typeof insertRequestFileSchema>;
export type RequestFile = typeof requestFilesTable.$inferSelect;
