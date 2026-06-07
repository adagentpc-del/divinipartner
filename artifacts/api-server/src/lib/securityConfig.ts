/**
 * Security configuration & readiness reporting.
 *
 * Centralised inventory of every secret / env var the app cares about for
 * production safety. Each entry declares whether the value is currently
 * REQUIRED (the app should refuse to serve traffic without it), RECOMMENDED
 * (production really wants it but the app can degrade), or OPTIONAL/UNUSED
 * (the value was requested historically but no live code path consumes it).
 *
 * The same module powers:
 *   - Boot-time fail-fast in production (assertRequiredSecrets)
 *   - The /api/security/readiness admin endpoint
 *   - The "Security Readiness" admin page
 *
 * NEVER read or return the secret value itself. Only "present | missing" plus
 * a non-secret hint (e.g. length bucket) is exposed.
 */

export type SecretStatus = "ok" | "missing" | "weak" | "unused";
export type SecretRequirement = "required" | "recommended" | "optional" | "unused";

export interface SecretSpec {
  key: string;
  requirement: SecretRequirement;
  /** What this secret is for, in plain English. */
  purpose: string;
  /** When `unused`, why the app doesn't need it today. */
  notes?: string;
  /** Optional minimum length used to flag short secrets. */
  minLength?: number;
}

export interface SecretReport {
  key: string;
  requirement: SecretRequirement;
  status: SecretStatus;
  present: boolean;
  purpose: string;
  notes?: string;
  /** Bucket like "<32 chars" — never the value itself. */
  lengthHint?: string;
}

const SPECS: SecretSpec[] = [
  // ---- Database / core platform ------------------------------------------
  { key: "DATABASE_URL", requirement: "required", purpose: "Postgres connection string for Drizzle / Neon." },
  { key: "PUBLIC_APP_URL", requirement: "required", purpose: "Canonical https origin (no trailing slash). Used to build share links + email URLs." },
  { key: "SESSION_SECRET", requirement: "optional", purpose: "Express session signing key.", notes: "Not used today — admin auth is delegated to Clerk, so no server-side sessions are issued.", minLength: 32 },
  { key: "ENCRYPTION_KEY", requirement: "optional", purpose: "Symmetric key for at-rest field encryption.", notes: "Not used today — no DB columns are app-encrypted. Add this before storing PII or tokens at rest.", minLength: 32 },

  // ---- Identity / access controls ----------------------------------------
  { key: "ADMIN_ALLOWED_EMAILS", requirement: "required", purpose: "Comma-separated allowlist of email addresses permitted to access admin routes. In production, requireAdmin() rejects all requests when this is unset. In non-prod, any signed-in Clerk user is admitted so dev work isn't blocked." },
  { key: "VITE_CLERK_PUBLISHABLE_KEY", requirement: "required", purpose: "Clerk publishable key consumed by the SPA at build time." },
  { key: "CLERK_SECRET_KEY", requirement: "required", purpose: "Server-side Clerk SDK secret. Without it, getAuth() always returns null and admin gates fail open or closed depending on middleware order.", minLength: 24 },

  // ---- HTTP / network hardening -----------------------------------------
  { key: "ALLOWED_ORIGINS", requirement: "recommended", purpose: "Comma-separated list of browser origins permitted to call /api with credentials. When unset, the API trusts only PUBLIC_APP_URL and the Replit dev domain." },
  { key: "CANONICAL_DOMAIN", requirement: "optional", purpose: "Legacy alias for PUBLIC_APP_URL used by some templates.", notes: "Today PUBLIC_APP_URL is the source of truth; CANONICAL_DOMAIN is read only as a fallback." },

  // ---- Email --------------------------------------------------------------
  { key: "RESEND_API_KEY", requirement: "required", purpose: "Resend API key for outbound email (order confirmations, invoices, ops forwards)." },
  { key: "RESEND_FROM_EMAIL", requirement: "required", purpose: "Verified Resend sender (e.g. order@partnershipportal.co)." },
  { key: "EMAIL_FROM", requirement: "optional", purpose: "Alias for RESEND_FROM_EMAIL.", notes: "If both are set, RESEND_FROM_EMAIL wins; EMAIL_FROM is a compatibility alias." },
  { key: "EMAIL_REPLY_TO", requirement: "recommended", purpose: "Default Reply-To header on transactional mail. Falls back to RESEND_FROM_EMAIL." },
  { key: "INTERNAL_ORDER_EMAILS", requirement: "recommended", purpose: "Comma-separated ops mailbox(es) cc'd on every order confirmation." },

  // ---- Object storage -----------------------------------------------------
  // Downgraded required -> recommended for the off-Replit (Render) deploy.
  // These point at Replit Object Storage, which is unavailable outside Replit.
  // The app boots without them; file-upload features are degraded until storage
  // is repointed to GCS/Supabase Storage. See objectStorage.ts.
  { key: "DEFAULT_OBJECT_STORAGE_BUCKET_ID", requirement: "recommended", purpose: "Object-storage bucket ID for uploads.", notes: "Replit-specific; off-Replit deploys must repoint storage. Uploads degraded while missing." },
  { key: "PRIVATE_OBJECT_DIR", requirement: "recommended", purpose: "Bucket path prefix used for private (ACL-checked) objects.", notes: "Replit-specific; see above." },
  { key: "PUBLIC_OBJECT_SEARCH_PATHS", requirement: "recommended", purpose: "Bucket path(s) served unauthenticated via /api/storage/public-objects.", notes: "Replit-specific; see above." },

  // ---- Payments (not currently integrated) -------------------------------
  { key: "PAYPAL_CLIENT_ID", requirement: "unused", purpose: "PayPal REST client id.", notes: "PayPal is not integrated in this build. Set both this and PAYPAL_CLIENT_SECRET only when adding the integration." },
  { key: "PAYPAL_CLIENT_SECRET", requirement: "unused", purpose: "PayPal REST client secret.", notes: "PayPal is not integrated in this build." },
];

