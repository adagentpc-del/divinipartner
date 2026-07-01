/**
 * SEO sitemap + robots for the public marketing surface.
 *
 * Mount this at the APP ROOT (not under /api), BEFORE the SPA history fallback,
 * so that GET /sitemap.xml and GET /robots.txt are served by this router rather
 * than swallowed by the index.html catch-all. See routes/index notes.
 *
 *   import sitemap from "./routes/sitemap.js";
 *   app.use(sitemap);              // <-- before the SPA fallback in app.ts
 *
 * The category x city matrix here mirrors the frontend lists in
 * src/pages/public/CategoryLanding.tsx (VENUE_CATEGORIES, VENDOR_CATEGORIES,
 * DISCOVER_CITIES). Keep the two in sync when categories or cities change.
 */
import { Router, type Request, type Response } from "express";
import { PUBLIC_APP_URL } from "../config.js";

const router = Router();

// Static public marketing pages.
const MARKETING_PATHS = [
  "/",
  "/for-venues",
  "/for-vendors",
  "/for-planners",
  "/for-clients",
  "/marketplace",
  "/how-it-works",
  "/pricing",
  "/privacy",
  "/discover",
];

// Venue + vendor category slugs (mirror CategoryLanding.tsx).
const VENUE_CATEGORY_SLUGS = [
  "ballrooms",
  "estates-and-mansions",
  "rooftops",
  "gardens",
  "hotels-and-resorts",
  "vineyards",
  "lofts-and-warehouses",
  "waterfront",
  "barns-and-farms",
  "galleries-and-museums",
];

const VENDOR_CATEGORY_SLUGS = [
  "caterers",
  "florists",
  "photographers",
  "videographers",
  "entertainment",
  "djs-and-music",
  "rentals",
  "lighting-and-production",
  "decor-and-design",
  "bar-and-beverage",
  "bakeries-and-cakes",
  "hair-and-makeup",
  "transportation",
  "stationery",
  "officiants",
  "staffing",
];

// City slugs (mirror DISCOVER_CITIES in CategoryLanding.tsx).
const CITY_SLUGS = [
  "new-york",
  "los-angeles",
  "chicago",
  "houston",
  "miami",
  "dallas",
  "atlanta",
  "austin",
  "seattle",
  "denver",
  "nashville",
  "san-diego",
];

/** Absolute base for sitemap URLs. Falls back to the request origin. */
function originFor(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}`.replace(/\/$/, "");
}

/** Build the full list of public paths the sitemap should advertise. */
function discoverPaths(): string[] {
  const out: string[] = [];
  for (const type of ["venues", "vendors"] as const) {
    const cats = type === "venues" ? VENUE_CATEGORY_SLUGS : VENDOR_CATEGORY_SLUGS;
    for (const cat of cats) {
      // Category-only page.
      out.push(`/discover/${type}/${cat}`);
      // Category x city pages.
      for (const city of CITY_SLUGS) {
        out.push(`/discover/${type}/${cat}-${city}`);
      }
    }
  }
  return out;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/sitemap.xml", (req: Request, res: Response) => {
  const origin = originFor(req);
  const lastmod = new Date().toISOString().slice(0, 10);
  const paths = [...MARKETING_PATHS, ...discoverPaths()];

  const urls = paths
    .map((p) => {
      const loc = xmlEscape(`${origin}${p}`);
      const priority = p === "/" ? "1.0" : p === "/discover" || p.startsWith("/discover/") ? "0.7" : "0.8";
      const changefreq = p.startsWith("/discover") ? "weekly" : "monthly";
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

router.get("/robots.txt", (req: Request, res: Response) => {
  const origin = originFor(req);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(body);
});

export default router;
