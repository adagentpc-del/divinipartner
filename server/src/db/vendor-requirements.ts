/**
 * Venue Intelligence - vendor requirements + pricing rules data-access layer
 * (Phase 2).
 *
 * Org/vendor-scoped, IDOR-safe CRUD over the Phase 2 tables created in
 * db/schema-vi-p2.sql:
 *   - vendor_quote_requirements (list / get / create / update / delete + template save/list)
 *   - vendor_pricing_rules      (list / get / create / update / delete)
 *
 * Authorization mirrors server/src/db/venue-twin.ts: every requirement and
 * pricing-rule row hangs off a `vendors` row, and the authorization boundary is
 * the organization that owns that vendor (vendors.organization_id). An actor may
 * read/write when their org owns the vendor, or they are admin / super_admin.
 * Every vendor id is validated against the actor's org before any write so a
 * forged id from another tenant is rejected (ForbiddenError) rather than
 * silently acted on. Single-row reads also re-derive the owning vendor and assert
 * access, so an id from another tenant cannot be fetched/edited/deleted.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

// ---- Row types --------------------------------------------------------------

export type RequirementFieldType =
  | "text"
  | "number"
  | "dropdown"
  | "checkbox"
  | "date"
  | "formula";

/** One ordered field in a vendor_quote_requirements.schema array. */
export type RequirementField = {
  key: string;
  label: string;
  type: RequirementFieldType;
  required?: boolean;
  options?: string[];
  conditional?: {
    field: string;
    op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "truthy";
    value?: unknown;
  } | null;
  formula?: string | null;
};

export type VendorQuoteRequirementRow = {
  id: string;
  vendor_id: string | null;
  service_category: string | null;
  schema: unknown; // RequirementField[]
  is_template: boolean | null;
  template_name: string | null;
  created_at: string;
  updated_at: string;
};

/** One ordered step in a vendor_pricing_rules.rules.steps array. */
export type PricingRuleStep = {
  if: {
    field: string;
    op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "truthy";
    value?: unknown;
  };
  then: {
    action: "set" | "add";
    amount: number;
    perUnitField?: string | null;
  };
};

/** The full rules jsonb on a vendor_pricing_rules row. */
export type PricingRules = {
  base: number;
  steps: PricingRuleStep[];
};

export type VendorPricingRuleRow = {
  id: string;
  vendor_id: string | null;
  service_category: string | null;
  rules: unknown; // PricingRules
  base_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Authorization ----------------------------------------------------------

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the organization that owns a vendor, or throw NotFound. Used as the
 * IDOR gate: callers compare the result against the actor's org.
 */
async function vendorOrgId(vendorId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [vendorId],
  );
  if (!row) throw new NotFoundError("vendor not found");
  return row.organization_id;
}

/**
 * Assert the actor may act on this vendor (their org owns it, or admin). Throws
 * NotFoundError when the vendor does not exist, ForbiddenError when it belongs to
 * another org. Returns the vendor's owning org id.
 */
async function assertVendorAccess(actor: Actor, vendorId: string): Promise<string | null> {
  const orgId = await vendorOrgId(vendorId);
  if (isAdmin(actor)) return orgId;
  if (!actor.org?.id || orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this vendor");
  }
  return orgId;
}

/** Serialize an optional jsonb input; undefined stays undefined (coalesce keeps old). */
function jsonbParam(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return JSON.stringify(v);
}

// ============================================================================
// vendor_quote_requirements: list / get / create / update / delete + templates
// ============================================================================

const FIELD_TYPES = new Set<string>(["text", "number", "dropdown", "checkbox", "date", "formula"]);

/**
 * Lightly validate a schema payload: must be an array of field objects with a
 * string key/label and a known type. Returns the normalized array. Throws
 * ForbiddenError (mapped to 4xx by the route layer) on a malformed shape so a
 * bad builder payload never reaches Phase 3.
 */
export function validateRequirementSchema(input: unknown): RequirementField[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new ForbiddenError("schema must be an array of fields");
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const key = typeof f.key === "string" ? f.key.trim() : "";
    const label = typeof f.label === "string" ? f.label : "";
    const type = typeof f.type === "string" ? f.type : "";
    if (!key) throw new ForbiddenError(`field ${i + 1}: key required`);
    if (seen.has(key)) throw new ForbiddenError(`duplicate field key: ${key}`);
    seen.add(key);
    if (!FIELD_TYPES.has(type)) throw new ForbiddenError(`field ${key}: invalid type`);
    const field: RequirementField = {
      key,
      label: label || key,
      type: type as RequirementFieldType,
      required: f.required === true,
      options: Array.isArray(f.options) ? f.options.map((o) => String(o)) : [],
      conditional:
        f.conditional && typeof f.conditional === "object"
          ? (f.conditional as RequirementField["conditional"])
          : null,
      formula: typeof f.formula === "string" ? f.formula : null,
    };
    return field;
  });
}

