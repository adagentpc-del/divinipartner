/**
 * Autonomous claim-discovery search (local-first).
 *
 * Given a category and location, this queries a self-hosted search provider
 * (SearXNG), optionally fetches each result page, and uses a LOCAL LLM to
 * structure one candidate business row per result from PUBLIC information only.
 * The output flows into the existing deterministic discovery ingest
 * (scoring / dedupe / unclaimed-profile creation), so this only finds and
 * structures candidates; it does not bypass any safety gate.
 *
 * Compliance: we NEVER invent or imply pricing, availability, capacity,
 * insurance, certifications, or emails. An email is only carried through when it
 * is clearly published on the page. Everything downstream is created marked
 * "ai_suggested pending owner verification" by the discovery pipeline.
 *
 * Local-first / never a hard dependency: when search is disabled, returns [].
 * When the LLM is off or fails on a result, that result is skipped. Any per
 * result failure is swallowed so one bad page never breaks the batch.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { searchEnabled, SEARCH_PROVIDER, SEARXNG_URL } from "../config.js";
import { llmEnabled, llmJson } from "./llm.js";
import { htmlToText } from "./extract.js";
import { safeFetch } from "./safe-fetch.js";

export type SearchedBusiness = {
  business_name: string;
  website_url?: string;
  city?: string;
  state?: string;
  category?: string;
  public_email?: string;
  source_urls?: string[];
};

export type SearchQuery = {
  category: string;
  city?: string;
  state?: string;
  limit?: number;
};

const SEARCH_TIMEOUT_MS = 12000;
const PAGE_TIMEOUT_MS = 10000;
const MAX_PAGE_BYTES = 400_000;
const MAX_PAGE_TEXT = 8000;
const DEFAULT_LIMIT = 10;
const HARD_LIMIT = 25;

type SearxResult = { url?: string; title?: string; content?: string };

function hostKey(url?: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^www\./, "").toLowerCase();
  }
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

async function fetchJsonWithTimeout<T>(url: string, ms: number): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    // H3: SSRF-guarded fetch (validates host + every redirect target).
    const res = await safeFetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "User-Agent": "DiviniPartnersDiscoveryBot/1.0 (+public listing discovery)",
      },
    });
    if (!res || !res.ok) return null;
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype && !/text\/|html|xml/.test(ctype)) return null;
    const raw = await res.text();
    return htmlToText(raw.slice(0, MAX_PAGE_BYTES)).slice(0, MAX_PAGE_TEXT);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Query SearXNG JSON API and return the top result rows. */
async function searxngSearch(q: string, limit: number): Promise<SearxResult[]> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(q)}&format=json`;
  const data = await fetchJsonWithTimeout<{ results?: SearxResult[] }>(url, SEARCH_TIMEOUT_MS);
  if (!data || !Array.isArray(data.results)) return [];
  return data.results.filter((r) => r && typeof r.url === "string").slice(0, limit);
}

/**
 * Use the local LLM to structure one candidate business row from a search result
 * (title, snippet, and optionally the fetched page text). Returns null when the
 * model is off, fails, or the page does not describe a single concrete business.
 */
async function structureCandidate(
  result: SearxResult,
  hints: { category: string; city?: string; state?: string },
  pageText: string | null,
): Promise<SearchedBusiness | null> {
  if (!llmEnabled()) return null;

  const system =
    "You extract a single business listing from search-result text. You only " +
    "restate information clearly present in the supplied text. You NEVER invent " +
    "or imply pricing, availability, capacity, insurance, certifications, or " +
    "email addresses. Only include an email if it is explicitly written in the " +
    "text. If the text does not clearly describe one concrete business, return " +
    '{"business_name": ""}. Reply with JSON only.';

  const prompt =
    "Search hint category: " +
    hints.category +
    (hints.city ? `\nSearch hint city: ${hints.city}` : "") +
    (hints.state ? `\nSearch hint state: ${hints.state}` : "") +
    "\nResult URL: " +
    (result.url ?? "") +
    "\nResult title: " +
    (result.title ?? "") +
    "\nResult snippet: " +
    (result.content ?? "") +
    (pageText ? "\n\nPage text (truncated):\n" + pageText : "") +
    "\n\nExtract the single business this page is about." +
    ' Return JSON exactly as: {"business_name": string, "website_url": string,' +
    ' "city": string, "state": string, "category": string, "public_email": string}.' +
    " Use the result URL as website_url only if it is the business own site." +
    " Include public_email only if an email is explicitly published in the text," +
    " otherwise use an empty string. Never guess an email. Use empty strings for" +
    " any field you cannot support from the text.";

  const out = await llmJson<{
    business_name?: unknown;
    website_url?: unknown;
    city?: unknown;
    state?: unknown;
    category?: unknown;
    public_email?: unknown;
  }>(prompt, { system, timeoutMs: 20000 });
  if (!out) return null;

  const name = typeof out.business_name === "string" ? out.business_name.trim() : "";
  if (!name) return null;

  const str = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s.length > 0 ? s : undefined;
  };

  const row: SearchedBusiness = {
    business_name: name.slice(0, 200),
    website_url: str(out.website_url) ?? str(result.url),
    city: str(out.city) ?? hints.city,
    state: str(out.state) ?? hints.state,
    category: str(out.category) ?? hints.category,
    source_urls: result.url ? [result.url] : undefined,
  };
  // Only carry an email that is clearly a valid, published address.
  if (isEmail(out.public_email)) row.public_email = (out.public_email as string).trim();
  return row;
}

/**
 * Search for candidate businesses by category + location.
 *
 * Returns [] when search is not enabled. With SEARCH_PROVIDER=searxng, queries
 * SearXNG, fetches each result page, and uses the local LLM to structure a
 * candidate row per result. Obvious repeats (same website host or same name) are
 * de-duplicated here before the rows reach the discovery ingest.
 */
export async function searchBusinesses(query: SearchQuery): Promise<SearchedBusiness[]> {
  if (!searchEnabled()) return [];
  const category = (query.category || "").trim();
  if (!category) return [];

  const limit = Math.max(1, Math.min(HARD_LIMIT, query.limit ?? DEFAULT_LIMIT));
  const where = [query.city, query.state].filter((s) => s && String(s).trim()).join(" ").trim();
  const q = where ? `${category} in ${where}` : category;

  let results: SearxResult[] = [];
  if (SEARCH_PROVIDER === "searxng") {
    results = await searxngSearch(q, limit);
  } else {
    // Only SearXNG is wired for the local-first path. Other providers stay []
    // until explicitly implemented, so callers never get fabricated rows.
    return [];
  }
  if (!results.length) return [];

  const hints = { category, city: query.city, state: query.state };
  const out: SearchedBusiness[] = [];
  const seenHosts = new Set<string>();
  const seenNames = new Set<string>();

  for (const r of results) {
    if (out.length >= limit) break;
    let row: SearchedBusiness | null = null;
    try {
      const pageText = r.url ? await fetchPageText(r.url) : null;
      row = await structureCandidate(r, hints, pageText);
    } catch {
      row = null;
    }
    if (!row || !row.business_name) continue;

    const host = hostKey(row.website_url);
    const nameKey = row.business_name.toLowerCase();
    if (host && seenHosts.has(host)) continue;
    if (!host && seenNames.has(nameKey)) continue;
    if (host) seenHosts.add(host);
    seenNames.add(nameKey);
    out.push(row);
  }

  return out;
}
