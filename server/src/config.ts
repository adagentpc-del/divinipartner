/**
 * Central env/config for the Divini Partners backend. Mirrors divinipartner's
 * securityConfig admin-allowlist + OIDC contract, trimmed to what this app uses.
 */

export const PORT = Number(process.env.PORT || 8080);

export const DATABASE_URL = process.env.DATABASE_URL || "";

// Authentik OIDC (token verification). Issuer/JWKS/audience.
export const OIDC_ISSUER = process.env.OIDC_ISSUER || "";
export const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL || "";
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || ""; // expected aud

// Local-disk file storage root (replaces Supabase Storage).
export const FILE_STORAGE_DIR =
  process.env.FILE_STORAGE_DIR || "/data/procure-files";

/**
 * Pluggable object storage. STORAGE_PROVIDER selects the backend:
 *   - "local" (default): local disk under FILE_STORAGE_DIR (unchanged behavior).
 *   - "s3": any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2,
 *     MinIO) via signed REST requests (no SDK). Requires the S3_* vars below.
 * Everything is flag-gated: with nothing set the app stays on local disk exactly
 * as before.
 */
export const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

export const S3_ENDPOINT = (process.env.S3_ENDPOINT || "").replace(/\/+$/, "");
export const S3_REGION = process.env.S3_REGION || "us-east-1";
export const S3_BUCKET = process.env.S3_BUCKET || "";
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";

/** True when the S3 provider is selected and fully configured. */
export const s3Enabled = (): boolean =>
  STORAGE_PROVIDER === "s3" &&
  !!S3_ENDPOINT &&
  !!S3_BUCKET &&
  !!S3_ACCESS_KEY_ID &&
  !!S3_SECRET_ACCESS_KEY;

/** Resolved S3 config for the signer. Throws if selected but incomplete. */
export function s3Config(): {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
} {
  if (!s3Enabled()) {
    throw new Error(
      "S3 storage is not fully configured. Set STORAGE_PROVIDER=s3 with S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
    );
  }
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  };
}

/**
 * Encryption at rest (optional). When STORAGE_ENCRYPTION_KEY is set (base64 of
 * exactly 32 bytes) stored objects are AES-256-GCM envelope-encrypted before
 * write and decrypted on read, for both the local and s3 providers. When unset,
 * objects are stored as plaintext (the current behavior). Losing this key makes
 * existing encrypted objects unrecoverable.
 */
export const STORAGE_ENCRYPTION_KEY = process.env.STORAGE_ENCRYPTION_KEY || "";
export const storageEncryptionEnabled = (): boolean => !!STORAGE_ENCRYPTION_KEY;

/**
 * Database backups (server/src/scripts/backup-db.ts). Reuses the same
 * pluggable object storage (local disk or S3-compatible, with
 * STORAGE_ENCRYPTION_KEY envelope encryption) as file uploads, under a
 * separate "backups/db/" key prefix -- so if S3 + encryption are already
 * configured for uploaded documents, backups get both automatically, with
 * zero new infrastructure. BACKUP_RETENTION_DAYS controls how many days of
 * backups the prune step (run automatically after each backup) keeps.
 */
export const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 14);
export const BACKUP_KEY_PREFIX = "backups/db";

/**
 * Optional error-monitoring sink (lib/logger.ts). When set, every
 * logger.error() call POSTs a JSON payload to this URL (best-effort,
 * non-blocking) in addition to the structured stdout/stderr log line that
 * always happens regardless. A generic webhook rather than a specific
 * vendor SDK -- point it at a Slack incoming webhook, a custom collector,
 * or a Sentry-compatible ingestion proxy. Unset by default: structured
 * logging to stdout/stderr always happens; this only adds real-time
 * alerting on top of it once an operator has somewhere to send it.
 */
export const ERROR_MONITORING_WEBHOOK_URL = process.env.ERROR_MONITORING_WEBHOOK_URL || "";

export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
export const BASE_PATH = (process.env.BASE_PATH || "/").replace(/\/$/, "") || "";

// Legal entity + valid physical postal address. Required in every commercial
// email footer (CAN-SPAM 15 U.S.C. 7704(a)(5)) and shown on legal pages.
// Env-overridable so it can be updated without a code change.
export const COMPANY_LEGAL_NAME = process.env.COMPANY_LEGAL_NAME || "Divini Group LLC";
export const COMPANY_POSTAL_ADDRESS =
  process.env.COMPANY_POSTAL_ADDRESS ||
  "1756 N Bayshore Drive, Suite 14L, Miami, FL 33132";

