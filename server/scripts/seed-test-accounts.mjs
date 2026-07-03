/**
 * Seed demo/test accounts - one verified account per user type so you can log in
 * and walk each profile before production. Idempotent: re-running updates the
 * password + role rather than creating duplicates.
 *
 * Usage (from the repo root, on a box where DATABASE_URL is available):
 *   node server/scripts/seed-test-accounts.mjs
 * or inline:
 *   DATABASE_URL="postgres://..." node server/scripts/seed-test-accounts.mjs
 *
 * Login for each account: the email below + the shared password DEMO_PASSWORD.
 * Passwords are hashed exactly like the app (scrypt$<saltHex>$<hashHex>) and
 * email_verified is set true, so these accounts can log in immediately.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

// ---- shared demo password (change here if you like) ----
const DEMO_PASSWORD = "DiviniDemo!2026";

// ---- accounts to create (one per unique user type) ----
const ACCOUNTS = [
  { role: "venue",   email: "venue.demo@divinipartners.com",   name: "Demo Venue",   org: "Demo Venue Co",   tier: "free_partner" },
  { role: "vendor",  email: "vendor.demo@divinipartners.com",  name: "Demo Vendor",  org: "Demo Vendor Co",  tier: "free_partner" },
  { role: "planner", email: "planner.demo@divinipartners.com", name: "Demo Planner", org: "Demo Planning Co", tier: "free_partner" },
  { role: "client",  email: "client.demo@divinipartners.com",  name: "Demo Client",  org: "Demo Client",     tier: "client" },
];

function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function readEnvValue(file, key) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && m[1] === key) return m[2].replace(/^['"]|['"]$/g, "").trim();
    }
  } catch { /* no file */ }
  return null;
}

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidates = [
    ["server", ".env.local"], [".env.local"], ["server", ".env"], [".env"],
  ].map((p) => path.join(repoRoot, ...p));
  for (const f of candidates) {
    const v = readEnvValue(f, "DATABASE_URL");
    if (v) return v;
  }
  return null;
}

async function main() {
  const url = resolveUrl();
  if (!url) {
    console.error("No DATABASE_URL found. Set it inline:\n  DATABASE_URL=\"postgres://...\" node server/scripts/seed-test-accounts.mjs");
    process.exit(1);
  }
  const needsSsl = /sslmode=require|neon\.tech|render\.com|amazonaws\.com/i.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  const results = [];
  try {
    for (const a of ACCOUNTS) {
      const pwHash = hashPassword(DEMO_PASSWORD);
      const existing = (await client.query("select id, organization_id from users where email = $1", [a.email])).rows[0];
      if (existing) {
        let orgId = existing.organization_id;
        if (!orgId) {
          orgId = (await client.query(
            "insert into organizations (name, type, tier, status, subscription_status) values ($1,$2,$3,'active','active') returning id",
            [a.org, a.role, a.tier],
          )).rows[0].id;
        }
        await client.query(
          "update users set password_hash=$2, email_verified=true, verify_token=null, role=$3, name=$4, organization_id=$5, account_type='demo', status='active', updated_at=now() where id=$1",
          [existing.id, pwHash, a.role, a.name, orgId],
        );
        results.push({ ...a, action: "updated" });
      } else {
        const orgId = (await client.query(
          "insert into organizations (name, type, tier, status, subscription_status) values ($1,$2,$3,'active','active') returning id",
          [a.org, a.role, a.tier],
        )).rows[0].id;
        await client.query(
          `insert into users (email, name, role, organization_id, password_hash, email_verified, verify_token, account_type, status)
           values ($1,$2,$3,$4,$5,true,null,'demo','active')`,
          [a.email, a.name, a.role, orgId, pwHash],
        );
        results.push({ ...a, action: "created" });
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\nDemo accounts ready (password for all: " + DEMO_PASSWORD + "):\n");
  for (const r of results) {
    console.log(`  [${r.action}] ${r.role.padEnd(8)}  ${r.email}`);
  }
  console.log("\nLog in at https://divinipartners.com/login with any email above + the password.\n");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
