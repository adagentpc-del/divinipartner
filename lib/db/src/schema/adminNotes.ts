import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { requestsTable } from "./requests";

export const adminNotesTable = pgTable("admin_notes", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
  noteBody: text("note_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminNoteSchema = createInsertSchema(adminNotesTable).omit({ id: true, createdAt: true });
export type InsertAdminNote = z.infer<typeof insertAdminNoteSchema>;
export type AdminNote = typeof adminNotesTable.$inferSelect;