/** List requirements for a vendor (org-scoped), newest first. */
export async function listRequirements(
  actor: Actor,
  vendorId: string,
): Promise<VendorQuoteRequirementRow[]> {
  await assertVendorAccess(actor, vendorId);
  return q<VendorQuoteRequirementRow>(
    `select * from vendor_quote_requirements
      where vendor_id = $1
      order by is_template asc, created_at desc`,
    [vendorId],
  );
}

/** List only the saved templates for a vendor (org-scoped), newest first. */
export async function listRequirementTemplates(
  actor: Actor,
  vendorId: string,
): Promise<VendorQuoteRequirementRow[]> {
  await assertVendorAccess(actor, vendorId);
  return q<VendorQuoteRequirementRow>(
    `select * from vendor_quote_requirements
      where vendor_id = $1 and is_template = true
      order by created_at desc`,
    [vendorId],
  );
}

/** Get one requirement (org-scoped via its vendor). */
export async function getRequirement(
  actor: Actor,
  id: string,
): Promise<VendorQuoteRequirementRow> {
  const row = await q1<VendorQuoteRequirementRow>(
    `select * from vendor_quote_requirements where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("requirement not found");
  if (row.vendor_id) await assertVendorAccess(actor, row.vendor_id);
  else if (!isAdmin(actor)) throw new ForbiddenError("no access to this requirement");
  return row;
}

export type RequirementInput = {
  service_category?: string | null;
  schema?: unknown;
  is_template?: boolean | null;
  template_name?: string | null;
};

/** Create a requirement set for a vendor (org-scoped). */
export async function createRequirement(
  actor: Actor,
  vendorId: string,
  input: RequirementInput,
): Promise<VendorQuoteRequirementRow> {
  await assertVendorAccess(actor, vendorId);
  const schema = validateRequirementSchema(input.schema);
  const isTemplate = input.is_template === true;
  if (isTemplate && !(input.template_name && input.template_name.trim())) {
    throw new ForbiddenError("template_name required when saving a template");
  }
  const row = await q1<VendorQuoteRequirementRow>(
    `insert into vendor_quote_requirements
       (vendor_id, service_category, schema, is_template, template_name)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [
      vendorId,
      input.service_category ?? null,
      JSON.stringify(schema),
      isTemplate,
      input.template_name ?? null,
    ],
  );
  return row as VendorQuoteRequirementRow;
}

