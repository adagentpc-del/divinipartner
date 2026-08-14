/**
 * Divini Partners - anti-bot crawling guard for the public marketing surface.
 *
 * robots.txt (routes/sitemap.ts) only ever ASKS well-behaved bots to respect
 * it -- it does nothing to a scraper, an AI-training crawler, or a generic
 * script that ignores it. This middleware is the actual enforcement: it
 * classifies the User-Agent on public, unauthenticated GET requests and:
 *
 *   1. ALWAYS allows real search-engine indexers (Googlebot, Bingbot, etc.)
 *      -- SEO indexing must never be blocked, per the site's own robots.txt
 *      promise and its dependence on organic search traffic.
 *   2. Blocks (403) known scraping tools and AI-training crawlers -- neither
 *      is a search indexer, and letting AI crawlers ingest vendor/venue
 *      profile content for model training is not something this app's users
 *      consented to when they listed their business.
 *   3. Leaves everything else (real browsers, and any UA not on either list)
 *      untouched -- default-allow, backed by the existing rate limiter
 *      (lib/rateLimit.ts) for anything ambiguous, so an unusual but real
 *      visitor is never locked out on a guess.
 *
 * SCOPE: mounted only on the public marketing/discovery surface (app root,
 * before the SPA fallback), never on /api. This keeps webhook delivery,
 * mobile clients, and any legitimate script calling the authenticated API
 * completely unaffected -- this guard is about page-scraping, not the API.
 *
 * No new npm dependency: pattern matching against the raw User-Agent string.
 * A UA-string allowlist/denylist cannot be cryptographically verified (a
 * scraper can always claim to be Googlebot), so this is a courtesy filter
 * for the honest majority of bots that self-identify accurately, layered on
 * top of -- not a replacement for -- rate limiting and the CDN/WAF layer
 * that would do IP-based verification at the edge.
 *
 * Zero em dashes.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Real search-engine indexers. NEVER blocked -- this is the "except SEO
 * indexing" carve-out. Matched case-insensitively as a substring of the UA.
 */
const ALLOWED_CRAWLERS: readonly string[] = [
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "slurp", // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "applebot", // Siri / Spotlight / Safari suggestions indexing
  "sogou",
  "exabot",
  "seznambot",
];

/**
 * Known scraping tools and AI-training crawlers. Blocked outright on the
 * public marketing surface. Not an SEO indexer in this list -- if a real
 * search engine ships a new indexer UA it belongs in ALLOWED_CRAWLERS above,
 * not removed from here.
 */
const BLOCKED_BOTS: readonly string[] = [
  // AI-training / AI-answer crawlers (not search indexing).
  "gptbot",
  "chatgpt-user",
  "ccbot",
  "anthropic-ai",
  "claudebot",
  "claude-web",
  "bytespider",
  "perplexitybot",
  "google-extended",
  "applebot-extended",
  "diffbot",
  "omgili",
  "omgilibot",
  "youbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "facebookbot", // Meta's AI-training crawler (distinct from facebookexternalhit link-preview)
  "imagesiftbot",
  "timpibot",
  "amazonbot",
  "meta-externalagent",
  // Generic SEO/marketing scrapers (not search-engine indexing).
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "dataforseobot",
  "serpstatbot",
  "blexbot",
  // Generic scraping frameworks / headless automation signatures.
  "scrapy",
  "phantomjs",
  "headlesschrome",
  "python-requests",
  "python-urllib",
  "go-http-client",
  "libwww-perl",
];

function classify(userAgent: string): "allow" | "block" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (ALLOWED_CRAWLERS.some((sig) => ua.includes(sig))) return "allow";
  if (BLOCKED_BOTS.some((sig) => ua.includes(sig))) return "block";
  return "unknown";
}

/**
 * Build the guard. Only classifies GET/HEAD (crawling is a read operation);
 * any other method passes through untouched. A missing User-Agent is treated
 * as "unknown," not blocked outright -- some legitimate monitoring/proxy
 * setups omit it, and the existing rate limiter already bounds abuse from an
 * unidentified client.
 */
export function botGuard(): RequestHandler {
  return function botGuardMw(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const ua = String(req.headers["user-agent"] || "");
    const verdict = classify(ua);

    if (verdict === "block") {
      res.status(403).type("text/plain").send("Automated access is not permitted on this path.");
      return;
    }
    next();
  };
}

export default botGuard;
