/**
 * Supplier warehouses. Free/Plus are capped at 1 (server/src/lib/planCatalog.ts's
 * "warehouses" limit), Pro unlocks "Multi warehouse" -- enforced via
 * checkLimit() in routes/warehouses.ts, not here (this module is plain org-scoped
 * CRUD, matching db/packages.ts's shape).
 */
import { q, q1 } from "../pool.js";

export type WarehouseRow = {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  created_at: string;
  updated_at: string;
};

export async function listWarehouses(orgId: string): Promise<WarehouseRow[]> {
  return q<WarehouseRow>(
    `select * from warehouses where organization_id = $1 order by created_at asc`,
    [orgId],
  );
}

export async function countWarehouses(orgId: string): Promise<number> {
  const row = await q1<{ n: string }>(
    `select count(*)::int as n from warehouses where organization_id = $1`,
    [orgId],
  );
  return Number(row?.n ?? 0);
}

export async function getWarehouse(orgId: string, id: string): Promise<WarehouseRow | null> {
  return q1<WarehouseRow>(`select * from warehouses where id = $1 and organization_id = $2`, [id, orgId]);
}

export async function createWarehouse(
  orgId: string,
  input: { name: string; address?: string | null },
): Promise<WarehouseRow> {
  return (await q1<WarehouseRow>(
    `insert into warehouses (organization_id, name, address) values ($1, $2, $3) returning *`,
    [orgId, input.name, input.address ?? null],
  )) as WarehouseRow;
}

export async function updateWarehouse(
  orgId: string,
  id: string,
  patch: { name?: string; address?: string | null },
): Promise<WarehouseRow | null> {
  return q1<WarehouseRow>(
    `update warehouses set
       name = coalesce($3, name),
       address = coalesce($4, address),
       updated_at = now()
     where id = $1 and organization_id = $2
     returning *`,
    [id, orgId, patch.name ?? null, patch.address ?? null],
  );
}

/** Deletes the warehouse. Any inventory items pointing at it fall back to
 *  warehouse_id = null (ON DELETE SET NULL), never orphaned or blocked. */
export async function deleteWarehouse(orgId: string, id: string): Promise<boolean> {
  const row = await q1<{ id: string }>(
    `delete from warehouses where id = $1 and organization_id = $2 returning id`,
    [id, orgId],
  );
  return !!row;
}