/** Patch a requirement (org-scoped via its vendor). */
export async function updateRequirement(
  actor: Actor,
  id: string,
  patch: RequirementInput,
): Promise<VendorQuoteRequirementRow> {
  await getRequirement(actor, id);
  // Validate schema only when provided so an unrelated patch does not need it.
  const schemaParam =
    patch.schema === undefined
      ? undefined
      : JSON.stringify(validateRequirementSchema(patch.schema));
  if (patch.is_template === true && patch.template_name != null && !patch.template_name.trim()) {
    throw new ForbiddenError("template_name cannot be blank for a template");
  }
  const row = await q1<VendorQuoteRequirementRow>(
    `update vendor_quote_requirements set
        service_category = coalesce($2, service_category),
        schema = coalesce($3, schema),
        is_template = coalesce($4, is_template),
        template_name = coalesce($5, template_name),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.service_category ?? null,
      schemaParam ?? null,
      patch.is_template ?? null,
      patch.template_name ?? null,
    ],
  );
  return row as VendorQuoteRequirementRow;
}

/**
 * Save an existing requirement as a reusable template (in place: flips
 * is_template true and sets template_name). Org-scoped via its vendor.
 */
export async function saveRequirementAsTemplate(
  actor: Actor,
  id: string,
  templateName: string,
): Promise<VendorQuoteRequirementRow> {
  await getRequirement(actor, id);
  if (!templateName || !templateName.trim()) {
    throw new ForbiddenError("template_name required");
  }
  const row = await q1<VendorQuoteRequirementRow>(
    `update vendor_quote_requirements
        set is_template = true, template_name = $2, updated_at = now()
      where id = $1
      returning *`,
    [id, templateName.trim()],
  );
  return row as VendorQuoteRequirementRow;
}

/** Delete a requirement (org-scoped via its vendor). */
export async function deleteRequirement(actor: Actor, id: string): Promise<void> {
  await getRequirement(actor, id);
  await pool.query(`delete from vendor_quote_requirements where id = $1`, [id]);
}

// ============================================================================
// vendor_pricing_rules: list / get / create / update / delete
// ============================================================================

const RULE_OPS = new Set<string>(["eq", "ne", "gt", "lt", "gte", "lte", "in", "truthy"]);
const RULE_ACTIONS = new Set<string>(["set", "add"]);

/**
 * Lightly validate a rules payload: an object with a numeric base and an ordered
 * steps array of { if:{field,op,value}, then:{action,amount,perUnitField?} }.
 * Returns the normalized structure. Throws ForbiddenError on a malformed shape so
 * Phase 3's pricingEngine only ever interprets well-formed rules.
 */
export function validatePricingRules(input: unknown): PricingRules {
  if (input == null) return { base: 0, steps: [] };
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ForbiddenError("rules must be an object { base, steps }");
  }
  const obj = input as Record<string, unknown>;
  const base = Number(obj.base);
  if (!Number.isFinite(base)) throw new ForbiddenError("rules.base must be a number");
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps: PricingRuleStep[] = rawSteps.map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const cond = (s.if ?? {}) as Record<string, unknown>;
    const then = (s.then ?? {}) as Record<string, unknown>;
    const field = typeof cond.field === "string" ? cond.field.trim() : "";
    const op = typeof cond.op === "string" ? cond.op : "";
    const action = typeof then.action === "string" ? then.action : "";
    if (!field) throw new ForbiddenError(`step ${i + 1}: if.field required`);
    if (!RULE_OPS.has(op)) throw new ForbiddenError(`step ${i + 1}: invalid if.op`);
    if (!RULE_ACTIONS.has(action)) throw new ForbiddenError(`step ${i + 1}: invalid then.action`);
    const amount = Number(then.amount);
    if (!Number.isFinite(amount)) throw new ForbiddenError(`step ${i + 1}: then.amount must be a number`);
    const perUnitField =
      typeof then.perUnitField === "string" && then.perUnitField.trim()
        ? then.perUnitField.trim()
        : null;
    return {
      if: { field, op: op as PricingRuleStep["if"]["op"], value: cond.value },
      then: { action: action as PricingRuleStep["then"]["action"], amount, perUnitField },
    };
  });
  return { base, steps };
}

/** List pricing-rule sets for a vendor (org-scoped), newest first. */
export async function listPricingRules(
  actor: Actor,
  vendorId: string,
): Promise<VendorPricingRuleRow[]> {
  await assertVendorAccess(actor, vendorId);
  return q<VendorPricingRuleRow>(
    `select * from vendor_pricing_rules where vendor_id = $1 order by created_at desc`,
    [vendorId],
  );
}

/** Get one pricing-rule set (org-scoped via its vendor). */
export async function getPricingRule(actor: Actor, id: string): Promise<VendorPricingRuleRow> {
  const row = await q1<VendorPricingRuleRow>(
    `select * from vendor_pricing_rules where id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("pricing rule not found");
  if (row.vendor_id) await assertVendorAccess(actor, row.vendor_id);
  else if (!isAdmin(actor)) throw new ForbiddenError("no access to this pricing rule");
  return row;
}

export type PricingRuleInput = {
  service_category?: string | null;
  rules?: unknown;
  base_unit?: string | null;
  notes?: string | null;
};

/** Create a pricing-rule set for a vendor (org-scoped). */
export async function createPricingRule(
  actor: Actor,
  vendorId: string,
  input: PricingRuleInput,
): Promise<VendorPricingRuleRow> {
  await assertVendorAccess(actor, vendorId);
  const rules = validatePricingRules(input.rules);
  const row = await q1<VendorPricingRuleRow>(
    `insert into vendor_pricing_rules
       (vendor_id, service_category, rules, base_unit, notes)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [
      vendorId,
      input.service_category ?? null,
      JSON.stringify(rules),
      input.base_unit ?? null,
      input.notes ?? null,
    ],
  );
  return row as VendorPricingRuleRow;
}

/** Patch a pricing-rule set (org-scoped via its vendor). */
export async function updatePricingRule(
  actor: Actor,
  id: string,
  patch: PricingRuleInput,
): Promise<VendorPricingRuleRow> {
  await getPricingRule(actor, id);
  const rulesParam =
    patch.rules === undefined ? undefined : JSON.stringify(validatePricingRules(patch.rules));
  const row = await q1<VendorPricingRuleRow>(
    `update vendor_pricing_rules set
        service_category = coalesce($2, service_category),
        rules = coalesce($3, rules),
        base_unit = coalesce($4, base_unit),
        notes = coalesce($5, notes),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.service_category ?? null,
      rulesParam ?? null,
      patch.base_unit ?? null,
      patch.notes ?? null,
    ],
  );
  return row as VendorPricingRuleRow;
}

/** Delete a pricing-rule set (org-scoped via its vendor). */
export async function deletePricingRule(actor: Actor, id: string): Promise<void> {
  await getPricingRule(actor, id);
  await pool.query(`delete from vendor_pricing_rules where id = $1`, [id]);
}

// Re-export the jsonb helper for any future callers in this module's family.
export { jsonbParam };
