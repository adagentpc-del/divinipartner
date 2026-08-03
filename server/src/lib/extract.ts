/**
 * Local-model-first onboarding extraction.
 *
 * Given a public website URL or an uploaded document (rate sheet, floor plan,
 * menu, etc.), this reads the text server-side and asks a LOCAL LLM to
 * structure the profile fields it can see: name, description, services,
 * tags, hours, capacity/size, a starting-price summary, and packages.
 *
 * Safety model: the model may ONLY restate facts explicitly present in the
 * source text - it must OMIT any field it cannot support, never estimate or
 * imply a number. Insurance, certifications, awards, and ratings claims stay
 * completely out of scope for extraction (those require real verification,
 * not text-scraping, regardless of what a website claims about itself).
 *
 * Every returned field is a SUGGESTION the owner must verify (see
 * db/profiles.ts ai_profile_suggestions); nothing here writes to a live
 * profile directly, and owner-entered values are never overwritten.
 *
 * The LLM is never a hard dependency: any failure (fetch error, timeout,
 * model off, bad JSON) returns null and the caller falls back to the
 * existing deterministic intake behavior.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { llmEnabled, llmJson } from "./llm.js";
import { safeFetch } from "./safe-fetch.js";
import { htmlToText } from "./htmlText.js";
import { wrapUntrustedContent, UNTRUSTED_CONTENT_SYSTEM_SUFFIX } from "./promptSafety.js";

export { htmlToText };

export type ExtractedPackage = { name: string; description?: string; priceNote?: string };

export type ExtractedProfile = {
  name?: string;
  description?: string;
  services?: string[];
  tags?: string[];
  /** Operating/business hours, verbatim-ish as stated (e.g. "Mon-Fri 9am-5pm"). */
  hours?: string;
  /** Capacity or size, as stated (e.g. "up to 300 guests", "5,000 sq ft"). */
  capacity?: string;
  /** A starting-price or price-range summary, as stated (e.g. "Starting at $2,500"). */
  startingPrice?: string;
  /** Named packages with what's included and a pricing note, as stated. */
  packages?: ExtractedPackage[];
};

const FETCH_TIMEOUT_MS = 12000;
const MAX_BODY_BYTES = 600_000; // cap to keep memory + token use bounded

function normalizeUrl(url: string): string | null {
  const s = (url || "").trim();
  if (s.length < 3) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Fetch a URL with a timeout and a hard body-size cap. Returns text or null. */
async function fetchTextCapped(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // H3: SSRF-guarded fetch (validates host + every redirect target).
    const res = await safeFetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "DiviniPartnersOnboardingBot/1.0 (+public profile import)",
      },
    });
    if (!res || !res.ok) return null;
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype && !/text\/|html|xml|json/.test(ctype)) return null;

    const reader = res.body?.getReader();
    if (!reader) {
      const fallback = await res.text();
      return fallback.slice(0, MAX_BODY_BYTES);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX_BODY_BYTES) {
          try {
            await reader.cancel();
          } catch {
            // best effort
          }
          break;
        }
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return buf.toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type RawExtraction = {
  name?: unknown;
  description?: unknown;
  services?: unknown;
  tags?: unknown;
  hours?: unknown;
  capacity?: unknown;
  starting_price?: unknown;
  packages?: unknown;
};

/** Sanitize + bound a single package entry from the model's JSON. Returns null
 *  when the entry has no usable name. */
function sanitizePackage(p: unknown): ExtractedPackage | null {
  if (!p || typeof p !== "object") return null;
  const obj = p as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 120) : "";
  if (!name) return null;
  const out: ExtractedPackage = { name };
  if (typeof obj.description === "string" && obj.description.trim()) {
    out.description = obj.description.trim().slice(0, 400);
  }
  if (typeof obj.priceNote === "string" && obj.priceNote.trim()) {
    out.priceNote = obj.priceNote.trim().slice(0, 120);
  }
  return out;
}

/**
 * Shared structuring core: given already-extracted plain text (from a website
 * or a document) and a short label describing its source, asks the local LLM
 * to extract only what is explicitly stated. Returns null on any failure, on
 * an unusably short input, or when nothing could be extracted.
 */
