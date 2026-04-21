// @ts-nocheck
import { db, faqEntriesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

export const FAQ_AUDIENCES = ["internal", "partner", "client"] as const;

export const FAQ_CATEGORIES = [
  { key: "setup", label: "Setup & activation" },
  { key: "timing", label: "Time-to-live" },
  { key: "onboarding", label: "Partner onboarding" },
  { key: "permissions", label: "Permissions & visibility" },
  { key: "white_label", label: "White-label & branding" },
  { key: "billing", label: "Billing & invoicing" },
  { key: "inventory", label: "Inventory & supplier routing" },
  { key: "workflow", label: "Operational workflow" },
  { key: "post_order", label: "After an order is placed" },
  { key: "artwork", label: "Artwork & production readiness" },
] as const;

export async function listFaq(filters: { audience?: string; category?: string; activeOnly?: boolean } = {}) {
  const where: any[] = [];
  if (filters.audience) where.push(eq(faqEntriesTable.audience, filters.audience));
  if (filters.category) where.push(eq(faqEntriesTable.category, filters.category));
  if (filters.activeOnly) where.push(eq(faqEntriesTable.isActive, true));
  const q = db.select().from(faqEntriesTable);
  return where.length
    ? await q.where(and(...where)).orderBy(asc(faqEntriesTable.sortOrder), asc(faqEntriesTable.id))
    : await q.orderBy(asc(faqEntriesTable.sortOrder), asc(faqEntriesTable.id));
}
