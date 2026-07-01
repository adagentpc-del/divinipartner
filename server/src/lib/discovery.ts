/**
 * Discovery + enrichment pipeline (automation addendum: Unclaimed Profile
 * Creation, Confidence Scoring, Duplicate Detection, Monthly Geographic
 * Expansion).
 *
 * IMPORTANT - this build does NO live scraping. The pipeline is deterministic,
 * source-safe scaffolding: an admin supplies business rows (name, website, city,
 * category, public email, ...) drawn from publicly available information, and
 * this module:
 *   1. computes an AI confidence score from the addendum signals,
 *   2. runs duplicate detection (name / website / phone / email / city),
 *   3. generates a SAFE, clearly-labelled AI description + tags, and
 *   4. creates an unclaimed profile only when confidence clears the threshold.
 *
 * Safety: we NEVER invent pricing, availability, capacity, insurance, or
 * certifications. Generated copy is structural and explicitly marked
 * "ai_suggested pending owner verification".
 *
 * ZERO em dashes in this file (hard rule).
 */
import * as claim from "../db/claim.js";
import { slugify } from "../db/profiles.js";
import { llmEnabled, llmJson } from "./llm.js";

export const AI_TAG_NOTE = "ai_suggested pending owner verification";

// ---- Confidence scoring ----------------------------------------------------

export type ConfidenceBand = "high" | "review" | "low" | "reject";

export type BusinessInput = {
  businessName: string;
  websiteUrl?: string | null;
  city?: string | null;
  state?: string | null;
  region?: string | null;
  country?: string | null;
  category?: string | null;
  subcategories?: string[] | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  address?: string | null;
  socialLinks?: Record<string, string> | null;
  sourceUrls?: string[] | null;
};

export type ConfidenceResult = {
  score: number; // 0..100
  band: ConfidenceBand;
  inputs: Record<string, number>;
  shouldCreate: boolean;
};

/**
 * Confidence score from the addendum signals. Each present, well-formed signal
 * contributes points; the total is clamped to 0..100 and bucketed by the
 * addendum thresholds: 90+ high, 70-89 review-light, 50-69 review, <50 reject.
 */
export function scoreConfidence(b: BusinessInput): ConfidenceResult {
  const inputs: Record<string, number> = {};
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim().length > 0;

  inputs.business_name = has(b.businessName) ? 18 : 0;
  inputs.website = isLikelyUrl(b.websiteUrl) ? 22 : 0;
  inputs.public_email = isLikelyEmail(b.publicEmail) ? 16 : 0;
  inputs.public_phone = isLikelyPhone(b.publicPhone) ? 10 : 0;
  inputs.location = has(b.city) && (has(b.state) || has(b.region)) ? 12 : has(b.city) ? 6 : 0;
  inputs.category = has(b.category) ? 8 : 0;
  inputs.address = has(b.address) ? 6 : 0;
  inputs.social = b.socialLinks && Object.keys(b.socialLinks).length > 0 ? 4 : 0;
  inputs.sources = Array.isArray(b.sourceUrls) && b.sourceUrls.length >= 2 ? 4 : 0;

  // Email/website domain agreement is a strong corroborating signal.
  inputs.domain_match = emailDomainMatchesWebsite(b.publicEmail, b.websiteUrl) ? 8 : 0;

  let score = Object.values(inputs).reduce((a, n) => a + n, 0);
  score = Math.max(0, Math.min(100, score));

  // Addendum thresholds: 90+ high, 70-89 / 50-69 review, <50 reject.
  let band: ConfidenceBand;
  if (score >= 90) band = "high";
  else if (score >= 50) band = "review";
  else band = "reject";

  // Per the addendum, only profiles at or above the 70 threshold auto-create.
  const shouldCreate = score >= 70;
  return { score, band, inputs, shouldCreate };
}

function isLikelyUrl(v?: string | null): boolean {
  if (!v) return false;
  const s = v.trim();
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(s);
}
function isLikelyEmail(v?: string | null): boolean {
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isLikelyPhone(v?: string | null): boolean {
  if (!v) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
export function hostFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^www\./, "").toLowerCase();
  }
}
function emailDomainMatchesWebsite(email?: string | null, website?: string | null): boolean {
  if (!isLikelyEmail(email) || !website) return false;
  const emailDomain = email!.split("@")[1]?.toLowerCase() ?? "";
  const host = hostFromUrl(website);
  if (!emailDomain || !host) return false;
  return emailDomain === host || host.endsWith(`.${emailDomain}`) || emailDomain.endsWith(host);
}

// ---- Safe AI description + tags --------------------------------------------

/**
 * Deterministic, safe description. Structural sentences only. No pricing,
 * capacity, availability, insurance, or certification claims are ever produced.
 */
