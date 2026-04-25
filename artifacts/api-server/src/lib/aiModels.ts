// ===========================================================================
// Centralized AI model + client configuration for cost-aware routing.
// ---------------------------------------------------------------------------
// All app-side OpenAI usage flows through this module so we can:
//   - swap per-task model tiers without touching every call site
//   - cap output tokens uniformly per task
//   - reason about which task triggered each call
//   - share a single OpenAI SDK client across the process
//
// Today every task points at `gpt-4o-mini` via the Replit AI Integrations
// proxy. The split into named tasks exists so future cost work can promote
// or demote any single task in isolation (e.g. push billing-signals to a
// nano model, push proposal-writing to a stronger one) without code edits
// outside this file.
// ===========================================================================

import OpenAI from "openai";
import { createHash } from "crypto";

export type AiTask =
  | "requestSummary"
  | "deckExtraction"
  | "packageExtraction"
  | "billingSignals";

export interface TaskConfig {
  model: string;
  maxTokens: number;
}

const TASK_CONFIG: Record<AiTask, TaskConfig> = {
  requestSummary:    { model: "gpt-4o-mini", maxTokens: 250 },
  deckExtraction:    { model: "gpt-4o-mini", maxTokens: 1500 },
  packageExtraction: { model: "gpt-4o-mini", maxTokens: 2500 },
  billingSignals:    { model: "gpt-4o-mini", maxTokens: 200 },
};

export function getModelForTask(task: AiTask): string {
  return TASK_CONFIG[task].model;
}

export function getMaxTokensForTask(task: AiTask): number {
  return TASK_CONFIG[task].maxTokens;
}

// --- Client construction ---------------------------------------------------

let _client: OpenAI | null = null;

// Single shared OpenAI SDK client. Used by callers that prefer the SDK
// (currently aiSummary.ts). Lazily constructed so the module can be
// imported in environments that don't have the env vars set yet.
export function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
  return _client;
}

// Raw config for callers that hand-roll fetch() against the proxy
// (currently deckExtraction, packageExtraction, billingSignals — they pre-date
// the SDK adoption and use fetch directly to keep the bundle small). Returns
// null when the integration isn't configured so callers can fall back to
// rules-only deterministic paths without throwing.
export function getOpenAIRestConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

// --- Content-hash helpers --------------------------------------------------

// Stable JSON serialization for content-hash caching. Sorts object keys so
// semantically-identical inputs produce identical hashes regardless of the
// key order used by the caller.
export function stableHash(input: unknown): string {
  const stable = JSON.stringify(input, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as object)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => { acc[k] = (v as any)[k]; return acc; }, {});
    }
    return v;
  });
  return createHash("sha256").update(stable).digest("hex");
}
