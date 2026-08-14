/**
 * Production secret assertions (L4).
 *
 * In production a misconfigured payment integration is a money-safety hazard:
 * a Stripe or PayPal webhook that cannot be verified must never be processed.
 * assertProductionSecrets() fails fast at boot when a required secret is missing
 * so the deploy is caught before it can pay anyone.
 *
 * Exported but NOT wired here on purpose: index.ts (owned by the parent) calls
 * this during startup.
 *
 * ZERO em dashes in this file (hard rule).
 */
import {
  IS_PROD,
  STRIPE_WEBHOOK_SECRET,
  PAYPAL_WEBHOOK_ID,
  stripeEnabled,
  paypalEnabled,
} from "../config.js";

/**
 * Assert that production has the secrets its enabled integrations require.
 * Throws when a hard requirement is unmet; warns on softer issues. No-op outside
 * production.
 */
export function assertProductionSecrets(): void {
  if (!IS_PROD) return;

  const errors: string[] = [];

  if (stripeEnabled() && !STRIPE_WEBHOOK_SECRET) {
    errors.push(
      "STRIPE_WEBHOOK_SECRET is empty but Stripe is enabled. Stripe webhooks cannot be verified; set it before processing payments.",
    );
  }
  if (paypalEnabled() && !PAYPAL_WEBHOOK_ID) {
    errors.push(
      "PAYPAL_WEBHOOK_ID is empty but PayPal is enabled. PayPal webhooks cannot be verified; set it before processing payments.",
    );
  }

  if (process.env.AV_SCAN_ENABLED !== "true") {
    // Non-fatal: AV scanning is optional infra (requires clamav-daemon
    // installed on the host, see lib/uploadGuard.ts). This is a visibility
    // warning so "no malware scanning" is a decision an operator has to
    // notice, not a silent default.
     
    console.warn(
      "[startup-check] WARNING: AV_SCAN_ENABLED is not 'true'. Uploaded files are NOT being " +
        "virus/malware scanned (extension, MIME, and magic-byte checks still apply). Install " +
        "clamav-daemon and set AV_SCAN_ENABLED=true to enable scanning. See lib/uploadGuard.ts.",
    );
  }

  if (errors.length > 0) {
    const message = "[startup-check] production secret check failed:\n  - " + errors.join("\n  - ");
     
    console.error(message);
    throw new Error(message);
  }
}