export function generateDescription(b: BusinessInput): string {
  const name = b.businessName.trim();
  const place = [b.city, b.state || b.region].filter(Boolean).join(", ");
  const cat = b.category ? b.category.toLowerCase() : "event partner";
  const parts: string[] = [];
  parts.push(
    `${name} is listed as ${article(cat)} ${cat}${place ? ` based in ${place}` : ""}.`,
  );
  parts.push(
    "This profile was generated from publicly available information and has not been reviewed or confirmed by the business.",
  );
  parts.push(
    "If you own or represent this business, claim the profile to verify the details, add your own description, services, and photos, and control how you appear.",
  );
  return parts.join(" ");
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** Safe, structural tags. Marked pending owner verification at the data layer. */
export function generateTags(b: BusinessInput): string[] {
  const tags = new Set<string>();
  if (b.category) tags.add(b.category);
  for (const s of b.subcategories ?? []) tags.add(s);
  if (b.city) tags.add(b.city);
  if (b.region) tags.add(b.region);
  tags.add("unclaimed");
  return Array.from(tags).slice(0, 12);
}

/**
 * Local-model-first description + tags. When a local LLM is available it polishes
 * the SAME public, owner-unconfirmed fields into a cleaner structural description
 * and tag set. The model is given only the supplied public fields and is told
 * NEVER to add pricing, availability, capacity, insurance, or certifications. On
 * any failure (disabled, timeout, bad JSON) we fall back to the deterministic
 * output above, so the LLM is never a hard dependency.
 *
 * The returned copy keeps the same "generated from public info, not confirmed by
 * the business, claim to verify" framing and the result is stored under the same
 * AI_TAG_NOTE pending-owner-verification contract at the data layer.
 */
export async function buildAiDescriptionAndTags(
  b: BusinessInput,
): Promise<{ description: string; tags: string[] }> {
  const deterministic = {
    description: generateDescription(b),
    tags: generateTags(b),
  };
  if (!llmEnabled()) return deterministic;

  const publicFields = {
    businessName: b.businessName,
    category: b.category ?? null,
    subcategories: b.subcategories ?? null,
    city: b.city ?? null,
    state: b.state ?? null,
    region: b.region ?? null,
    country: b.country ?? null,
    websiteUrl: b.websiteUrl ?? null,
  };

  const system =
    "You structure publicly available business information into a neutral, " +
    "factual directory listing. You only restate and organize the fields you " +
    "are given. You NEVER invent or imply pricing, availability, capacity, " +
    "insurance, certifications, awards, ratings, or any claim not present in " +
    "the input. Keep the copy modest and structural. Always make clear the " +
    "listing was generated from public information and is not confirmed by the " +
    "business. Reply with JSON only.";

  const prompt =
    "Public fields (owner has NOT confirmed these):\n" +
    JSON.stringify(publicFields, null, 2) +
    "\n\nProduce a polished but strictly factual unclaimed directory listing." +
    " Do not add any fact that is not in the fields above." +
    ' Return JSON exactly as: {"description": string, "tags": string[]}.' +
    " The description must be 2 to 4 sentences, name the business, restate its" +
    " category and location if present, state that the profile was generated" +
    " from publicly available information and has not been reviewed or confirmed" +
    " by the business, and invite the owner to claim it to verify details." +
    " tags must be 4 to 12 short lowercase labels drawn only from the supplied" +
    " category, subcategories, and location. Never include pricing or capacity.";

  const out = await llmJson<{ description?: unknown; tags?: unknown }>(prompt, {
    system,
    timeoutMs: 20000,
  });
  if (!out) return deterministic;

  const description =
    typeof out.description === "string" && out.description.trim().length > 20
      ? out.description.trim()
      : deterministic.description;

  let tags = deterministic.tags;
  if (Array.isArray(out.tags)) {
    const cleaned = out.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= 40);
    const set = new Set<string>(cleaned);
    set.add("unclaimed");
    if (set.size > 0) tags = Array.from(set).slice(0, 12);
  }

  return { description, tags };
}

// ---- Duplicate detection ---------------------------------------------------

export type DuplicateResult = {
  isDuplicate: boolean;
  duplicateOf?: string;
  reason?: string;
};

/**
 * Compare an input against existing records on name/website/phone/email/city.
 * Returns the first strong match. The DB candidate query already narrows the
 * set; here we attach the precise matching reason.
 */