function lengthHint(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const n = v.length;
  if (n < 16) return "<16 chars";
  if (n < 32) return "16–31 chars";
  if (n < 64) return "32–63 chars";
  return "≥64 chars";
}

function statusFor(spec: SecretSpec, raw: string | undefined): SecretStatus {
  const present = !!raw && raw.length > 0;
  if (spec.requirement === "unused") return "unused";
  if (!present) return "missing";
  if (spec.minLength && raw!.length < spec.minLength) return "weak";
  return "ok";
}

export function getSecretReports(): SecretReport[] {
  return SPECS.map((spec) => {
    const raw = process.env[spec.key];
    const status = statusFor(spec, raw);
    return {
      key: spec.key,
      requirement: spec.requirement,
      status,
      present: !!raw && raw.length > 0,
      purpose: spec.purpose,
      notes: spec.notes,
      lengthHint: lengthHint(raw),
    };
  });
}

/**
 * Throw on boot if a strictly-required secret is missing in production.
 * In non-production we only log warnings so dev work isn't blocked.
 */
export function assertRequiredSecrets(): { ok: boolean; missing: string[] } {
  const missing = SPECS
    .filter((s) => s.requirement === "required")
    .filter((s) => {
      const raw = process.env[s.key];
      return !raw || raw.length === 0;
    })
    .map((s) => s.key);

  if (missing.length > 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing required secrets in production: ${missing.join(", ")}. ` +
      `Set them in Replit Secrets and re-deploy.`,
    );
  }
  return { ok: missing.length === 0, missing };
}

// ---- CORS / origin allowlist -----------------------------------------------

export function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>(fromEnv);
  if (process.env.PUBLIC_APP_URL) out.add(process.env.PUBLIC_APP_URL.replace(/\/$/, ""));
  if (process.env.REPLIT_DEV_DOMAIN) out.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  // Deployment domain pattern.
  if (process.env.REPLIT_DEPLOYMENT_DOMAIN) out.add(`https://${process.env.REPLIT_DEPLOYMENT_DOMAIN}`);

  // Auto-include www <-> apex twin for every https origin so a PUBLIC_APP_URL
  // of https://partnershipportal.co also accepts requests from
  // https://www.partnershipportal.co and vice versa. This avoids subtle CORS
  // 500s when the canonical-host redirect lands the user on the variant that
  // wasn't explicitly listed.
  for (const origin of [...out]) {
    try {
      const u = new URL(origin);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      const host = u.hostname;
      const port = u.port ? `:${u.port}` : "";
      const isWww = host.startsWith("www.");
      const apex = isWww ? host.slice(4) : host;
      const www = isWww ? host : `www.${host}`;
      // Don't fabricate a www. variant for IPs or single-label hosts (localhost).
      const looksLikeDomain = apex.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(apex);
      if (looksLikeDomain) {
        out.add(`${u.protocol}//${apex}${port}`);
        out.add(`${u.protocol}//${www}${port}`);
      }
    } catch {
      // ignore malformed entries
    }
  }
  return [...out];
}

// ---- Admin allowlist -------------------------------------------------------

export function getAdminAllowedEmails(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminAllowlistEnforced(): boolean {
  return getAdminAllowedEmails().length > 0;
}
