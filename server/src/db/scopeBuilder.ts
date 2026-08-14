/**
 * Divini Scope Builder - the shared structured-requirements engine
 * (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md section 9, build-order slice 2).
 * Deterministic: no LLM. Field TYPE and layout live in scope_template_fields
 * as data, not as hardcoded per-role columns (spec constraint 10: one shared
 * engine, not duplicated per profile).
 *
 * Every scope_instance is org-scoped. Every save (partial or full) appends a
 * new scope_versions row rather than overwriting prior answers (spec
 * constraint 9: preserve revision history).
 */
import { pool, q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor, type Role } from "../db.js";
import { isPlusTier, featureLockedPayload } from "../lib/entitlements.js";

export class FeatureLockedError extends Error {
  status = 403;
  payload: ReturnType<typeof featureLockedPayload>;
  constructor(actor: Actor, feature: string) {
    super(`${feature} requires an upgrade`);
    this.name = "FeatureLockedError";
    this.payload = featureLockedPayload(actor.org ?? { tier: null, type: null }, feature, "partner");
  }
}

function requirePlus(actor: Actor, feature: string): void {
  if (!actor.org || !isPlusTier(actor.org)) throw new FeatureLockedError(actor, feature);
}

function assertOrgAccess(actor: Actor): string {
  if (!actor.org) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

export type FieldType = "text" | "textarea" | "number" | "date" | "boolean" | "select" | "multiselect";

export type TemplateFieldRow = {
  id: string;
  template_id: string;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
};

export type TemplateRow = {
  id: string;
  organization_id: string | null;
  role: string;
  category: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

export type TemplateWithFields = TemplateRow & { fields: TemplateFieldRow[] };

type FieldSeed = {
  key: string;
  label: string;
  field_type: FieldType;
  options?: string[];
  required?: boolean;
};

type TemplateSeed = { role: Role | string; category: string; name: string; fields: FieldSeed[] };

// ---- Default templates (spec section 9: profile-specific terminology --
// Venue's "space requirements", Supplier's "rental scope", Installer's
// "workforce scope", etc.) Every field traces to a real, answerable
// procurement question -- no fabricated or generic filler. -----------------
const DEFAULT_TEMPLATES: TemplateSeed[] = [
  {
    role: "venue",
    category: "space_requirements",
    name: "Venue Space Requirements",
    fields: [
      { key: "event_type", label: "Event type", field_type: "select", options: ["Wedding", "Corporate", "Social", "Nonprofit", "Other"], required: true },
      { key: "guest_count", label: "Expected guest count", field_type: "number", required: true },
      { key: "event_date", label: "Event date", field_type: "date", required: true },
      { key: "space_type", label: "Space type", field_type: "select", options: ["Ballroom", "Outdoor", "Multi-room", "Rooftop", "Other"] },
      { key: "setup_style", label: "Setup style", field_type: "select", options: ["Banquet", "Theater", "Reception", "Classroom", "Ceremony"] },
      { key: "av_needs", label: "AV needs", field_type: "multiselect", options: ["Microphone", "Projector", "Sound system", "Lighting", "Stage"] },
      { key: "catering_required", label: "Catering required", field_type: "boolean" },
      { key: "parking_required", label: "Parking required", field_type: "boolean" },
      { key: "accessibility_requirements", label: "Accessibility requirements", field_type: "textarea" },
      { key: "budget_range", label: "Budget range", field_type: "select", options: ["Under $5,000", "$5,000-$15,000", "$15,000-$50,000", "$50,000+"] },
      { key: "notes", label: "Additional notes", field_type: "textarea" },
    ],
  },
  {
    role: "vendor",
    category: "service_scope",
    name: "Vendor Service Scope",
    fields: [
      { key: "service_category", label: "Service category", field_type: "select", options: ["Catering", "Photography", "Entertainment", "Florals", "Decor", "Other"], required: true },
      { key: "guest_count", label: "Expected guest count", field_type: "number" },
      { key: "event_date", label: "Event date", field_type: "date", required: true },
      { key: "setup_time_needed", label: "Setup time needed", field_type: "text" },
      { key: "equipment_list", label: "Equipment to be provided", field_type: "textarea" },
      { key: "staffing_required", label: "On-site staffing required", field_type: "boolean" },
      { key: "delivery_required", label: "Delivery required", field_type: "boolean" },
      { key: "special_requirements", label: "Special requirements", field_type: "textarea" },
      { key: "budget_range", label: "Budget range", field_type: "select", options: ["Under $2,000", "$2,000-$5,000", "$5,000-$15,000", "$15,000+"] },
    ],
  },
  {
    role: "supplier",
    category: "rental_scope",
    name: "Equipment Rental Scope",
    fields: [
      { key: "item_categories", label: "Item categories needed", field_type: "multiselect", options: ["Tables", "Chairs", "Linens", "Tents", "Lighting", "Audio", "Staging", "Decor"], required: true },
      { key: "quantity_needed", label: "Total quantity needed", field_type: "number" },
      { key: "rental_start_date", label: "Rental start date", field_type: "date", required: true },
      { key: "rental_end_date", label: "Rental end date", field_type: "date", required: true },
      { key: "delivery_required", label: "Delivery required", field_type: "boolean" },
      { key: "setup_required", label: "Setup required", field_type: "boolean" },
      { key: "pickup_window", label: "Pickup window", field_type: "text" },
      { key: "damage_deposit_ok", label: "Damage deposit accepted", field_type: "boolean" },
      { key: "notes", label: "Additional notes", field_type: "textarea" },
    ],
  },
  {
    role: "planner",
    category: "event_scope",
    name: "Event Planning Scope",
    fields: [
      { key: "event_type", label: "Event type", field_type: "select", options: ["Wedding", "Corporate", "Social", "Nonprofit", "Other"], required: true },
      { key: "guest_count", label: "Expected guest count", field_type: "number", required: true },
      { key: "event_date", label: "Event date", field_type: "date", required: true },
      { key: "venue_confirmed", label: "Venue confirmed", field_type: "boolean" },
      { key: "budget_total", label: "Total budget", field_type: "number" },
      { key: "vendors_needed", label: "Vendor categories needed", field_type: "multiselect", options: ["Catering", "Photography", "Entertainment", "Florals", "Rentals", "Transportation"] },
      { key: "staffing_needed", label: "On-site staffing needed", field_type: "boolean" },
      { key: "staff_roles", label: "Staff roles needed", field_type: "multiselect", options: ["Coordinator", "Server", "Bartender", "Setup crew", "Security"] },
      { key: "timeline_notes", label: "Timeline notes", field_type: "textarea" },
    ],
  },
  {
    role: "sponsor",
    category: "sponsorship_scope",
    name: "Sponsorship Requirements",
    fields: [
      { key: "sponsorship_tier", label: "Sponsorship tier of interest", field_type: "select", options: ["Title", "Gold", "Silver", "Bronze", "In-kind"], required: true },
      { key: "booth_space_needed", label: "Booth space needed", field_type: "boolean" },
      { key: "signage_requirements", label: "Signage requirements", field_type: "textarea" },
      { key: "guest_seats_needed", label: "Guest seats needed", field_type: "number" },
      { key: "branding_assets_ready", label: "Branding assets ready to submit", field_type: "boolean" },
      { key: "activation_ideas", label: "Activation ideas", field_type: "textarea" },
      { key: "budget_range", label: "Budget range", field_type: "select", options: ["Under $2,500", "$2,500-$10,000", "$10,000-$25,000", "$25,000+"] },
    ],
  },
  {
    role: "installer",
    category: "workforce_scope",
    name: "Workforce / Install Scope",
    fields: [
      { key: "job_type", label: "Job type", field_type: "select", options: ["Load-in", "Setup", "Strike", "Load-out", "Full shift"], required: true },
      { key: "crew_size_needed", label: "Crew size needed", field_type: "number", required: true },
      { key: "install_date", label: "Install date", field_type: "date", required: true },
      { key: "install_window", label: "Install window", field_type: "text" },
      { key: "equipment_provided_by", label: "Equipment provided by", field_type: "select", options: ["Us", "Client", "Shared"] },
      { key: "certifications_required", label: "Certifications required", field_type: "multiselect", options: ["Forklift", "Rigging", "Electrical", "None"] },
      { key: "safety_requirements", label: "Safety requirements", field_type: "textarea" },
    ],
  },
  {
    role: "client",
    category: "event_scope",
    name: "My Event Requirements",
    fields: [
      { key: "event_type", label: "Event type", field_type: "select", options: ["Wedding", "Corporate", "Social", "Nonprofit", "Other"], required: true },
      { key: "guest_count", label: "Expected guest count", field_type: "number", required: true },
      { key: "event_date", label: "Event date", field_type: "date", required: true },
      { key: "budget_range", label: "Budget range", field_type: "select", options: ["Under $5,000", "$5,000-$15,000", "$15,000-$50,000", "$50,000+"] },
      { key: "must_haves", label: "Must-haves", field_type: "textarea" },
      { key: "nice_to_haves", label: "Nice-to-haves", field_type: "textarea" },
    ],
  },
];

async function fieldsForTemplate(templateId: string): Promise<TemplateFieldRow[]> {
  const rows = await q<TemplateFieldRow & { options: unknown }>(
    `select * from scope_template_fields where template_id = $1 order by sort_order asc`,
    [templateId],
  );
  return rows.map((r) => ({ ...r, options: (r.options as string[] | null) ?? null }));
}

/** Seed the platform-default template for one role, once. Idempotent by
 *  checking for an existing null-org row with the same role+category before
 *  inserting (no LLM, no fabricated fields -- every field above is a real,
 *  answerable procurement question). */
async function ensureDefaultTemplate(seed: TemplateSeed): Promise<TemplateRow> {
  const existing = await q1<TemplateRow>(
    `select * from scope_templates where organization_id is null and role = $1 and category = $2`,
    [seed.role, seed.category],
  );
  if (existing) return existing;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const tpl = (
      await client.query(
        `insert into scope_templates (organization_id, role, category, name) values (null, $1, $2, $3) returning *`,
        [seed.role, seed.category, seed.name],
      )
    ).rows[0] as TemplateRow;
    for (let i = 0; i < seed.fields.length; i++) {
      const f = seed.fields[i];
      await client.query(
        `insert into scope_template_fields (template_id, key, label, field_type, options, required, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [tpl.id, f.key, f.label, f.field_type, f.options ? JSON.stringify(f.options) : null, !!f.required, i],
      );
    }
    await client.query("commit");
    return tpl;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

async function ensureDefaultTemplateForRole(role: string): Promise<TemplateRow | null> {
  const seed = DEFAULT_TEMPLATES.find((t) => t.role === role);
  if (!seed) return null;
  return ensureDefaultTemplate(seed);
}

/** Platform defaults for the org's own role, plus any custom templates the
 *  org has built for itself (Plus+ per spec section 18). */
export async function listTemplates(actor: Actor): Promise<TemplateRow[]> {
  const orgId = assertOrgAccess(actor);
  const role = actor.org!.type ?? "";
  await ensureDefaultTemplateForRole(role);
  return q<TemplateRow>(
    `select * from scope_templates
      where (organization_id is null and role = $1) or organization_id = $2
      order by organization_id nulls first, created_at asc`,
    [role, orgId],
  );
}

async function assertTemplateAccess(actor: Actor, id: string): Promise<TemplateRow> {
  const orgId = assertOrgAccess(actor);
  const tpl = await q1<TemplateRow>(`select * from scope_templates where id = $1`, [id]);
  if (!tpl) throw new NotFoundError("template not found");
  if (tpl.organization_id !== null && tpl.organization_id !== orgId) {
    throw new NotFoundError("template not found");
  }
  return tpl;
}

export async function getTemplate(actor: Actor, id: string): Promise<TemplateWithFields> {
  const tpl = await assertTemplateAccess(actor, id);
  return { ...tpl, fields: await fieldsForTemplate(tpl.id) };
}

export type TemplateInput = { category?: string | null; name: string; fields: FieldSeed[] };

/** Custom template creation is Plus+ (spec section 18: Free gets "basic
 *  Scope Builder", Plus gets "custom scope templates"). */
export async function createTemplate(actor: Actor, input: TemplateInput): Promise<TemplateWithFields> {
  requirePlus(actor, "Custom scope templates");
  const orgId = assertOrgAccess(actor);
  if (!input.name.trim()) throw new Error("name is required");
  if (!Array.isArray(input.fields) || input.fields.length === 0) throw new Error("at least one field is required");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const tpl = (
      await client.query(
        `insert into scope_templates (organization_id, role, category, name) values ($1,$2,$3,$4) returning *`,
        [orgId, actor.org!.type, input.category ?? null, input.name.trim()],
      )
    ).rows[0] as TemplateRow;
    for (let i = 0; i < input.fields.length; i++) {
      const f = input.fields[i];
      if (!f.key || !f.label || !f.field_type) throw new Error("each field needs a key, label, and field_type");
      await client.query(
        `insert into scope_template_fields (template_id, key, label, field_type, options, required, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [tpl.id, f.key, f.label, f.field_type, f.options ? JSON.stringify(f.options) : null, !!f.required, i],
      );
    }
    await client.query("commit");
    return { ...tpl, fields: await fieldsForTemplate(tpl.id) };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// ---- Instances --------------------------------------------------------------

export type InstanceRow = {
  id: string;
  organization_id: string;
  template_id: string;
  opportunity_id: string | null;
  name: string;
  status: "draft" | "published";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type ResponseRow = {
  id: string;
  scope_instance_id: string;
  field_id: string;
  value_text: string | null;
  value_number: string | null;
  value_bool: boolean | null;
  value_date: string | null;
  value_json: unknown;
};

export type InstanceDetail = {
  instance: InstanceRow;
  template: TemplateWithFields;
  responses: Record<string, unknown>;
  version_count: number;
};

export async function listInstances(
  actor: Actor,
  filters: { opportunityId?: string; status?: string } = {},
): Promise<InstanceRow[]> {
  const orgId = assertOrgAccess(actor);
  const where: string[] = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  if (filters.opportunityId) {
    params.push(filters.opportunityId);
    where.push(`opportunity_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  return q<InstanceRow>(
    `select * from scope_instances where ${where.join(" and ")} order by updated_at desc limit 500`,
    params,
  );
}

async function assertInstanceAccess(actor: Actor, id: string): Promise<InstanceRow> {
  const orgId = assertOrgAccess(actor);
  const row = await q1<InstanceRow>(`select * from scope_instances where id = $1 and organization_id = $2`, [id, orgId]);
  if (!row) throw new NotFoundError("scope not found");
  return row;
}

function responseMap(rows: ResponseRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.value_text !== null) out[r.field_id] = r.value_text;
    else if (r.value_number !== null) out[r.field_id] = Number(r.value_number);
    else if (r.value_bool !== null) out[r.field_id] = r.value_bool;
    else if (r.value_date !== null) out[r.field_id] = r.value_date;
    else if (r.value_json !== null) out[r.field_id] = r.value_json;
  }
  return out;
}

export async function getInstance(actor: Actor, id: string): Promise<InstanceDetail> {
  const instance = await assertInstanceAccess(actor, id);
  const template = await getTemplate(actor, instance.template_id);
  const responseRows = await q<ResponseRow>(`select * from scope_responses where scope_instance_id = $1`, [id]);
  const versionCount = await q1<{ n: string }>(
    `select count(*)::text as n from scope_versions where scope_instance_id = $1`,
    [id],
  );
  return { instance, template, responses: responseMap(responseRows), version_count: Number(versionCount?.n ?? 0) };
}

export type InstanceInput = { template_id: string; name: string; opportunity_id?: string | null };

export async function createInstance(actor: Actor, input: InstanceInput): Promise<InstanceRow> {
  const orgId = assertOrgAccess(actor);
  await assertTemplateAccess(actor, input.template_id); // 404 if not accessible
  if (input.opportunity_id) {
    const opp = await q1<{ id: string }>(
      `select id from crm_opportunities where id = $1 and organization_id = $2`,
      [input.opportunity_id, orgId],
    );
    if (!opp) throw new NotFoundError("opportunity not found");
  }
  const name = input.name.trim();
  if (!name) throw new Error("name is required");
  return (await q1<InstanceRow>(
    `insert into scope_instances (organization_id, template_id, opportunity_id, name, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [orgId, input.template_id, input.opportunity_id ?? null, name, actor.user.id],
  )) as InstanceRow;
}

function normalizeValue(field: TemplateFieldRow, raw: unknown): {
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
  value_date: string | null;
  value_json: unknown;
} {
  const empty = { value_text: null, value_number: null, value_bool: null, value_date: null, value_json: null };
  if (raw === null || raw === undefined || raw === "") return empty;
  switch (field.field_type) {
    case "text":
    case "textarea":
    case "select":
      return { ...empty, value_text: String(raw) };
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? { ...empty, value_number: n } : empty;
    }
    case "boolean":
      return { ...empty, value_bool: raw === true || raw === "true" };
    case "date":
      return { ...empty, value_date: String(raw) };
    case "multiselect":
      return { ...empty, value_json: Array.isArray(raw) ? raw : [raw] };
    default:
      return empty;
  }
}

/** Save responses, then append a new version snapshot (spec constraint 9:
 *  never overwrite revision history -- every save is a new numbered row). */
export async function saveResponses(
  actor: Actor,
  instanceId: string,
  answers: Record<string, unknown>,
): Promise<InstanceDetail> {
  const instance = await assertInstanceAccess(actor, instanceId);
  const template = await getTemplate(actor, instance.template_id);
  const fieldsByKeyOrId = new Map<string, TemplateFieldRow>();
  for (const f of template.fields) {
    fieldsByKeyOrId.set(f.id, f);
    fieldsByKeyOrId.set(f.key, f);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [fieldKeyOrId, raw] of Object.entries(answers)) {
      const field = fieldsByKeyOrId.get(fieldKeyOrId);
      if (!field) continue; // ignore unknown keys rather than fail the whole save
      const v = normalizeValue(field, raw);
      await client.query(
        `insert into scope_responses (scope_instance_id, field_id, value_text, value_number, value_bool, value_date, value_json)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (scope_instance_id, field_id) do update set
           value_text = excluded.value_text, value_number = excluded.value_number,
           value_bool = excluded.value_bool, value_date = excluded.value_date,
           value_json = excluded.value_json, updated_at = now()`,
        [instanceId, field.id, v.value_text, v.value_number, v.value_bool, v.value_date, v.value_json ? JSON.stringify(v.value_json) : null],
      );
    }
    await client.query(`update scope_instances set updated_at = now() where id = $1`, [instanceId]);

    const responseRows = (
      await client.query(`select * from scope_responses where scope_instance_id = $1`, [instanceId])
    ).rows as ResponseRow[];
    const nextVersion = (
      await client.query(
        `select coalesce(max(version_number), 0) + 1 as n from scope_versions where scope_instance_id = $1`,
        [instanceId],
      )
    ).rows[0].n as number;
    await client.query(
      `insert into scope_versions (scope_instance_id, version_number, snapshot_json, created_by)
       values ($1,$2,$3,$4)`,
      [instanceId, nextVersion, JSON.stringify(responseMap(responseRows)), actor.user.id],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return getInstance(actor, instanceId);
}

export type VersionRow = {
  id: string;
  scope_instance_id: string;
  version_number: number;
  snapshot_json: unknown;
  created_by: string | null;
  created_at: string;
};

export async function listVersions(actor: Actor, instanceId: string): Promise<VersionRow[]> {
  await assertInstanceAccess(actor, instanceId);
  return q<VersionRow>(
    `select * from scope_versions where scope_instance_id = $1 order by version_number desc`,
    [instanceId],
  );
}

/** Publish requires every required field to have an answer (deterministic
 *  validation, spec section 19 "validated inputs" -- never fabricated). */
export async function publishInstance(actor: Actor, instanceId: string): Promise<InstanceRow> {
  const detail = await getInstance(actor, instanceId);
  const missing = detail.template.fields
    .filter((f) => f.required)
    .filter((f) => detail.responses[f.id] === undefined || detail.responses[f.id] === null || detail.responses[f.id] === "")
    .map((f) => f.label);
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(", ")}`) as Error & { status: number };
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const nextVersion = (
      await client.query(
        `select coalesce(max(version_number), 0) + 1 as n from scope_versions where scope_instance_id = $1`,
        [instanceId],
      )
    ).rows[0].n as number;
    await client.query(
      `insert into scope_versions (scope_instance_id, version_number, snapshot_json, created_by)
       values ($1,$2,$3,$4)`,
      [instanceId, nextVersion, JSON.stringify(detail.responses), actor.user.id],
    );
    const row = (
      await client.query(
        `update scope_instances set status = 'published', published_at = now(), updated_at = now()
         where id = $1 and organization_id = $2 returning *`,
        [instanceId, actor.org!.id],
      )
    ).rows[0] as InstanceRow;
    await client.query("commit");
    return row;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
