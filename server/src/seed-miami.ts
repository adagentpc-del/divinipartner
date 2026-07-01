/**
 * Seed loader: turn the curated, human-verified Miami-Dade venue list into live
 * unclaimed placeholder profiles in the claim engine. Each becomes a public
 * profile (name, website, logo, category, neighborhood) with a Claim button and
 * the compliant unclaimed banner, ready to market to.
 *
 * Run on the server after deploy:  node server/dist/seed-miami.js
 * Idempotent: re-running skips venues already ingested (duplicate detection).
 *
 * Zero em dashes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as discovery from "./lib/discovery.js";
import { pool, q } from "./pool.js";

type SeedRow = {
  businessName: string;
  websiteUrl?: string | null;
  city?: string | null;
  state?: string | null;
  region?: string | null;
  country?: string | null;
  category?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  sourceUrls?: string[] | null;
  logoUrl?: string | null;
  description?: string | null;
};

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/seed-miami.js -> repo root is two levels up (sites/divini-partners).
  const seedDir = path.join(here, "..", "..", "data", "seed");
  // Load both the venue and vendor/supplier seeds (or a single SEED_FILE override).
  const files = process.env.SEED_FILE
    ? [process.env.SEED_FILE]
    : [path.join(seedDir, "miami-venues.json"), path.join(seedDir, "miami-vendors.json")];
  const rows: SeedRow[] = files.flatMap((fp) =>
    fs.existsSync(fp) ? (JSON.parse(fs.readFileSync(fp, "utf8")) as SeedRow[]) : [],
  );
  // eslint-disable-next-line no-console
  console.log(`[seed-miami] loading ${rows.length} placeholder profiles from ${files.join(", ")}`);

  const inputs = rows.map((r) => ({
    businessName: r.businessName,
    websiteUrl: r.websiteUrl ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    region: r.region ?? null,
    country: r.country ?? null,
    category: r.category ?? null,
    publicEmail: r.publicEmail ?? null,
    publicPhone: r.publicPhone ?? null,
    sourceUrls: r.sourceUrls ?? null,
  }));

  // forceCreate: these are human-verified, so bypass the discovery confidence
  // floor while still honoring duplicate detection (idempotent re-runs).
  const { summary } = await discovery.ingestMany(inputs, { forceCreate: true });
  // eslint-disable-next-line no-console
  console.log("[seed-miami] ingest summary:", JSON.stringify(summary));

  // Set the placeholder logo on each created profile (clearbit logo by domain).
  let logos = 0;
  for (const r of rows) {
    if (!r.logoUrl || !r.websiteUrl) continue;
    const updated = await q<{ id: string }>(
      `update unclaimed_profiles p
          set logo_url = $1
         from discovered_businesses b
        where b.id = p.discovered_business_id
          and b.website_url = $2
          and (p.logo_url is null or p.logo_url = '')
        returning p.id`,
      [r.logoUrl, r.websiteUrl],
    );
    logos += updated.length;
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-miami] logos set on ${logos} profiles`);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[seed-miami] failed:", e);
  process.exit(1);
});