export async function detectDuplicate(
  b: BusinessInput,
  excludeId?: string,
): Promise<DuplicateResult> {
  const candidates = await claim.findDuplicateCandidates({
    businessName: b.businessName,
    websiteUrl: b.websiteUrl ?? null,
    publicPhone: b.publicPhone ?? null,
    publicEmail: b.publicEmail ?? null,
    city: b.city ?? null,
    excludeId: excludeId ?? null,
  });
  for (const c of candidates) {
    if (b.websiteUrl && c.website_url && hostFromUrl(b.websiteUrl) === hostFromUrl(c.website_url)) {
      return { isDuplicate: true, duplicateOf: c.id, reason: "website match" };
    }
    if (b.publicEmail && c.public_email && b.publicEmail.toLowerCase() === c.public_email.toLowerCase()) {
      return { isDuplicate: true, duplicateOf: c.id, reason: "email match" };
    }
    if (b.publicPhone && c.public_phone && normPhone(b.publicPhone) === normPhone(c.public_phone)) {
      return { isDuplicate: true, duplicateOf: c.id, reason: "phone match" };
    }
    if (
      b.businessName &&
      c.business_name &&
      b.businessName.trim().toLowerCase() === c.business_name.trim().toLowerCase() &&
      b.city &&
      c.city &&
      b.city.trim().toLowerCase() === c.city.trim().toLowerCase()
    ) {
      return { isDuplicate: true, duplicateOf: c.id, reason: "name + city match" };
    }
  }
  return { isDuplicate: false };
}

function normPhone(v: string): string {
  return v.replace(/\D/g, "");
}

// ---- Slug generation -------------------------------------------------------

