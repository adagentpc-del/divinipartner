/**
 * Venue Intelligence - draft quote assembler (Phase 3).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md "Engines": draftQuote takes the structured
 * prefill produced by quoteAutomation, writes a human-readable scope of work +
 * install / removal / compliance notes + an install/removal timeline, runs the
 * vendor's pricing rules through pricingEngine, and returns a ready-to-persist
 * draft payload. This is the heart of the "Fastest Path To Quote": client idea
 * -> venue -> opportunity -> prefill -> draft quote, in seconds.
 *
 * Pure assembly: no DB, no AI, no randomness. Given the same prefill + rules +
 * field values it always returns the same draft, so the result is reproducible
 * and the surface can re-run it safely.
 */
import type { QuotePrefill } from "./quoteAutomation.js";
import {
  evaluatePricing,
  type PricingRules,
  type PricingFieldValues,
  type PricingResult,
} from "./pricingEngine.js";

/** One ordered milestone in the install/removal timeline. */
export interface TimelineStep {
  key: string;
  phase: "access" | "install" | "event" | "removal";
  title: string;
  detail: string | null;
}

/** The assembled draft payload (mirrors the quote_drafts writable columns). */
export interface DraftQuotePayload {
  scope_of_work: string;
  install_notes: string;
  removal_notes: string;
  compliance_notes: string;
  timeline: { steps: TimelineStep[] };
  computed_price: number | null;
  pricing: PricingResult | null;
  prefilled: QuotePrefill;
}

export interface AssembleDraftInput {
  prefill: QuotePrefill;
  /** The vendor's pricing rules (from vendor_pricing_rules.rules). Optional. */
  pricingRules?: PricingRules | null;
  /** Naming for the pricing base unit (from vendor_pricing_rules.base_unit). */
  baseUnit?: string | null;
  /**
   * Field values for the pricing engine. When omitted, the prefill measurements
   * are used (so per-sqft / per-unit rules work out of the box).
   */
  fieldValues?: PricingFieldValues | null;
}

/** Format a number with thousands separators, or a fallback dash. */
function n(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "(not recorded)";
  return v.toLocaleString();
}

