/**
 * Vendor Team permission resolution (Phase 1, Workstream A).
 *
 * Bridges the ACTING user (an Actor) to their vendor sub-role and the
 * deterministic permission matrix in vendorPermissions.ts. Routes call
 * `requireVendorPermission(actor, permission)` to gate a mutation: it resolves
 * the actor's team-member row, reads its vendor_role, and checks vendorCan().
 * Platform admins / super_admins bypass the matrix (they manage everything).
 *
 * No eval, no DB writes here; this is a thin, deterministic gate over the repo.
 *
 * Zero em dashes.
 */
import { ForbiddenError, type Actor } from "../db.js";
import { vendorCan, type VendorTeamRole } from "./vendorPermissions.js";
import { actingMember } from "../db/vendor-team.js";

function isPlatformAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the acting user's VendorTeamRole, or null when they are not a member
 * of a vendor team. Platform admins return "admin" so they hold every grant.
 */
export async function resolveVendorRole(actor: Actor): Promise<VendorTeamRole | null> {
  if (isPlatformAdmin(actor)) return "admin";
  const member = await actingMember(actor);
  const role = member?.vendor_role ?? null;
  return (role as VendorTeamRole) || null;
}

/** True when the acting user holds `permission` via their vendor sub-role. */
export async function actorVendorCan(actor: Actor, permission: string): Promise<boolean> {
  if (isPlatformAdmin(actor)) return true;
  const role = await resolveVendorRole(actor);
  if (!role) return false;
  return vendorCan(role, permission);
}

/**
 * Gate a mutation on a vendor permission. Throws ForbiddenError when the acting
 * user's vendor sub-role does not hold it. Returns the resolved role so callers
 * can reuse it (e.g. to stamp an approver).
 */
export async function requireVendorPermission(
  actor: Actor,
  permission: string,
): Promise<VendorTeamRole> {
  if (isPlatformAdmin(actor)) return "admin";
  const role = await resolveVendorRole(actor);
  if (!role || !vendorCan(role, permission)) {
    throw new ForbiddenError(`vendor permission required: ${permission}`);
  }
  return role;
}