export async function extractProfileFromText(text: string, sourceLabel: string): Promise<ExtractedProfile | null> {
  if (!llmEnabled()) return null;
  const trimmed = (text || "").trim();
  if (trimmed.length < 40) return null;

  const system =
    "You extract a public business profile from text. You only restate " +
    "information that is clearly and explicitly present in the text. You " +
    "NEVER estimate, infer, or imply a number, date, or fact that is not " +
    "written there. You never output insurance, certification, award, or " +
    "rating claims under any circumstance, even if the text mentions them - " +
    "those require separate verification and are permanently out of scope. " +
    "If a field is not clearly stated, omit it entirely rather than guessing. " +
    "Reply with JSON only." +
    UNTRUSTED_CONTENT_SYSTEM_SUFFIX;

  const prompt =
    `Source: ${sourceLabel}\n\n` +
    wrapUntrustedContent("Source text", trimmed) +
    "\n\nExtract ONLY fields that are clearly and explicitly stated in the text." +
    ' Return JSON exactly as: {"name": string, "description": string,' +
    ' "services": string[], "tags": string[], "hours": string, "capacity": string,' +
    ' "starting_price": string, "packages": [{"name": string, "description": string, "priceNote": string}]}.' +
    " name is the business name. description is 2 to 4 neutral factual sentences" +
    " using only what the text states. services is a short list of named" +
    " offerings mentioned. tags is 3 to 10 short lowercase labels. hours is the" +
    " stated operating/business hours, verbatim or close to it. capacity is a" +
    " stated size or guest/attendee capacity (e.g. \"up to 300 guests\" or" +
    " \"5,000 sq ft\") - ONLY if a specific figure is written in the text." +
    " starting_price is a stated starting price or price range (e.g. \"Starting" +
    " at $2,500\") - ONLY if a specific figure is written in the text. packages" +
    " is a list of named packages/tiers with what is included and their stated" +
    " price, ONLY when the text lists actual packages with actual prices." +
    " Omit any field you cannot directly support with text that is actually" +
    " there. Never output insurance, certification, award, or rating claims.";

  const out = await llmJson<RawExtraction>(prompt, { system, timeoutMs: 25000 });
  if (!out) return null;

  const result: ExtractedProfile = {};

  if (typeof out.name === "string" && out.name.trim().length > 1) {
    result.name = out.name.trim().slice(0, 160);
  }
  if (typeof out.description === "string" && out.description.trim().length > 20) {
    result.description = out.description.trim().slice(0, 2000);
  }
  if (Array.isArray(out.services)) {
    const services = out.services
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 120)
      .slice(0, 20);
    if (services.length > 0) result.services = services;
  }
  if (Array.isArray(out.tags)) {
    const tags = Array.from(
      new Set(
        out.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 40),
      ),
    ).slice(0, 12);
    if (tags.length > 0) result.tags = tags;
  }
  if (typeof out.hours === "string" && out.hours.trim().length > 2) {
    result.hours = out.hours.trim().slice(0, 300);
  }
  if (typeof out.capacity === "string" && out.capacity.trim().length > 1) {
    result.capacity = out.capacity.trim().slice(0, 160);
  }
  if (typeof out.starting_price === "string" && out.starting_price.trim().length > 1) {
    result.startingPrice = out.starting_price.trim().slice(0, 160);
  }
  if (Array.isArray(out.packages)) {
    const packages = out.packages
      .map(sanitizePackage)
      .filter((p): p is ExtractedPackage => p !== null)
      .slice(0, 12);
    if (packages.length > 0) result.packages = packages;
  }

  const hasAnyField = Object.keys(result).length > 0;
  return hasAnyField ? result : null;
}

/**
 * Fetch a public URL and use the local LLM to extract structured public-profile
 * fields. Returns null on any failure so the caller can fall back to the
 * deterministic onboarding intake.
 */
export async function extractProfileFromUrl(url: string): Promise<ExtractedProfile | null> {
  if (!llmEnabled()) return null;
  const clean = normalizeUrl(url);
  if (!clean) return null;
  const raw = await fetchTextCapped(clean);
  if (!raw) return null;
  const text = htmlToText(raw);
  return extractProfileFromText(text, `website ${clean}`);
}

/**
 * Structure an already-extracted document text (see lib/extractDocument.ts
 * for turning an uploaded file's bytes into text) using the same shared core.
 */
export async function extractProfileFromDocumentText(
  text: string,
  fileName: string,
): Promise<ExtractedProfile | null> {
  return extractProfileFromText(text, `uploaded document "${fileName}"`);
}
