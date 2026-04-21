// @ts-nocheck
import { db, objectionsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

export const OBJECTION_CATEGORIES = [
  { key: "pricing", label: "Pricing & packaging" },
  { key: "implementation", label: "Implementation complexity" },
  { key: "speed", label: "Time-to-live" },
  { key: "security", label: "Permissions & security" },
  { key: "onboarding", label: "Onboarding burden" },
  { key: "white_label", label: "White-label scope" },
  { key: "operational", label: "Supplier / operational workflow" },
  { key: "multi_location", label: "Multi-location complexity" },
  { key: "adoption", label: "Internal team adoption" },
  { key: "switching_cost", label: "Already use another system" },
  { key: "data_entry", label: "Data entry burden" },
  { key: "billing_control", label: "Billing & invoicing control" },
] as const;

export const OBJECTION_STATUSES = ["raised", "answered", "follow_up", "resolved", "wont_address"] as const;

export const RECOMMENDED_RESPONSES: Record<string, string> = {
  pricing:
    "Anchor on what's bundled (white-label, supplier routing, automation, asset intelligence). Highlight setup vs recurring split, and offer the comparison matrix to show value per tier.",
  implementation:
    "Walk through the 10-step activation checklist. Most accounts go live in 2–3 weeks; the platform's pre-seeded defaults (templates, supplier routing, billing models) remove most heavy lifting.",
  speed:
    "Show the activation checklist progress UI. We typically activate a buyer in 2–3 weeks; demo-ready accounts have gone live in under 10 days when assets and contacts are ready.",
  security:
    "Permissions are role-scoped (super admin, internal admin, partner manager, vendor, client). Demo the role visibility model. Auth is centralized, sessions are encrypted, and operational data is isolated per partner.",
  onboarding:
    "Show the partner onboarding flow + asset intelligence (deck extraction). Most asset and product setup is bulk-importable. Open the activation checklist to anchor expectations.",
  white_label:
    "Use the proposal comparison matrix to show partial vs full white-label feature differences. Demo branded portal preview. Custom domain + invoice branding + 'powered by' control are explicit.",
  operational:
    "Walk through supplier routing, fulfillment modes, and the production command center. Emphasize routing defaults so ops doesn't manually re-assign every order.",
  multi_location:
    "Demo cities + venues + branding zones. Multi-location routing is configured once; subsequent events inherit.",
  adoption:
    "Lead with workflow dashboard + automation rules. Most ops users have 3 screens (Orders, Fulfillment, Production). Vendor users have 1 screen.",
  switching_cost:
    "Position as a wedge: start with one portal type or one event, run side-by-side, expand once trust is built. Don't force a full cutover.",
  data_entry:
    "Show deck extraction, quote ingestion, asset library reuse, and template inheritance. Most repeated data is entered once.",
  billing_control:
    "Show the billing resolver: per-partner billing model selection (internal-billed, partner-billed, hybrid). Buyers can keep their existing invoicing structure.",
};

export async function listObjections(filters: { status?: string; category?: string; accountId?: number; proposalId?: number } = {}) {
  const where: any[] = [];
  if (filters.status) where.push(eq(objectionsTable.status, filters.status));
  if (filters.category) where.push(eq(objectionsTable.category, filters.category));
  if (filters.accountId) where.push(eq(objectionsTable.accountId, filters.accountId));
  if (filters.proposalId) where.push(eq(objectionsTable.proposalId, filters.proposalId));
  const q = db.select().from(objectionsTable);
  const rows = where.length ? await q.where(and(...where)).orderBy(desc(objectionsTable.raisedAt)) : await q.orderBy(desc(objectionsTable.raisedAt));
  return rows;
}

export async function getObjectionSummary() {
  const all = await db.select().from(objectionsTable);
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const o of all) {
    byCategory[o.category] = (byCategory[o.category] || 0) + 1;
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  }
  return {
    total: all.length,
    open: all.filter(o => o.status === "raised" || o.status === "follow_up").length,
    resolved: all.filter(o => o.status === "resolved").length,
    byCategory, byStatus,
  };
}
