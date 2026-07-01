/**
 * Visitor geo resolution for landing-page personalization (dependency-free).
 *
 * resolveGeo(req) returns a coarse region plus locale and an optional VPN flag,
 * resolved in this order, each tier degrading gracefully and NEVER throwing:
 *
 *   1. Trusted geo headers from an upstream edge (Cloudflare, a CDN, or Caddy).
 *      cf-ipcountry / x-geo-country / x-country give us a country code directly,
 *      and cf-region / x-geo-region / cf-ipcity / x-geo-city refine US visitors
 *      to the South-Florida / Miami area when present.
 *   2. An operator-configured GeoIP endpoint (process.env.GEOIP_API_URL). We GET
 *      `${GEOIP_API_URL}?ip=<ip>` with a short timeout and tolerate any failure.
 *      A provider may also return a vpn / hosting / proxy flag, which we surface.
 *   3. A coarse locale derived from Accept-Language. Region stays 'unknown' and
 *      vpn stays null, so the caller serves the default (current static) copy.
 *
 * No paid API, no new packages. The GeoIP fetch is routed through safeFetch so
 * an operator-misconfigured URL cannot be turned into an SSRF vector.
 *
 * ZERO em dashes in this file (hard rule).
 */
import type { Request } from "express";
import { safeFetch } from "./safe-fetch.js";
import { lookupLocalGeo } from "./geoip.js";

export type GeoRegion = "sofla" | "florida" | "us" | "intl" | "unknown";

export interface GeoResult {
  ip: string | null;
  region: GeoRegion;
  country?: string; // ISO-3166 alpha-2, uppercased, when known
  locale: string; // BCP-47-ish, e.g. "en-US"
  vpn: boolean | null; // only set when a provider returns it; null otherwise
  source: "header" | "geoip" | "accept-language" | "none";
}

/** South-Florida region codes (FL plus the metro counties we treat as "sofla"). */
const SOFLA_REGION_CODES = new Set(["fl", "florida"]);
const SOFLA_CITY_HINTS = [
  "miami",
  "miami beach",
  "miami gardens",
  "hialeah",
  "coral gables",
  "doral",
  "fort lauderdale",
  "ft lauderdale",
  "hollywood",
  "pembroke pines",
  "boca raton",
  "west palm beach",
  "palm beach",
  "aventura",
  "sunny isles",
  "brickell",
  "kendall",
  "homestead",
];

