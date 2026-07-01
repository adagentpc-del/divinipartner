/**
 * Local GeoIP lookup. Reads a self-hosted MaxMind/DB-IP .mmdb database from disk
 * via the pure-JS `maxmind` reader. NO paid API, NO per-query network call: the
 * database file lives on the server and is read in-process. Works with either the
 * free DB-IP IP-to-Country / City Lite database or MaxMind GeoLite2 Country/City.
 *
 * Reusable across builds: copy this file + `maxmind` dep, drop a .mmdb on disk,
 * and set GEOIP_DB_PATH (or use one of the default paths). When no database is
 * present it returns null and the caller falls back to the next signal. It never
 * throws and loads the reader lazily (once), so it costs nothing until used.
 *
 * Get the free database (run on a machine with internet):
 *   scripts/fetch-geoip.sh   (downloads DB-IP IP-to-Country Lite, monthly, free)
 *
 * Zero em dashes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open, type Reader, type CountryResponse, type CityResponse } from "maxmind";

export interface LocalGeo {
  country: string | null; // ISO-3166 alpha-2
  region: string | null; // subdivision ISO code, when the DB has it (City DB)
  city: string | null; // city name (en), when the DB has it (City DB)
}

type AnyResponse = CountryResponse & CityResponse;

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/lib/geoip.js -> server/ is two levels up; the db lives in server/data/geo.
const dataDir = path.join(here, "..", "..", "data", "geo");

/** Candidate database locations, in priority order. */
function candidatePaths(): string[] {
  const env = (process.env.GEOIP_DB_PATH || "").trim();
  const names = [
    "dbip-city-lite.mmdb",
    "dbip-country-lite.mmdb",
    "GeoLite2-City.mmdb",
    "GeoLite2-Country.mmdb",
    "geoip.mmdb",
  ];
  return [...(env ? [env] : []), ...names.map((n) => path.join(dataDir, n))];
}

let readerPromise: Promise<Reader<AnyResponse> | null> | null = null;

function resolveDbPath(): string | null {
  for (const p of candidatePaths()) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Lazily open the mmdb reader once. Returns null when no database is installed. */
function getReader(): Promise<Reader<AnyResponse> | null> {
  if (readerPromise) return readerPromise;
  readerPromise = (async () => {
    const dbPath = resolveDbPath();
    if (!dbPath) {
      // eslint-disable-next-line no-console
      console.log("[geoip] no local database found; geo falls back to headers/locale. Run scripts/fetch-geoip.sh to enable.");
      return null;
    }
    try {
      const reader = await open<AnyResponse>(dbPath);
      // eslint-disable-next-line no-console
      console.log(`[geoip] loaded local database ${dbPath}`);
      return reader;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[geoip] failed to open database:", (e as Error).message);
      return null;
    }
  })();
  return readerPromise;
}

/** True when a local GeoIP database is installed and readable. */
export async function geoipReady(): Promise<boolean> {
  return (await getReader()) !== null;
}

/**
 * Look up an IP against the local database. Returns null on no database, no
 * match, a private/invalid IP, or any error. Never throws.
 */
export async function lookupLocalGeo(ip: string | null | undefined): Promise<LocalGeo | null> {
  if (!ip) return null;
  const reader = await getReader();
  if (!reader) return null;
  try {
    const rec = reader.get(ip) as AnyResponse | null;
    if (!rec) return null;
    const country = rec.country?.iso_code ?? rec.registered_country?.iso_code ?? null;
    const region = Array.isArray(rec.subdivisions) && rec.subdivisions.length
      ? rec.subdivisions[0]?.iso_code ?? null
      : null;
    const city = rec.city?.names?.en ?? null;
    if (!country && !region && !city) return null;
    return { country: country ? String(country).toUpperCase() : null, region, city };
  } catch {
    return null;
  }
}
