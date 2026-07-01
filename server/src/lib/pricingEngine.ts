/**
 * Venue Intelligence - safe pricing-rule interpreter (Phase 3).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md "Engines": pricingEngine evaluates a vendor's
 * vendor_pricing_rules.rules against a bag of field values and returns a single
 * computed price plus a line-item breakdown. The hard requirement is SAFETY:
 * there is NO eval and NO `new Function`. Rules are a structured, ordered list of
 * conditional steps that this module walks deterministically, so the same rules
 * + the same field values always yield the same price.
 *
 * Rule shape (matches db/schema-vi-p2.sql vendor_pricing_rules.rules):
 *   {
 *     "base":  number,                 // starting price
 *     "steps": [
 *       {
 *         "if":   { "field": "fieldKey", "op": <Op>, "value": <any> } | null,
 *         "then": { "action": "set" | "add", "amount": number } |
 *                 { "action": "set" | "add", "perUnitField": "fieldKey", "amount": number }
 *       },
 *       ...
 *     ]
 *   }
 *
 * Operators: both symbolic (<, <=, >, >=, ==, !=) and the named forms used in the
 * Phase 2 schema (lt, lte, gt, gte, eq, ne, in, truthy) are accepted. A step with
 * a null/absent `if` always applies (an unconditional base adjustment). A `then`
 * with a perUnitField multiplies `amount` by the numeric value of that field
 * (per-unit pricing, e.g. amount-per-sqft). Anything malformed is skipped, never
 * thrown, so a bad rule degrades the price rather than failing the quote.
 */

/** Accepted comparison operators (symbolic + named aliases). */
export type PricingOp =
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "eq"
  | "ne"
  | "in"
  | "truthy";

/** A condition guarding a pricing step. */
export interface PricingCondition {
  field: string;
  op: PricingOp;
  value?: unknown;
}

/** The mutation a step applies when its condition holds. */
export interface PricingThen {
  action: "set" | "add";
  amount?: number;
  perUnitField?: string;
}

/** One ordered pricing step. */
export interface PricingStep {
  if?: PricingCondition | null;
  then: PricingThen;
}

/** A vendor's full pricing rule set. */
export interface PricingRules {
  base?: number;
  steps?: PricingStep[];
}

/** Field values to evaluate the rules against (from the prefill + intake). */
export type PricingFieldValues = Record<string, unknown>;

/** One explained adjustment to the running price. */
export interface PricingLineItem {
  step: number;
  action: "base" | "set" | "add";
  description: string;
  applied: boolean;
  amount: number;
  runningTotal: number;
  reason?: string;
}

/** The result of evaluating a rule set. */
export interface PricingResult {
  total: number;
  base: number;
  currency: string;
  baseUnit: string | null;
  lineItems: PricingLineItem[];
}

/** Coerce a value to a finite number, or null when it is not numeric. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Round to cents to keep money arithmetic stable. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Truthiness for the "truthy" operator: handles "false"/"0"/"" as falsey. */
function isTruthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t !== "" && t !== "false" && t !== "0" && t !== "no";
  }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return false;
}

/**
 * Evaluate a single condition against the field values. Pure, never throws.
 * Numeric comparisons coerce both sides to numbers; eq/ne fall back to a loose
 * string/value comparison when either side is non-numeric.
 */
export function evalCondition(cond: PricingCondition | null | undefined, fields: PricingFieldValues): boolean {
  if (!cond || typeof cond.field !== "string") return true; // no/invalid guard -> always applies
  const fieldVal = fields[cond.field];
  const op = cond.op;

  if (op === "truthy") return isTruthy(fieldVal);

  if (op === "in") {
    const set = Array.isArray(cond.value) ? cond.value : [cond.value];
    return set.some((x) => looseEquals(fieldVal, x));
  }

  if (op === "==" || op === "eq") return looseEquals(fieldVal, cond.value);
  if (op === "!=" || op === "ne") return !looseEquals(fieldVal, cond.value);

  // Remaining operators are numeric.
  const a = toNumber(fieldVal);
  const b = toNumber(cond.value);
  if (a == null || b == null) return false;
  switch (op) {
    case "<":
    case "lt":
      return a < b;
    case "<=":
    case "lte":
      return a <= b;
    case ">":
    case "gt":
      return a > b;
    case ">=":
    case "gte":
      return a >= b;
    default:
      return false;
  }
}

/** Loose equality: numeric when both coerce, else string compare. */
function looseEquals(a: unknown, b: unknown): boolean {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na != null && nb != null) return na === nb;
  return String(a ?? "") === String(b ?? "");
}

/** Human label for a condition, for the breakdown. */
function describeCondition(cond: PricingCondition | null | undefined): string {
  if (!cond || typeof cond.field !== "string") return "always";
  const v = cond.value === undefined ? "" : ` ${JSON.stringify(cond.value)}`;
  return `${cond.field} ${cond.op}${v}`;
}

/**
 * Evaluate a vendor's pricing rules against field values. Returns the computed
 * total plus a per-step breakdown. Pure and total: malformed steps are recorded
 * as not-applied rather than throwing.
 */
export function evaluatePricing(
  rules: PricingRules | null | undefined,
  fields: PricingFieldValues,
  opts: { baseUnit?: string | null; currency?: string } = {},
): PricingResult {
  const currency = opts.currency ?? "USD";
  const baseUnit = opts.baseUnit ?? null;
  const lineItems: PricingLineItem[] = [];

  const base = cents(toNumber(rules?.base) ?? 0);
  let total = base;
  lineItems.push({
    step: 0,
    action: "base",
    description: baseUnit ? `Base price (${baseUnit})` : "Base price",
    applied: true,
    amount: base,
    runningTotal: total,
  });

  const steps = Array.isArray(rules?.steps) ? rules!.steps! : [];
  steps.forEach((step, i) => {
    const stepNo = i + 1;
    const then = step?.then;
    if (!then || (then.action !== "set" && then.action !== "add")) {
      lineItems.push({
        step: stepNo,
        action: "add",
        description: `Step ${stepNo} (skipped: no valid action)`,
        applied: false,
        amount: 0,
        runningTotal: total,
        reason: "malformed",
      });
      return;
    }

    const condDesc = describeCondition(step.if);
    const applies = evalCondition(step.if, fields);
    if (!applies) {
      lineItems.push({
        step: stepNo,
        action: then.action,
        description: `When ${condDesc}: ${then.action}`,
        applied: false,
        amount: 0,
        runningTotal: total,
        reason: "condition not met",
      });
      return;
    }

    // Resolve the amount (flat, or per-unit multiplied by a numeric field).
    let amount = toNumber(then.amount) ?? 0;
    let unitDesc = "";
    if (typeof then.perUnitField === "string" && then.perUnitField.length > 0) {
      const units = toNumber(fields[then.perUnitField]) ?? 0;
      amount = amount * units;
      unitDesc = ` (${then.amount} x ${units} ${then.perUnitField})`;
    }
    amount = cents(amount);

    if (then.action === "set") {
      total = amount;
    } else {
      total = cents(total + amount);
    }

    lineItems.push({
      step: stepNo,
      action: then.action,
      description: `When ${condDesc}: ${then.action}${unitDesc}`,
      applied: true,
      amount,
      runningTotal: total,
    });
  });

  return { total: cents(total), base, currency, baseUnit, lineItems };
}