function firstHeader(req: Request, name: string): string | null {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

/** Read the client IP from x-forwarded-for (Caddy sets this) or the socket. */
function clientIp(req: Request): string | null {
  const xff = firstHeader(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = firstHeader(req, "x-real-ip");
  if (real) return real.trim();
  return req.socket?.remoteAddress ?? null;
}

/** Parse Accept-Language into a best-guess BCP-47 locale, defaulting to en-US. */
function localeFromAcceptLanguage(req: Request): string {
  const al = firstHeader(req, "accept-language");
  if (!al) return "en-US";
  // Take the first language tag before any q-weight or comma.
  const tag = al.split(",")[0]?.split(";")[0]?.trim();
  if (!tag) return "en-US";
  // Light normalization: lang lowercase, region uppercase when present.
  const [lang, region] = tag.split("-");
  if (!lang) return "en-US";
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/** Map a country code (+ optional US region/city) to our coarse region bucket. */
function regionFromCountry(
  country: string | null,
  regionCode: string | null,
  city: string | null,
): GeoRegion {
  if (!country) return "unknown";
  const cc = country.trim().toUpperCase();
  if (!cc) return "unknown";
  if (cc !== "US") return "intl";
  const rc = (regionCode || "").trim().toLowerCase();
  const ct = (city || "").trim().toLowerCase();
  const isSoflaRegion = SOFLA_REGION_CODES.has(rc);
  const isSoflaCity = ct ? SOFLA_CITY_HINTS.some((h) => ct.includes(h)) : false;
  if (isSoflaCity) return "sofla";
  if (isSoflaRegion) {
    // A Florida region code with a Miami-area city is sofla; otherwise the
    // broader Florida bucket so we can still localize without overclaiming.
    return "florida";
  }
  return "us";
}

/** Coerce a provider's truthy/falsey vpn-ish field into boolean | null. */
function coerceVpnFlag(raw: unknown): boolean | null {
  if (raw === true || raw === false) return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "1") return true;
    if (s === "false" || s === "no" || s === "0") return false;
  }
  if (typeof raw === "number") return raw !== 0;
  return null;
}

/** Tier 1: trusted upstream geo headers. */
function fromHeaders(req: Request, ip: string | null, locale: string): GeoResult | null {
  const country =
    firstHeader(req, "cf-ipcountry") ||
    firstHeader(req, "x-geo-country") ||
    firstHeader(req, "x-country") ||
    null;
  if (!country) return null;
  const cc = country.trim().toUpperCase();
  // Cloudflare uses "XX"/"T1" for unknown/Tor; treat those as no signal.
  if (!cc || cc === "XX" || cc === "T1") return null;
  const regionCode =
    firstHeader(req, "cf-region-code") ||
    firstHeader(req, "cf-region") ||
    firstHeader(req, "x-geo-region") ||
    null;
  const city =
    firstHeader(req, "cf-ipcity") || firstHeader(req, "x-geo-city") || null;
  return {
    ip,
    region: regionFromCountry(cc, regionCode, city),
    country: cc,
    locale,
    vpn: null,
    source: "header",
  };
}

/** Tier 1.5: local self-hosted GeoIP database (maxmind/DB-IP mmdb on disk). */
async function fromLocalDb(ip: string | null, locale: string): Promise<GeoResult | null> {
  if (!ip) return null;
  const g = await lookupLocalGeo(ip);
  if (!g || !g.country) return null;
  const cc = g.country.toUpperCase();
  return {
    ip,
    region: regionFromCountry(cc, g.region, g.city),
    country: cc,
    locale,
    vpn: null, // a free country/city DB has no anonymizer flag; stays null
    source: "geoip",
  };
}

/** Tier 2: operator-configured GeoIP endpoint. Tolerates any failure. */
async function fromGeoIp(ip: string | null, locale: string): Promise<GeoResult | null> {
  const base = (process.env.GEOIP_API_URL || "").trim();
  if (!base || !ip) return null;
  const sep = base.includes("?") ? "&" : "?";
  const url = `${base}${sep}ip=${encodeURIComponent(ip)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await safeFetch(url, { signal: ctrl.signal });
    if (!res || !res.ok) return null;
    const data: any = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    // Be permissive about field names different providers use.
    const country =
      data.country_code ||
      data.countryCode ||
      data.country ||
      data.country_code2 ||
      null;
    const regionCode = data.region_code || data.regionCode || data.region || data.state || null;
    const city = data.city || data.city_name || null;
    const vpn = coerceVpnFlag(
      data.vpn ??
        data.proxy ??
        data.hosting ??
        data.is_vpn ??
        data.is_proxy ??
        data.is_hosting ??
        (data.security && (data.security.vpn ?? data.security.proxy ?? data.security.hosting)),
    );
    if (!country) {
      // No country but maybe a vpn flag; still better than nothing.
      return vpn === null
        ? null
        : { ip, region: "unknown", locale, vpn, source: "geoip" };
    }
    const cc = String(country).trim().toUpperCase();
    return {
      ip,
      region: regionFromCountry(cc, regionCode ? String(regionCode) : null, city ? String(city) : null),
      country: cc,
      locale,
      vpn,
      source: "geoip",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a visitor's coarse geo. Never throws; on no signal returns an
 * 'unknown' region with a locale guess so callers serve the default copy.
 */
export async function resolveGeo(req: Request): Promise<GeoResult> {
  const ip = clientIp(req);
  const locale = localeFromAcceptLanguage(req);

  try {
    const headerGeo = fromHeaders(req, ip, locale);
    if (headerGeo) return headerGeo;

    // Local, self-hosted GeoIP database (preferred: no network, reusable).
    const localGeo = await fromLocalDb(ip, locale);
    if (localGeo) return localGeo;

    const geoIp = await fromGeoIp(ip, locale);
    if (geoIp) return geoIp;
  } catch {
    // fall through to the locale-only fallback
  }

  return { ip, region: "unknown", locale, vpn: null, source: ip ? "accept-language" : "none" };
}
