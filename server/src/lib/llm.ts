/**
 * Local-first LLM client. Defaults to a local Ollama server (LLM_PROVIDER=ollama,
 * OLLAMA_URL). An OpenAI-compatible endpoint is used only when explicitly
 * configured. Every call is best-effort with a timeout: on any failure or when
 * disabled, callers must fall back to deterministic logic. The LLM is never a
 * hard dependency of any feature.
 *
 * Zero em dashes.
 */
import {
  LLM_PROVIDER,
  OLLAMA_URL,
  LLM_MODEL,
  LLM_API_KEY,
  LLM_BASE_URL,
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  llmEnabled,
} from "../config.js";

export interface LlmResult {
  ok: boolean;
  text: string;
  error?: string;
}

export interface LlmOptions {
  system?: string;
  json?: boolean;
  timeoutMs?: number;
  model?: string;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Run a single completion. Returns ok:false on any error or when disabled. */
export async function llmComplete(prompt: string, opts: LlmOptions = {}): Promise<LlmResult> {
  if (!llmEnabled()) return { ok: false, text: "", error: "llm disabled" };
  const timeoutMs = opts.timeoutMs ?? 20000;
  const model = opts.model ?? LLM_MODEL;
  try {
    if (LLM_PROVIDER === "ollama") {
      return await withTimeout(async (signal) => {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model,
            prompt,
            system: opts.system,
            stream: false,
            format: opts.json ? "json" : undefined,
            options: { temperature: 0.2 },
          }),
        });
        if (!res.ok) return { ok: false, text: "", error: `ollama ${res.status}` };
        const json = (await res.json()) as { response?: string };
        return { ok: true, text: String(json.response ?? "") };
      }, timeoutMs);
    }
    if (LLM_PROVIDER === "openai-compat") {
      if (!LLM_BASE_URL) return { ok: false, text: "", error: "LLM_BASE_URL unset" };
      return await withTimeout(async (signal) => {
        const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
          },
          signal,
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: opts.json ? { type: "json_object" } : undefined,
            messages: [
              ...(opts.system ? [{ role: "system", content: opts.system }] : []),
              { role: "user", content: prompt },
            ],
          }),
        });
        if (!res.ok) return { ok: false, text: "", error: `llm ${res.status}` };
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return { ok: true, text: String(json.choices?.[0]?.message?.content ?? "") };
      }, timeoutMs);
    }
    if (LLM_PROVIDER === "anthropic") {
      if (!ANTHROPIC_API_KEY) return { ok: false, text: "", error: "ANTHROPIC_API_KEY unset" };
      // LLM_MODEL defaults to "llama3.1" for the ollama provider, which is
      // never a valid Anthropic model id -- only honor opts.model here, and
      // fall back to ANTHROPIC_MODEL, never the shared LLM_MODEL default.
      const anthropicModel = opts.model ?? ANTHROPIC_MODEL;
      return await withTimeout(async (signal) => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          signal,
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 4096,
            temperature: 0.2,
            system: opts.system,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return { ok: false, text: "", error: `anthropic ${res.status}` };
        const json = (await res.json()) as { content?: { type?: string; text?: string }[] };
        const text = (json.content ?? []).find((b) => b.type === "text")?.text ?? "";
        return { ok: true, text };
      }, timeoutMs);
    }
    return { ok: false, text: "", error: `unknown LLM_PROVIDER: ${LLM_PROVIDER}` };
  } catch (e) {
    return { ok: false, text: "", error: (e as Error).message };
  }
}

/** Extract the first JSON object/array from a model response. */
function extractJson(text: string): string {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  const i = t.search(/[[{]/);
  if (i >= 0) return t.slice(i);
  return t;
}

/** Completion that returns parsed JSON, or null on any failure (caller falls back). */
export async function llmJson<T = unknown>(prompt: string, opts: LlmOptions = {}): Promise<T | null> {
  const r = await llmComplete(prompt, { ...opts, json: true });
  if (!r.ok || !r.text) return null;
  try {
    return JSON.parse(extractJson(r.text)) as T;
  } catch {
    return null;
  }
}

export { llmEnabled };
