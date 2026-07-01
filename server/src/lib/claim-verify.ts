/**
 * Ownership verification + conversion (automation addendum: Claim Flow).
 *
 * Verification methods:
 *   - email_domain : the claimant's business email domain matches the listed
 *                    website domain (auto-verifiable)
 *   - email_code   : a code is sent to the public business email on file and the
 *                    claimant enters it back
 *   - manual       : an admin approves the claim
 *
 * On success the profile is converted to a Free Partner organization via
 * db.registerOrganization and linked back to the unclaimed profile.
 *
 * ZERO em dashes in this file (hard rule).
 */
import crypto from "node:crypto";
import * as claim from "../db/claim.js";
import { hostFromUrl } from "./discovery.js";
import * as db from "../db.js";

export const CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const AGREEMENT_VERSION = "claim-v1";

/** The exact claim agreement text the claimant must accept. */
export const AGREEMENT_TEXT =
  "I confirm that I am the owner or an authorized representative of this business, that the information I provide is accurate, and that I have the authority to claim and manage this profile on Divini Partners by Divini Group. I understand that the existing listing was generated from publicly available information and that claiming it converts it into a verified Free Partner account I control.";

export type VerificationMethod = "email_domain" | "email_code" | "manual";

export type StartResult = {
  verificationId: string;
  method: VerificationMethod;
  autoVerified: boolean;
  codeIssued: boolean;
  maskedEmail?: string | null;
};

function genCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function maskEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function emailDomain(email: string): string {
  return (email.split("@")[1] || "").toLowerCase();
}

/**
 * Begin a claim. Validates the agreement, picks a verification method, and
 * either auto-verifies (domain match) or issues a code to the public email.
 * Does NOT itself create the organization (confirm() does that).
 */
export async function startClaim(args: {
  slug: string;
  fullName: string;
  claimantRole: string;
  businessEmail: string;
  agreementAccepted: boolean;
  userId?: string | null;
}): Promise<StartResult | { error: string; status: number }> {
  if (!args.agreementAccepted) return { error: "you must accept the agreement", status: 400 };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.businessEmail))
    return { error: "a valid business email is required", status: 400 };

  const profile = await claim.getUnclaimedProfileBySlug(args.slug);
  if (!profile) return { error: "profile not found", status: 404 };
  if (profile.claim_status !== "unclaimed")
    return { error: `profile is already ${profile.claim_status}`, status: 409 };

  const business = profile.discovered_business_id
    ? await claim.getDiscoveredBusiness(profile.discovered_business_id)
    : null;

  const claimantDomain = emailDomain(args.businessEmail);
  const siteDomain = hostFromUrl(business?.website_url ?? null);
  const publicEmail = business?.public_email ?? null;

  // Method 1: domain match against the listed website -> auto verify.
  if (siteDomain && claimantDomain && (claimantDomain === siteDomain || siteDomain.endsWith(`.${claimantDomain}`))) {
    const v = await claim.createVerification({
      profileId: profile.id,
      userId: args.userId ?? null,
      method: "email_domain",
      verifiedEmail: args.businessEmail,
      verifiedDomain: claimantDomain,
      fullName: args.fullName,
      claimantRole: args.claimantRole,
      agreementVersion: AGREEMENT_VERSION,
    });
    await claim.setVerificationStatus(v.id, "verified", { userId: args.userId ?? null });
    await claim.setProfileClaimStatus(profile.id, "claim_pending");
    return {
      verificationId: v.id,
      method: "email_domain",
      autoVerified: true,
      codeIssued: false,
      maskedEmail: maskEmail(args.businessEmail),
    };
  }

  // Method 2: code to the public business email on file.
  if (publicEmail) {
    const code = genCode();
    const v = await claim.createVerification({
      profileId: profile.id,
      userId: args.userId ?? null,
      method: "email_code",
      verifiedEmail: publicEmail,
      verifiedDomain: emailDomain(publicEmail),
      code,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      fullName: args.fullName,
      claimantRole: args.claimantRole,
      agreementVersion: AGREEMENT_VERSION,
    });
    await claim.setProfileClaimStatus(profile.id, "claim_pending");
    // STUB: a real build emails `code` to publicEmail via the email infra.
    // eslint-disable-next-line no-console
    console.log(`[claim-verify STUB] code for ${profile.profile_slug} -> ${maskEmail(publicEmail)}: ${code}`);
    return {
      verificationId: v.id,
      method: "email_code",
      autoVerified: false,
      codeIssued: true,
      maskedEmail: maskEmail(publicEmail),
    };
  }

  // Method 3: no automatic path. Queue for manual admin approval.
  const v = await claim.createVerification({
    profileId: profile.id,
    userId: args.userId ?? null,
    method: "manual",
    verifiedEmail: args.businessEmail,
    verifiedDomain: claimantDomain,
    fullName: args.fullName,
    claimantRole: args.claimantRole,
    agreementVersion: AGREEMENT_VERSION,
  });
  await claim.setProfileClaimStatus(profile.id, "claim_pending");
  return {
    verificationId: v.id,
    method: "manual",
    autoVerified: false,
    codeIssued: false,
    maskedEmail: maskEmail(args.businessEmail),
  };
}

