import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { suppliersTable } from "./suppliers";

export const userRolesTable = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: text("role").notNull(),
  partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "cascade" }),
  permissionsJson: text("permissions_json"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  emailIdx: uniqueIndex("user_roles_email_idx").on(table.email),
}));

export const insertUserRoleSchema = createInsertSchema(userRolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRolesTable.$inferSelect;
