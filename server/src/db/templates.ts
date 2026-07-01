/**
 * Phase 7 - Reusable event templates + event history memory (blueprint 28).
 *
 * Templates are saved, reusable scopes (categories, checklist, budget skeleton)
 * an org can apply to new events. Event history stores compact summaries of
 * completed events so an org can "duplicate this event" and so the
 * recommendation / repeat-relationship engines have data to work with.
 *
 * Backed by event_templates + event_history (db/schema-phase7.sql). All reads
 * are org-scoped (plus global starter templates).
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, type Actor } from "../db.js";

export type TemplateRow = {
  id: string;
  organization_id: string | null;
  name: string;
  event_type: string | null;
  description: string | null;
  default_guest_count: number | null;
  categories: string[] | null;
  checklist: unknown;
  budget_skeleton: unknown;
  default_budget: string | null;
  source_event_id: string | null;
  is_global: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const T_COLS = `
  id, organization_id, name, event_type, description, default_guest_count,
  categories, checklist, budget_skeleton, default_budget, source_event_id,
  is_global, created_by, created_at, updated_at
`;

/** List templates visible to the org (own + global), newest first. */
export async function listTemplates(orgId: string | null): Promise<TemplateRow[]> {
  return q<TemplateRow>(
    `select ${T_COLS} from event_templates
      where is_global = true or organization_id = $1
      order by is_global asc, created_at desc
      limit 300`,
    [orgId],
  );
}

/** Get one template visible to the org. */
export async function getTemplate(orgId: string | null, id: string): Promise<TemplateRow> {
  const row = await q1<TemplateRow>(
    `select ${T_COLS} from event_templates
      where id = $1 and (is_global = true or organization_id = $2)`,
    [id, orgId],
  );
  if (!row) throw new NotFoundError("template not found");
  return row;
}

export type TemplateInput = {
  name: string;
  event_type?: string | null;
  description?: string | null;
  default_guest_count?: number | null;
  categories?: string[] | null;
  checklist?: unknown;
  budget_skeleton?: unknown;
  default_budget?: number | null;
  source_event_id?: string | null;
};

/** Create a template owned by the actor's org. */
export async function createTemplate(actor: Actor, input: TemplateInput): Promise<TemplateRow> {
  const row = await q1<TemplateRow>(
    `insert into event_templates
       (organization_id, name, event_type, description, default_guest_count,
        categories, checklist, budget_skeleton, default_budget, source_event_id,
        is_global, created_by, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11, now())
     returning ${T_COLS}`,
    [
      actor.org?.id ?? null,
      input.name,
      input.event_type ?? null,
      input.description ?? null,
      input.default_guest_count ?? null,
      input.categories ?? null,
      input.checklist != null ? JSON.stringify(input.checklist) : null,
      input.budget_skeleton != null ? JSON.stringify(input.budget_skeleton) : null,
      input.default_budget ?? null,
      input.source_event_id ?? null,
      actor.user.id,
    ],
  );
  return row as TemplateRow;
}

/** Patch a template (org-owned only). */
export async function updateTemplate(
  actor: Actor,
  id: string,
  input: Partial<TemplateInput>,
): Promise<TemplateRow> {
  const existing = await q1<TemplateRow>(
    `select organization_id from event_templates where id = $1`,
    [id],
  );
  if (!existing) throw new NotFoundError("template not found");
  const row = await q1<TemplateRow>(
    `update event_templates set
        name = coalesce($2, name),
        event_type = coalesce($3, event_type),
        description = coalesce($4, description),
        default_guest_count = coalesce($5, default_guest_count),
        categories = coalesce($6, categories),
        checklist = coalesce($7, checklist),
        budget_skeleton = coalesce($8, budget_skeleton),
        default_budget = coalesce($9, default_budget),
        updated_at = now()
      where id = $1 and organization_id = $10
      returning ${T_COLS}`,
    [
      id,
      input.name ?? null,
      input.event_type ?? null,
      input.description ?? null,
      input.default_guest_count ?? null,
      input.categories ?? null,
      input.checklist != null ? JSON.stringify(input.checklist) : null,
      input.budget_skeleton != null ? JSON.stringify(input.budget_skeleton) : null,
      input.default_budget ?? null,
      actor.org?.id ?? null,
    ],
  );
  if (!row) throw new NotFoundError("template not found or not owned");
  return row;
}

