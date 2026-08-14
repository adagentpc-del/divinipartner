/**
 * Carrier-verified COI data access (moat roadmap P0, 2026-08-14).
 *
 * A verification request/result is its own row in vendor_coi_verifications --
 * a real audit trail of verification ATTEMPTS, distinct from vendor_compliance's
 * self-attested insurance_status/coi_status field (which the vendor sets on
 * themselves). Authorization mirrors db/vendor-compliance.ts exactly: an
 * actor's org must own the vendor, or the actor is an admin.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { verifyCoi, type CoiVerificationStatus } from "../lib/certificial.js";

export type VerificationRow = {
  id: string;
  vendor_id: string;
  provider: string;
  status: CoiVerificationStatus | "pending";
  carrier_name: string | null;
  policy_number: string | null;
  coverage_type: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  raw_response: unknown;
  requested_by: string | null;
  requested_at: string;
  verified_at: string | null;
  error_message: string | null;
};

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

async function vendorOrgAndName(vendorId: string): Promise<{ orgId: string | null; name: string | null }> {
  // vendors has no name column of its own -- the vendor's legal/display name
  // is the owning organization's name (vendors.organization_id -> organizations.name).
  const row = await q1<{ organization_id: string | null; name: string | null }>(
    `select v.organization_id, o.name
       from vendors v left join organizations o on o.id = v.organization_id
      where v.id = $1`,
    [vendorId],
  );
  if (!row) throw new NotFoundError("vendor not found");
  return { orgId: row.organization_id, name: row.name };
}

async function assertVendorAccess(actor: Actor, vendorId: string): Promise<{ orgId: string | null; name: string | null }> {
  const v = await vendorOrgAndName(vendorId);
  if (isAdmin(actor)) return v;
  if (!actor.org?.id || v.orgId !== actor.org.id) {
    throw new ForbiddenError("no access to this vendor");
  }
  return v;
}

/** Request a real-time carrier verification for a vendor, org-scoped. Always
 *  writes and returns a real row -- "unavailable" with an honest reason when
 *  the integration is unconfigured or not yet implemented, never a
 *  fabricated "verified". */
export async function requestCarrierVerification(
  actor: Actor,
  vendorId: string,
  input: { policyNumber?: string | null } = {},
): Promise<VerificationRow> {
  const vendor = await assertVendorAccess(actor, vendorId);
  const result = await verifyCoi({
    vendorLegalName: vendor.name ?? "",
    policyNumber: input.policyNumber ?? null,
  });
  const row = await q1<VerificationRow>(
    `insert into vendor_coi_verifications
       (vendor_id, provider, status, carrier_name, policy_number, coverage_type,
        effective_date, expiration_date, raw_response, requested_by, verified_at, error_message)
     values ($1,'certificial',$2,$3,$4,$5,$6,$7,$8::jsonb,$9,
             case when $2 = 'verified' then now() else null end, $10)
     returning *`,
    [
      vendorId,
      result.status,
      result.carrier_name ?? null,
      result.policy_number ?? input.policyNumber ?? null,
      result.coverage_type ?? null,
      result.effective_date ?? null,
      result.expiration_date ?? null,
      result.raw_response != null ? JSON.stringify(result.raw_response) : null,
      actor.user.id,
      result.error_message ?? null,
    ],
  );
  return row as VerificationRow;
}

/** Most recent verification attempt for a vendor, org-scoped. Null if never requested. */
export async function getLatestCarrierVerification(actor: Actor, vendorId: string): Promise<VerificationRow | null> {
  await assertVendorAccess(actor, vendorId);
  return q1<VerificationRow>(
    `select * from vendor_coi_verifications where vendor_id = $1 order by requested_at desc limit 1`,
    [vendorId],
  );
}

/** Full verification history for a vendor, org-scoped. */
export async function listCarrierVerifications(actor: Actor, vendorId: string): Promise<VerificationRow[]> {
  await assertVendorAccess(actor, vendorId);
  return q<VerificationRow>(
    `select * from vendor_coi_verifications where vendor_id = $1 order by requested_at desc limit 100`,
    [vendorId],
  );
}

/** Admin review queue: every verification request still pending a carrier
 *  response, across all vendors. Meaningful once a real async/webhook-driven
 *  provider is wired in (today's synchronous stub never leaves a row
 *  pending), so this is ready-built infrastructure for that integration. */
export async function listPendingCarrierVerifications(actor: Actor): Promise<VerificationRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("admins only");
  return q<VerificationRow>(
    `select * from vendor_coi_verifications where status = 'pending' order by requested_at asc limit 500`,
  );
}

/** Whether the vendor's LATEST carrier verification is a real, current
 *  "verified" result. Used by the 'coi_carrier_verified' compliance gate. */
export async function isCarrierVerified(vendorId: string): Promise<boolean> {
  const row = await q1<{ status: string; expiration_date: string | null }>(
    `select status, expiration_date from vendor_coi_verifications
      where vendor_id = $1 order by requested_at desc limit 1`,
    [vendorId],
  );
  if (!row || row.status !== "verified") return false;
  if (row.expiration_date && new Date(row.expiration_date).getTime() < Date.now()) return false;
  return true;
}
