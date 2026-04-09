import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const partnerSectionsTable = pgTable("partner_sections", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id, { onDelete: "cascade" }),
  sectionType: text("section_type").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  description: text("description"),
  featuredImageUrl: text("featured_image_url"),
  featuredVideoUrl: text("featured_video_url"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerSectionSchema = createInsertSchema(partnerSectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerSection = z.infer<typeof insertPartnerSectionSchema>;
export type PartnerSection = typeof partnerSectionsTable.$inferSelect;