/** Delete a template (org-owned only). */
export async function deleteTemplate(actor: Actor, id: string): Promise<boolean> {
  const rows = await q(
    `delete from event_templates where id = $1 and organization_id = $2 returning id`,
    [id, actor.org?.id ?? null],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Event history memory
// ---------------------------------------------------------------------------
export type HistoryRow = {
  id: string;
  event_id: string | null;
  organization_id: string | null;
  name: string | null;
  event_type: string | null;
  venue_id: string | null;
  venue_org_id: string | null;
  guest_count: number | null;
  total_spend: string | null;
  budget: string | null;
  categories: string[] | null;
  vendor_org_ids: string[] | null;
  summary: unknown;
  outcome: string | null;
  completed_at: string | null;
  created_at: string;
};

const H_COLS = `
  id, event_id, organization_id, name, event_type, venue_id, venue_org_id,
  guest_count, total_spend, budget, categories, vendor_org_ids, summary,
  outcome, completed_at, created_at
`;

/** List the org's event history (most recent first). */
export async function listHistory(orgId: string): Promise<HistoryRow[]> {
  return q<HistoryRow>(
    `select ${H_COLS} from event_history
      where organization_id = $1
      order by coalesce(completed_at, created_at) desc
      limit 300`,
    [orgId],
  );
}

export type HistoryInput = {
  event_id?: string | null;
  name?: string | null;
  event_type?: string | null;
  venue_id?: string | null;
  venue_org_id?: string | null;
  guest_count?: number | null;
  total_spend?: number | null;
  budget?: number | null;
  categories?: string[] | null;
  vendor_org_ids?: string[] | null;
  summary?: unknown;
  outcome?: string | null;
  completed_at?: string | null;
};

/**
 * Record a completed-event summary into history. Used when an event completes or
 * on demand from the workspace.
 */
export async function recordHistory(actor: Actor, input: HistoryInput): Promise<HistoryRow> {
  const row = await q1<HistoryRow>(
    `insert into event_history
       (event_id, organization_id, name, event_type, venue_id, venue_org_id,
        guest_count, total_spend, budget, categories, vendor_org_ids, summary,
        outcome, completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,coalesce($14, now()))
     returning ${H_COLS}`,
    [
      input.event_id ?? null,
      actor.org?.id ?? null,
      input.name ?? null,
      input.event_type ?? null,
      input.venue_id ?? null,
      input.venue_org_id ?? null,
      input.guest_count ?? null,
      input.total_spend ?? null,
      input.budget ?? null,
      input.categories ?? null,
      input.vendor_org_ids ?? null,
      input.summary != null ? JSON.stringify(input.summary) : null,
      input.outcome ?? "completed",
      input.completed_at ?? null,
    ],
  );
  return row as HistoryRow;
}

/**
 * Build a template from a past event-history entry ("duplicate this event").
 * Copies the recorded scope into a fresh, org-owned template.
 */
export async function templateFromHistory(actor: Actor, historyId: string): Promise<TemplateRow> {
  const h = await q1<HistoryRow>(
    `select ${H_COLS} from event_history where id = $1 and organization_id = $2`,
    [historyId, actor.org?.id ?? null],
  );
  if (!h) throw new NotFoundError("event history not found");
  return createTemplate(actor, {
    name: `${h.name ?? "Past event"} (template)`,
    event_type: h.event_type,
    description: `Duplicated from ${h.name ?? "a past event"}.`,
    default_guest_count: h.guest_count,
    categories: h.categories,
    default_budget: h.budget != null ? Number(h.budget) : h.total_spend != null ? Number(h.total_spend) : null,
    source_event_id: h.event_id,
    checklist: (h.categories ?? []).map((c) => ({ label: `Source and confirm ${c}`, category: c, done: false })),
  });
}
