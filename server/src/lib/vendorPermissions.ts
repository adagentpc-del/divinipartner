/**
 * Vendor TEAM sub-roles + permission matrix (Phase 1 foundation).
 *
 * These sub-roles are ORTHOGONAL to the platform `Role` in db.ts. A platform
 * Role (e.g. "vendor") identifies the kind of organization; a VendorTeamRole
 * identifies what an individual team MEMBER inside a vendor org may do. There is
 * NO DB table for this in Phase 1; it is a deterministic, code-side matrix.
 *
 * `vendorCan(role, permission)` is a plain object lookup (no eval) so it is safe
 * and predictable. Unknown roles or permissions return false.
 */

export type VendorTeamRole =
  | "admin"
  | "sales_manager"
  | "account_exec"
  | "project_manager"
  | "production"
  | "install"
  | "accounting"
  | "exec_viewer";

export const VENDOR_TEAM_ROLES: VendorTeamRole[] = [
  "admin",
  "sales_manager",
  "account_exec",
  "project_manager",
  "production",
  "install",
  "accounting",
  "exec_viewer",
];

/** Permission keys understood by the vendor team matrix. */
export type VendorPermission =
  | "manage_team"
  | "assign_accounts"
  | "view_intake"
  | "approve_sales"
  | "approve_pm"
  | "edit_quote"
  | "view_financials"
  | "manage_production"
  | "manage_install";

export const VENDOR_PERMISSIONS: VendorPermission[] = [
  "manage_team",
  "assign_accounts",
  "view_intake",
  "approve_sales",
  "approve_pm",
  "edit_quote",
  "view_financials",
  "manage_production",
  "manage_install",
];

/**
 * The permission matrix. Each role maps to the set of permissions it holds.
 * admin holds every permission; exec_viewer is read-only (no grants here) and is
 * expected to use view-only surfaces. Workstream agents read this matrix; they
 * should add NEW grants here rather than branching on role names elsewhere.
 */
const MATRIX: Record<VendorTeamRole, ReadonlyArray<VendorPermission>> = {
  admin: [...VENDOR_PERMISSIONS],
  sales_manager: ["approve_sales", "edit_quote", "view_intake", "assign_accounts"],
  account_exec: ["view_intake", "edit_quote"],
  project_manager: ["approve_pm", "manage_production", "view_intake"],
  production: ["manage_production"],
  install: ["manage_install"],
  accounting: ["view_financials"],
  exec_viewer: [],
};

/**
 * Deterministic permission check. Returns true only when the role exists in the
 * matrix and explicitly holds the permission. No eval, no fallthrough.
 */
export function vendorCan(role: VendorTeamRole, permission: string): boolean {
  const grants = MATRIX[role];
  if (!grants) return false;
  return grants.includes(permission as VendorPermission);
}
