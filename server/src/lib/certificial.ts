/**
 * Certificial carrier-verified COI (Certificate of Insurance) integration
 * interface (moat roadmap P0, 2026-08-14).
 *
 * Closes the gap between vendor_compliance's SELF-ATTESTED insurance_status/
 * coi_status (the vendor sets their own "verified" with nothing checking it)
 * and what a corporate/enterprise buyer's procurement team actually needs:
 * coverage confirmed against the insurance carrier's own system of record.
 *
 * This module is deliberately a STUB, not a working integration: this
 * deployment has no Certificial account or API credentials, and the exact
 * request/response contract has not been confirmed against Certificial's real
 * API documentation. Wiring it up for real is future work once an account
 * exists. Until then:
 *
 *   - certificialEnabled() is false whenever CERTIFICIAL_API_KEY is unset
 *     (every environment today), so nothing here is ever called live.
 *   - Even with a key configured, verifyCoi() returns status:"unavailable"
 *     with an honest error_message rather than guessing at a request shape
 *     and silently returning a made-up "verified" -- that would be exactly
 *     the fabricated-status problem this feature exists to solve.
 *
 * Zero em dashes.
 */
import { CERTIFICIAL_API_KEY } from "../config.js";

export type CoiVerificationStatus = "verified" | "expired" | "failed" | "unavailable";

export interface CoiVerificationInput {
  /** The vendor's legal/insured business name, as it would appear on a COI. */
  vendorLegalName: string;
  /** An on-file policy number, if the vendor has previously supplied one. */
  policyNumber?: string | null;
}

export interface CoiVerificationResult {
  status: CoiVerificationStatus;
  carrier_name?: string | null;
  policy_number?: string | null;
  coverage_type?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  raw_response?: unknown;
  error_message?: string | null;
}

export function certificialEnabled(): boolean {
  return !!CERTIFICIAL_API_KEY;
}

/**
 * Request a real-time verification from Certificial. Always returns a
 * result (never throws) so a caller can persist an honest row either way.
 */
export async function verifyCoi(input: CoiVerificationInput): Promise<CoiVerificationResult> {
  if (!certificialEnabled()) {
    return {
      status: "unavailable",
      error_message:
        "Carrier verification is not configured on this deployment (CERTIFICIAL_API_KEY unset). " +
        "The insurance/COI status shown elsewhere is the vendor's own self-reported status, not a carrier-verified one.",
    };
  }

  // TODO(engineering): wire the real Certificial API call once an account
  // and API documentation are available. A key being present does not mean
  // this integration works yet -- returning "verified" here without an
  // actual carrier response would recreate the exact self-attestation
  // problem this module exists to close, just one layer deeper.
  void input;
  return {
    status: "unavailable",
    error_message:
      "Carrier verification is configured (CERTIFICIAL_API_KEY is set) but the Certificial API call is " +
      "not yet implemented for this deployment. Complete the integration in lib/certificial.ts before " +
      "relying on this signal.",
  };
}