export type ConfirmResult =
  | { ok: true; organizationId: string; slug: string }
  | { ok: false; error: string; status: number; pending?: boolean };

/**
 * Confirm a claim. For email_code, checks the submitted code. For an
 * already-verified domain claim, proceeds straight to conversion. On success,
 * converts the profile to a Free Partner organization and links it.
 *
 * Conversion requires a signed-in user (sub + email) so the new organization is
 * owned by a real account; manual-method claims are converted by an admin via
 * the admin approve route instead.
 */
export async function confirmClaim(args: {
  slug: string;
  code?: string | null;
  sub?: string | null;
  email?: string | null;
}): Promise<ConfirmResult> {
  const profile = await claim.getUnclaimedProfileBySlug(args.slug);
  if (!profile) return { ok: false, error: "profile not found", status: 404 };
  if (profile.claim_status === "claimed")
    return { ok: false, error: "profile already claimed", status: 409 };

  const v = await claim.getLatestVerification(profile.id);
  if (!v) return { ok: false, error: "start the claim first", status: 400 };

  if (v.verification_method === "email_code") {
    if (!args.code) return { ok: false, error: "verification code required", status: 400 };
    if (v.code_expires_at && new Date(v.code_expires_at).getTime() < Date.now())
      return { ok: false, error: "verification code expired", status: 400 };
    if ((v.verification_code ?? "") !== String(args.code).trim())
      return { ok: false, error: "incorrect verification code", status: 400 };
    await claim.setVerificationStatus(v.id, "verified", { userId: args.sub ? undefined : null });
  } else if (v.verification_method === "manual" && v.verification_status !== "verified") {
    return {
      ok: false,
      error: "this claim is pending manual review by our team",
      status: 202,
      pending: true,
    };
  }

  // Conversion needs an authenticated owner account.
  if (!args.sub) {
    return {
      ok: false,
      error: "sign in to finish claiming and create your free partner account",
      status: 401,
    };
  }

  return convertToPartner(profile, v, args.sub, args.email ?? v.verified_email ?? null);
}

/**
 * Shared conversion: create the Free Partner org and link the profile. Used by
 * confirmClaim() (self-serve) and the admin manual-approval route.
 */
export async function convertToPartner(
  profile: claim.UnclaimedProfile,
  v: claim.ClaimVerification,
  sub: string,
  email: string | null,
): Promise<ConfirmResult> {
  const business = profile.discovered_business_id
    ? await claim.getDiscoveredBusiness(profile.discovered_business_id)
    : null;
  const role = mapCategoryToRole(business?.category ?? null);
  const orgName = business?.business_name ?? "Claimed Partner";

  const org = await db.registerOrganization(sub, email, {
    role,
    orgName,
    tier: "free_partner",
    name: v.full_name ?? undefined,
    agreementVersion: v.agreement_version ?? "v1",
  });

  await claim.linkClaimedOrganization(profile.id, org.id);
  await claim.setProfileClaimStatus(profile.id, "claimed");
  await claim.stopOutreachForProfile(profile.id, "claimed");

  return { ok: true, organizationId: org.id, slug: profile.profile_slug ?? "" };
}

/** Map a discovered category to a platform role for the new organization. */
export function mapCategoryToRole(category: string | null): db.Role {
  const c = (category ?? "").toLowerCase();
  if (c.includes("venue") || c.includes("hall") || c.includes("hotel") || c.includes("ballroom"))
    return "venue";
  if (c.includes("planner") || c.includes("coordinator")) return "planner";
  if (c.includes("rental") || c.includes("supply") || c.includes("supplier")) return "supplier";
  if (c.includes("install") || c.includes("production") || c.includes("av")) return "installer";
  return "vendor";
}

/** Admin manual approval -> verify then convert (claim owned by the admin actor). */
export async function adminApproveClaim(args: {
  slug: string;
  adminUserId: string;
  ownerSub: string;
  ownerEmail: string | null;
}): Promise<ConfirmResult> {
  const profile = await claim.getUnclaimedProfileBySlug(args.slug);
  if (!profile) return { ok: false, error: "profile not found", status: 404 };
  const v = await claim.getLatestVerification(profile.id);
  if (!v) return { ok: false, error: "no verification on file", status: 400 };
  await claim.setVerificationStatus(v.id, "verified", { adminApprovedBy: args.adminUserId });
  return convertToPartner(profile, v, args.ownerSub, args.ownerEmail);
}