export function getAdminAllowedEmails(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  const out = new Set<string>(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (PUBLIC_APP_URL) out.add(PUBLIC_APP_URL);
  return [...out];
}

export const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Payment processors. Feature-flagged: when keys are absent the processor is
 * simply "disabled" and the system stays record-only (no money moves). Keys are
 * placeholders in the deploy doc; never commit real secrets.
 *
 * MVP model (stated assumption): the client pays into the Divini platform
 * account (Stripe Checkout / PayPal Orders). We record the payment with the
 * existing fee breakdown and track the vendor payout via payout_status. Full
 * marketplace splits (Stripe Connect / PayPal multiparty) are a later phase.
 */
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
export const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
export const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase(); // sandbox | live
export const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || "";

export const PAYMENT_CURRENCY = (process.env.PAYMENT_CURRENCY || "USD").toUpperCase();

export const stripeEnabled = (): boolean => !!STRIPE_SECRET_KEY;
export const paypalEnabled = (): boolean => !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
export const paypalApiBase = (): string =>
  PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

/**
 * Email transport. Feature-flagged: with no provider/key set, email calls log
 * (the prior stub behavior) and nothing is sent. Supports Resend and Postal via
 * HTTP, so no SMTP dependency is required.
 */
export const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "").toLowerCase(); // resend | postal
export const EMAIL_API_KEY = process.env.EMAIL_API_KEY || "";
export const EMAIL_FROM = process.env.EMAIL_FROM || "Divini Partners <partners@divinipartners.com>";
export const POSTAL_API_URL = (process.env.POSTAL_API_URL || "").replace(/\/$/, ""); // e.g. https://postal.example.com
export const emailEnabled = (): boolean =>
  (EMAIL_PROVIDER === "resend" && !!EMAIL_API_KEY) ||
  (EMAIL_PROVIDER === "postal" && !!EMAIL_API_KEY && !!POSTAL_API_URL);

/**
 * Background worker / scheduler. WORKER_INTERVAL_MINUTES > 0 starts an in-process
 * loop; 0 means "off, driven by external cron calling worker.js".
 */
export const WORKER_INTERVAL_MINUTES = Number(process.env.WORKER_INTERVAL_MINUTES || 0);

/**
 * Local-first LLM. Defaults to a local Ollama server; when unreachable or off,
 * callers fall back to deterministic logic (never a hard dependency). An
 * OpenAI-compatible endpoint is supported only if explicitly configured.
 */
export const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase(); // ollama | openai-compat | off
export const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
export const LLM_MODEL = process.env.LLM_MODEL || "llama3.1";
export const LLM_API_KEY = process.env.LLM_API_KEY || ""; // openai-compat only
export const LLM_BASE_URL = (process.env.LLM_BASE_URL || "").replace(/\/$/, ""); // openai-compat base
export const llmEnabled = (): boolean => LLM_PROVIDER !== "off";

/**
 * Discovery search provider for autonomous claim discovery. Local-first: prefer a
 * self-hosted SearXNG. When unset, discovery only ingests admin-supplied rows.
 */
export const SEARCH_PROVIDER = (process.env.SEARCH_PROVIDER || "").toLowerCase(); // searxng | serpapi | none
export const SEARXNG_URL = (process.env.SEARXNG_URL || "").replace(/\/$/, "");
export const SEARCH_API_KEY = process.env.SEARCH_API_KEY || "";
export const searchEnabled = (): boolean =>
  SEARCH_PROVIDER === "searxng" ? !!SEARXNG_URL : SEARCH_PROVIDER === "serpapi" ? !!SEARCH_API_KEY : false;

/**
 * Pricing V2 (transaction-marketplace model) master flag. When true:
 *   - all accounts are free (no tiers, no monthly subscription)
 *   - flat 5% platform fee ADDED ON TOP of the vendor price at checkout
 *   - venue revenue share = 20% of the platform fee
 *   - additional team seats are $10/mo
 *   - Featured Vendor advertising upgrade is $49/mo
 * Build everything behind this flag so the live site is untouched until flip.
 */
export const PRICING_V2 = process.env.PRICING_V2 === "true";

/** Flat platform fee rate under Pricing V2 (added on top of the vendor price). */
export const PLATFORM_FEE_RATE_V2 = Number(process.env.PLATFORM_FEE_RATE_V2 || 0.05);

/** Venue revenue share as a fraction of the platform fee under Pricing V2. */
export const VENUE_SHARE_OF_FEE_V2 = Number(process.env.VENUE_SHARE_OF_FEE_V2 || 0.2);

/** Featured Vendor advertising upgrade price per month (USD), Pricing V2. */
export const FEATURED_VENDOR_PRICE_USD = Number(process.env.FEATURED_VENDOR_PRICE_USD || 49);

/**
 * Seat billing: price per additional team seat per month (USD). $10 under
 * Pricing V2, legacy $5 otherwise. Explicit SEAT_PRICE_USD env always wins.
 */
export const SEAT_PRICE_USD = Number(
  process.env.SEAT_PRICE_USD || (process.env.PRICING_V2 === "true" ? 10 : 5),
);
