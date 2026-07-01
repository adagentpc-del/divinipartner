/**
 * Phase 3 Intelligence - AI Quote Assist (deterministic-first composition).
 *
 * This is the platform's quote ACCELERATION, surfaced as an "assist". It does
 * NOT reimplement quoting: it COMPOSES the existing deterministic engines:
 *   - quoteAutomation.buildQuotePrefill(venue, opportunity[, service])  reads the
 *     stored venue intelligence once and returns a structured prefill.
 *   - draftQuote.assembleDraftQuote(prefill[, pricingRules])  turns that prefill
 *     into a human-readable scope / install / removal / compliance notes +
 *     timeline + (optional) computed price.
 *
 * The DEFAULT path is 100% deterministic: same venue + opportunity + (vendor)
 * pricing rules always yield the same assist payload, with no AI call and no
 * cost. This honors the platform cost rule (deterministic-first; AI is an
 * optional, feature-flagged seam that is OFF and NOT called).
 *
 * A clearly-marked OPTIONAL AI-enhancement seam (refineDraftWording) is included
 * below as a stub. It is feature-flagged OFF by default and is NEVER invoked by
 * assembleQuoteAssist. A future phase can flip the flag and wire it in; until
 * then the deterministic draft is returned verbatim.
 *
 * Pure composition over the existing engines: no NEW DB access here (prefill
 * does its own read via quoteAutomation), no randomness.
 *
 * Zero em dashes.
 */
import { buildQuotePrefill, type BuildPrefillInput, type QuotePrefill } from "./quoteAutomation.js";
import {
  assembleDraftQuote,
  type AssembleDraftInput,
  type DraftQuotePayload,
} from "./draftQuote.js";

/** Input to the assist: venue + opportunity + optional service + pricing rules. */
export interface QuoteAssistInput {
  venueId: string;
  brandingOpportunityId: string;
  serviceCategory?: string | null;
  /** The vendor's pricing rules (from vendor_pricing_rules.rules). Optional. */
  pricingRules?: AssembleDraftInput["pricingRules"];
  baseUnit?: AssembleDraftInput["baseUnit"];
}

/** The assist result: the deterministic draft plus light "assist" metadata. */
export interface QuoteAssistResult {
  /** How the wording was produced. Always "deterministic" on the default path. */
  mode: "deterministic" | "ai-refined";
  /** The structured prefill the draft was built from (for transparency). */
  prefill: QuotePrefill;
  /** The assembled, ready-to-persist draft payload. */
  draft: DraftQuotePayload;
  /**
   * A short, deterministic summary line the surface can show as the "assist"
   * headline (derived from the draft, no fabrication).
   */
  summary: string;
  /** Whether the AI refinement seam is enabled (read-only signal for the UI). */
  aiEnabled: boolean;
}

// ---------------------------------------------------------------------------
// OPTIONAL AI ENHANCEMENT SEAM (OFF by default, NOT called)
// ---------------------------------------------------------------------------
//
// This flag gates an OPTIONAL future AI pass that would polish the deterministic
// wording (tone, grammar, client-ready phrasing). It is hard-OFF here and there
// is NO code path in this module that flips it true, so assembleQuoteAssist
// never touches the seam. To enable in a future phase, a maintainer would gate
// this on a real config flag (e.g. config.llmEnabled) and wire refineDraftWording
// into assembleQuoteAssist behind that flag, honoring the platform cost rules
// (best-effort, timed-out, deterministic fallback) exactly like lib/llm.ts.
const AI_QUOTE_REFINE_ENABLED = false as const;

/**
 * Seam stub: would refine the deterministic draft wording with an LLM. It is a
 * pure pass-through right now and is intentionally NOT invoked anywhere. Kept as
 * an explicit, documented integration point so the deterministic engine and the
 * future AI enhancement live side by side without the AI ever running by
 * default. If ever wired up it MUST: respect AI_QUOTE_REFINE_ENABLED, be
 * best-effort with a timeout, and fall back to `draft` on any failure so the
 * deterministic result is always preserved.
 */
export async function refineDraftWording(
  draft: DraftQuotePayload,
  _opts?: { timeoutMs?: number },
): Promise<DraftQuotePayload> {
  // Hard guard: the seam is OFF, so we never reach an AI call. Returning the
  // deterministic draft unchanged keeps this a safe no-op.
  if (!AI_QUOTE_REFINE_ENABLED) return draft;
  // --- Intentionally unreachable while the flag is false. ---
  // A future implementation would call lib/llm.ts here to rewrite
  // draft.scope_of_work / notes in a more client-ready voice, then return a new
  // payload (or `draft` on any failure). No network call happens today.
  return draft;
}

/** Build a one-line deterministic summary from the assembled draft. */
function buildSummary(prefill: QuotePrefill, draft: DraftQuotePayload): string {
  const name = prefill.opportunity.name;
  const parts: string[] = [`Draft scope ready for ${name}`];
  if (draft.computed_price != null && Number.isFinite(draft.computed_price)) {
    parts.push(`estimated ${`$${Math.round(draft.computed_price).toLocaleString("en-US")}`}`);
  }
  if (prefill.missing.length) {
    parts.push(`${prefill.missing.length} item${prefill.missing.length === 1 ? "" : "s"} to confirm with the venue`);
  }
  return parts.join("; ");
}

/**
 * Produce the quote-assist payload for a (venue, opportunity[, service]) triple.
 * Deterministic by default: builds the prefill, assembles the draft, and returns
 * it. The AI refinement seam is NOT called (it is OFF). Returns null when the
 * opportunity does not exist or does not belong to the venue (the route turns
 * that into a 404), mirroring buildQuotePrefill's contract.
 */
export async function assembleQuoteAssist(
  input: QuoteAssistInput,
): Promise<QuoteAssistResult | null> {
  const prefillInput: BuildPrefillInput = {
    venueId: input.venueId,
    brandingOpportunityId: input.brandingOpportunityId,
    serviceCategory: input.serviceCategory ?? null,
  };
  const prefill = await buildQuotePrefill(prefillInput);
  if (!prefill) return null;

  const draft = assembleDraftQuote({
    prefill,
    pricingRules: input.pricingRules ?? null,
    baseUnit: input.baseUnit ?? null,
  });

  // DEFAULT PATH: deterministic. The AI seam stays OFF and is not invoked.
  return {
    mode: "deterministic",
    prefill,
    draft,
    summary: buildSummary(prefill, draft),
    aiEnabled: AI_QUOTE_REFINE_ENABLED,
  };
}
