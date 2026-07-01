/**
 * Phase 4 - Package / Bundle builder data-access (blueprint 17).
 *
 * Named bundles of inventory items + services with bundle pricing. Org-scoped:
 * a package belongs to the vendor account that created it.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError } from "../db.js";

export type PackageItem = {
  kind: "inventory" | "service";
  ref_id?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
};

export type PackageInput = {
  name?: string;
  description?: string;
  category?: string;
  items?: PackageItem[];
  bundle_price?: number;
  delivery_fee?: number;
  install_fee?: number;
  labor_hours?: number;
  serves?: number;
  add_ons?: unknown;
  status?: string;
};

const COLS = `
  id, organization_id, vendor_id, name, description, category, items,
  bundle_price, delivery_fee, install_fee, labor_hours, serves, add_ons,
  status, created_at, updated_at
`;

async function vendorIdForOrg(orgId: string): Promise<string | null> {
  const row = await q1<{ id: string }>(
    `select id from vendors where organization_id = $1 order by created_at asc limit 1`,
    [orgId],
  );
  return row?.id ?? null;
}

/** Sum of line items when an explicit bundle_price is not set. */
export function lineItemTotal(items: PackageItem[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, it) => sum + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
    0,
  );
}

/** List packages for an org. */
export async function listPackages(orgId: string, status?: string): Promise<any[]> {
  if (status) {
    return q(
      `select ${COLS} from packages where organization_id = $1 and status = $2 order by created_at desc`,
      [orgId, status],
    );
  }
  return q(
    `select ${COLS} from packages where organization_id = $1 order by created_at desc`,
    [orgId],
  );
}

/** Get one package (org-scoped). */
export async function getPackage(orgId: string, id: string): Promise<any | null> {
  return q1(`select ${COLS} from packages where id = $1 and organization_id = $2`, [id, orgId]);
}

/** Create a package. */
export async function createPackage(orgId: string, input: PackageInput): Promise<any> {
  const vendorId = await vendorIdForOrg(orgId);
  return q1(
    `insert into packages (
       organization_id, vendor_id, name, description, category, items,
       bundle_price, delivery_fee, install_fee, labor_hours, serves, add_ons,
       status, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13,'draft'), now())
     returning ${COLS}`,
    [
      orgId, vendorId, input.name ?? null, input.description ?? null, input.category ?? null,
      input.items ? JSON.stringify(input.items) : JSON.stringify([]),
      input.bundle_price ?? null, input.delivery_fee ?? null, input.install_fee ?? null,
      input.labor_hours ?? null, input.serves ?? null,
      input.add_ons ? JSON.stringify(input.add_ons) : null,
      input.status ?? null,
    ],
  );
}

const UPDATABLE: Record<string, "raw" | "json"> = {
  name: "raw", description: "raw", category: "raw", items: "json",
  bundle_price: "raw", delivery_fee: "raw", install_fee: "raw",
  labor_hours: "raw", serves: "raw", add_ons: "json", status: "raw",
};

/** Patch a package (org-scoped). */
export async function updatePackage(orgId: string, id: string, input: PackageInput): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];
  for (const [key, mode] of Object.entries(UPDATABLE)) {
    if (!(key in input)) continue;
    const value = (input as Record<string, unknown>)[key];
    params.push(mode === "json" && value != null ? JSON.stringify(value) : value ?? null);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) {
    const current = await getPackage(orgId, id);
    if (!current) throw new NotFoundError("package not found");
    return current;
  }
  sets.push(`updated_at = now()`);
  params.push(id, orgId);
  const row = await q1(
    `update packages set ${sets.join(", ")}
      where id = $${params.length - 1} and organization_id = $${params.length}
      returning ${COLS}`,
    params,
  );
  if (!row) throw new NotFoundError("package not found");
  return row;
}

/** Delete a package (org-scoped). */
export async function deletePackage(orgId: string, id: string): Promise<boolean> {
  const rows = await q(
    `delete from packages where id = $1 and organization_id = $2 returning id`,
    [id, orgId],
  );
  return rows.length > 0;
}
