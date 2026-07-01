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
  DOWNLOAD_URL_SECRET,
  stripeEnabled,
  paypalEnabled,
} from "../config.js";

const DEV_DOWNLOAD_SECRET = "dev-only-download-secret-change-me";

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

  if (DOWNLOAD_URL_SECRET === DEV_DOWNLOAD_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      "[startup-check] WARNING: DOWNLOAD_URL_SECRET is still the dev fallback in production. Set DOWNLOAD_URL_SECRET (or SESSION_SECRET) to a strong unique value.",
    );
  }

  if (errors.length > 0) {
    const message = "[startup-check] production secret check failed:\n  - " + errors.join("\n  - ");
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
}