/** Stringify a jsonb-ish value compactly for note text. */
function asText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`)
      .filter(Boolean);
    return entries.length ? entries.join("; ") : null;
  }
  return String(v);
}

/** Default pricing field values from the prefill measurements. */
function defaultFieldValues(prefill: QuotePrefill): PricingFieldValues {
  const m = prefill.measurements;
  return {
    width: m.width,
    height: m.height,
    depth: m.depth,
    sqft: m.sqft,
    weight_limit: m.weight_limit,
    material_type: m.material_type,
    surface_type: m.surface_type,
    service_category: prefill.service_category,
    permit_required: prefill.compliance.permit_required,
    engineering_required: prefill.compliance.engineering_required,
    fire_marshal_required: prefill.compliance.fire_marshal_required,
    insurance_required: prefill.compliance.insurance_required,
    power_available: prefill.power.power_available,
    rigging_available: prefill.power.rigging_available,
  };
}

/** Build the scope-of-work text from the prefill. */
function buildScope(prefill: QuotePrefill): string {
  const o = prefill.opportunity;
  const m = prefill.measurements;
  const lines: string[] = [];
  lines.push(`Scope: branding installation at ${o.name}${o.category ? ` (${o.category})` : ""}.`);
  if (prefill.service_category) lines.push(`Service category: ${prefill.service_category}.`);
  if (o.description) lines.push(o.description.trim());
  const dims: string[] = [];
  if (m.width != null) dims.push(`width ${n(m.width)}`);
  if (m.height != null) dims.push(`height ${n(m.height)}`);
  if (m.depth != null) dims.push(`depth ${n(m.depth)}`);
  if (m.sqft != null) dims.push(`${n(m.sqft)} sqft`);
  if (dims.length) lines.push(`Dimensions: ${dims.join(", ")}.`);
  if (m.weight_limit != null) lines.push(`Weight limit: ${n(m.weight_limit)}.`);
  if (m.surface_type) lines.push(`Surface: ${m.surface_type}.`);
  if (m.material_type) lines.push(`Material: ${m.material_type}.`);
  const mount = asText(m.mounting_options);
  if (mount) lines.push(`Mounting options: ${mount}.`);
  return lines.join("\n");
}

/** Build the install-notes text from the prefill. */
function buildInstallNotes(prefill: QuotePrefill): string {
  const i = prefill.install;
  const lines: string[] = [];
  const allowed = asText(i.allowed_install_types);
  if (allowed) lines.push(`Allowed install methods: ${allowed}.`);
  const prohibited = asText(i.prohibited_install_types);
  if (prohibited) lines.push(`Prohibited install methods: ${prohibited}.`);
  const time = asText(i.time_restrictions);
  if (time) lines.push(`Time restrictions: ${time}.`);
  const noise = asText(i.noise_restrictions);
  if (noise) lines.push(`Noise restrictions: ${noise}.`);
  const dock = asText(prefill.access.loading_dock);
  if (dock) lines.push(`Loading dock: ${dock}.`);
  const freight = asText(prefill.access.freight_elevator);
  if (freight) lines.push(`Freight elevator: ${freight}.`);
  const win = asText(prefill.access.install_windows);
  if (win) lines.push(`Install windows: ${win}.`);
  const power: string[] = [];
  power.push(`power ${prefill.power.power_available ? "available" : "not available"}`);
  power.push(`internet ${prefill.power.internet_available ? "available" : "not available"}`);
  power.push(`rigging ${prefill.power.rigging_available ? "available" : "not available"}`);
  lines.push(`On-site services: ${power.join(", ")}.`);
  if (!lines.length) lines.push("No install rules recorded on the venue twin; confirm with the venue.");
  return lines.join("\n");
}

/** Build the removal-notes text from the prefill. */
function buildRemovalNotes(prefill: QuotePrefill): string {
  const lines: string[] = [];
  const req = asText(prefill.removal.removal_requirements);
  if (req) lines.push(`Removal requirements: ${req}.`);
  const win = asText(prefill.access.removal_windows);
  if (win) lines.push(`Removal windows: ${win}.`);
  if (!lines.length) lines.push("No removal requirements recorded; confirm teardown window with the venue.");
  return lines.join("\n");
}

/** Build the compliance-notes text from the prefill. */
function buildComplianceNotes(prefill: QuotePrefill): string {
  const c = prefill.compliance;
  const lines: string[] = [];
  const flags: string[] = [];
  if (c.permit_required) flags.push("permit required");
  if (c.engineering_required) flags.push("engineering sign-off required");
  if (c.fire_marshal_required) flags.push("fire marshal approval required");
  if (c.insurance_required) flags.push("insurance certificate required");
  lines.push(flags.length ? `Compliance: ${flags.join(", ")}.` : "No special permits or sign-offs flagged.");
  if (prefill.restrictions.prohibited.length) {
    const items = prefill.restrictions.prohibited
      .map((r) => [r.category, r.value].filter(Boolean).join(": "))
      .filter(Boolean);
    if (items.length) lines.push(`Prohibited: ${items.join("; ")}.`);
  }
  if (prefill.restrictions.allowed.length) {
    const items = prefill.restrictions.allowed
      .map((r) => [r.category, r.value].filter(Boolean).join(": "))
      .filter(Boolean);
    if (items.length) lines.push(`Allowed: ${items.join("; ")}.`);
  }
  const sec = asText(prefill.requirements.security_requirements);
  if (sec) lines.push(`Security: ${sec}.`);
  const ins = asText(prefill.requirements.insurance_requirements);
  if (ins) lines.push(`Insurance: ${ins}.`);
  const uni = asText(prefill.requirements.union_requirements);
  if (uni) lines.push(`Union: ${uni}.`);
  return lines.join("\n");
}

/** Build the ordered install/removal timeline from the prefill. */
function buildTimeline(prefill: QuotePrefill): { steps: TimelineStep[] } {
  const steps: TimelineStep[] = [];
  steps.push({
    key: "access",
    phase: "access",
    title: "Site access and load-in",
    detail:
      asText(prefill.access.loading_dock) ??
      asText(prefill.access.freight_elevator) ??
      "Confirm load-in access with the venue.",
  });
  steps.push({
    key: "install",
    phase: "install",
    title: "Installation",
    detail: asText(prefill.access.install_windows) ?? "Install window to be confirmed with the venue.",
  });
  steps.push({
    key: "event",
    phase: "event",
    title: "Live during event",
    detail: prefill.opportunity.name,
  });
  steps.push({
    key: "removal",
    phase: "removal",
    title: "Teardown and removal",
    detail:
      asText(prefill.access.removal_windows) ??
      asText(prefill.removal.removal_requirements) ??
      "Removal window to be confirmed with the venue.",
  });
  return { steps };
}

/**
 * Assemble a full draft quote from a prefill + (optional) vendor pricing rules.
 * Runs the pricing engine when rules are supplied; otherwise computed_price is
 * null and the vendor fills it in on the review screen.
 */
export function assembleDraftQuote(input: AssembleDraftInput): DraftQuotePayload {
  const { prefill } = input;
  const fieldValues = input.fieldValues ?? defaultFieldValues(prefill);

  let pricing: PricingResult | null = null;
  let computed_price: number | null = null;
  if (input.pricingRules && (input.pricingRules.base != null || Array.isArray(input.pricingRules.steps))) {
    pricing = evaluatePricing(input.pricingRules, fieldValues, {
      baseUnit: input.baseUnit ?? null,
    });
    computed_price = pricing.total;
  }

  return {
    scope_of_work: buildScope(prefill),
    install_notes: buildInstallNotes(prefill),
    removal_notes: buildRemovalNotes(prefill),
    compliance_notes: buildComplianceNotes(prefill),
    timeline: buildTimeline(prefill),
    computed_price,
    pricing,
    prefilled: prefill,
  };
}