async function uniqueSlug(name: string, city?: string | null): Promise<string> {
  const base = slugify([name, city].filter(Boolean).join(" ")) || "business";
  let candidate = base;
  for (let i = 2; i < 60; i++) {
    if (!(await claim.slugExists(candidate))) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---- The pipeline ----------------------------------------------------------

export type IngestOutcome = {
  input: string; // business name (for the report)
  discoveredId: string | null;
  profileId: string | null;
  slug: string | null;
  score: number;
  band: ConfidenceBand;
  status: "created" | "duplicate" | "below_threshold" | "rejected";
  reason?: string;
};

/**
 * Ingest one admin-provided business row end-to-end:
 *  score -> de-dupe -> (if clears threshold) create discovered + unclaimed.
 * Below-threshold rows are still recorded as 'discovered'/'rejected' so the
 * admin queue and metrics stay accurate, but no public profile is created.
 */
export async function ingestBusiness(
  b: BusinessInput,
  opts: { marketId?: string | null; forceCreate?: boolean } = {},
): Promise<IngestOutcome> {
  const conf = scoreConfidence(b);
  // forceCreate is for admin-curated, human-verified seed rows: bypass the
  // discovery confidence floor (a person already vetted the venue), but still
  // honor duplicate detection so we never create the same profile twice.
  const create = conf.shouldCreate || opts.forceCreate === true;

  if (conf.band === "reject" && !opts.forceCreate) {
    const rec = await claim.insertDiscoveredBusiness({
      businessName: b.businessName,
      category: b.category ?? null,
      subcategories: b.subcategories ?? null,
      websiteUrl: b.websiteUrl ?? null,
      sourceUrls: b.sourceUrls ?? null,
      publicEmail: b.publicEmail ?? null,
      publicPhone: b.publicPhone ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      state: b.state ?? null,
      region: b.region ?? null,
      country: b.country ?? null,
      socialLinks: b.socialLinks ?? null,
      confidenceScore: conf.score,
      confidenceBand: conf.band,
      confidenceInputs: conf.inputs,
      discoveryStatus: "rejected",
      marketId: opts.marketId ?? null,
    });
    return {
      input: b.businessName,
      discoveredId: rec.id,
      profileId: null,
      slug: null,
      score: conf.score,
      band: conf.band,
      status: "rejected",
      reason: "below confidence floor",
    };
  }

  const dupe = await detectDuplicate(b);
  const rec = await claim.insertDiscoveredBusiness({
    businessName: b.businessName,
    category: b.category ?? null,
    subcategories: b.subcategories ?? null,
    websiteUrl: b.websiteUrl ?? null,
    sourceUrls: b.sourceUrls ?? null,
    publicEmail: b.publicEmail ?? null,
    publicPhone: b.publicPhone ?? null,
    address: b.address ?? null,
    city: b.city ?? null,
    state: b.state ?? null,
    region: b.region ?? null,
    country: b.country ?? null,
    socialLinks: b.socialLinks ?? null,
    confidenceScore: conf.score,
    confidenceBand: conf.band,
    confidenceInputs: conf.inputs,
    discoveryStatus: dupe.isDuplicate ? "rejected" : create ? "unclaimed" : "discovered",
    duplicateOf: dupe.duplicateOf ?? null,
    duplicateReason: dupe.reason ?? null,
    marketId: opts.marketId ?? null,
  });

  if (dupe.isDuplicate) {
    return {
      input: b.businessName,
      discoveredId: rec.id,
      profileId: null,
      slug: null,
      score: conf.score,
      band: conf.band,
      status: "duplicate",
      reason: dupe.reason,
    };
  }

  if (!create) {
    return {
      input: b.businessName,
      discoveredId: rec.id,
      profileId: null,
      slug: null,
      score: conf.score,
      band: conf.band,
      status: "below_threshold",
      reason: "confidence below create threshold (70)",
    };
  }

  const slug = await uniqueSlug(b.businessName, b.city);
  const ai = await buildAiDescriptionAndTags(b);
  const profile = await claim.createUnclaimedProfile({
    discoveredBusinessId: rec.id,
    slug,
    description: ai.description,
    tags: ai.tags,
    brandColors: null,
    logoUrl: null,
    imageUrls: null,
    noindex: true, // unclaimed pages are noindex until claimed (SEO rule)
  });

  if (opts.marketId) await claim.incrementMarketDiscovered(opts.marketId, 1);

  return {
    input: b.businessName,
    discoveredId: rec.id,
    profileId: profile.id,
    slug,
    score: conf.score,
    band: conf.band,
    status: "created",
  };
}

export async function ingestMany(
  rows: BusinessInput[],
  opts: { marketId?: string | null; forceCreate?: boolean } = {},
): Promise<{ outcomes: IngestOutcome[]; summary: Record<string, number> }> {
  const outcomes: IngestOutcome[] = [];
  for (const r of rows) {
    if (!r || !r.businessName || !r.businessName.trim()) continue;
    outcomes.push(await ingestBusiness(r, opts));
  }
  const summary: Record<string, number> = {
    total: outcomes.length,
    created: 0,
    duplicate: 0,
    below_threshold: 0,
    rejected: 0,
  };
  for (const o of outcomes) summary[o.status] = (summary[o.status] ?? 0) + 1;
  return { outcomes, summary };
}

// ---- Monthly geographic expansion scheduler --------------------------------

/**
 * Ordered rollout from the addendum: start in South Florida, expand to all of
 * Florida, then advance to the next markets. This is a PURE planner the admin
 * can step. It does not scrape; it decides which market to open next based on
 * the recorded market states.
 */
export const MARKET_ROLLOUT: { marketName: string; state: string; region: string }[] = [
  { marketName: "South Florida", state: "FL", region: "South Florida" },
  { marketName: "All Florida", state: "FL", region: "Florida" },
  { marketName: "Georgia", state: "GA", region: "Southeast" },
  { marketName: "Texas", state: "TX", region: "South" },
  { marketName: "New York", state: "NY", region: "Northeast" },
  { marketName: "California", state: "CA", region: "West" },
];

export type ExpansionPlan = {
  current: claim.ClaimMarket | null;
  next: { marketName: string; state: string; region: string } | null;
  rollout: { marketName: string; state: string; region: string }[];
  action: "open_first" | "advance" | "hold" | "complete";
  reason: string;
};

/**
 * Decide the next geographic step. Pure over the supplied market rows.
 *   - no markets yet            -> open the first rollout market
 *   - an active market exists   -> hold (let it finish discovery/outreach)
 *   - active market is complete  -> advance to the next un-opened rollout market
 */
export function planExpansion(markets: claim.ClaimMarket[]): ExpansionPlan {
  const opened = new Set(markets.map((m) => (m.market_name ?? "").toLowerCase()));
  const active = markets.find((m) => m.status === "active") ?? null;
  const nextRollout =
    MARKET_ROLLOUT.find((r) => !opened.has(r.marketName.toLowerCase())) ?? null;

  if (markets.length === 0) {
    return {
      current: null,
      next: MARKET_ROLLOUT[0],
      rollout: MARKET_ROLLOUT,
      action: "open_first",
      reason: "No markets opened yet. Begin with South Florida.",
    };
  }

  if (active) {
    const cap = active.max_profiles ?? 0;
    const done = (active.profiles_discovered ?? 0) >= cap && cap > 0;
    if (!done) {
      return {
        current: active,
        next: nextRollout,
        rollout: MARKET_ROLLOUT,
        action: "hold",
        reason: `${active.market_name} is still active (${active.profiles_discovered ?? 0}/${cap} discovered).`,
      };
    }
  }

  if (!nextRollout) {
    return {
      current: active,
      next: null,
      rollout: MARKET_ROLLOUT,
      action: "complete",
      reason: "All planned rollout markets have been opened.",
    };
  }

  return {
    current: active,
    next: nextRollout,
    rollout: MARKET_ROLLOUT,
    action: "advance",
    reason: `Advance to the next market: ${nextRollout.marketName}.`,
  };
}
