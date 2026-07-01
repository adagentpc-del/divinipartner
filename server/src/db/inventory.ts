/**
 * Phase 4 - Rental Inventory data-access (blueprint 12).
 *
 * Org-scoped CRUD for rental inventory items with the full blueprint 12.2 field
 * set, plus availability-by-date tracking and the blueprint 12.3 search filters.
 *
 * Scoping: every item belongs to an organization (the vendor account). The
 * caller passes the actor's organization_id; rows are always constrained to
 * that org so a vendor never reads or writes another vendor's inventory.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError } from "../db.js";

export type InventoryItemInput = {
  name?: string;
  category?: string;
  photos?: unknown;
  description?: string;
  dimensions?: string;
  weight?: string;
  quantity?: number;
  price?: number;
  price_unit?: string;
  delivery_fee?: number;
  install_fee?: number;
  labor_required?: boolean;
  labor_hours?: number;
  damage_deposit?: number;
  replacement_value?: number;
  fees?: unknown;
  warehouse_location?: string;
  service_radius?: number;
  lead_time?: string;
  venue_restrictions?: string[];
  add_ons?: unknown;
  contract_pricing_eligible?: boolean;
  preferred_venue_pricing?: unknown;
  status?: string;
};

const ITEM_COLS = `
  id, vendor_id, organization_id, name, category, description, photos,
  dimensions, weight, quantity, price, price_unit, fees, delivery_fee,
  install_fee, labor_required, labor_hours, damage_deposit, replacement_value,
  availability, warehouse_location, service_radius, lead_time,
  venue_restrictions, add_ons, contract_pricing_eligible,
  preferred_venue_pricing, status, created_at, updated_at
`;

/** Resolve the vendor row for an org (or null). Inventory links to vendors. */
async function vendorIdForOrg(orgId: string): Promise<string | null> {
  const row = await q1<{ id: string }>(
    `select id from vendors where organization_id = $1 order by created_at asc limit 1`,
    [orgId],
  );
  return row?.id ?? null;
}

export type InventorySearchFilters = {
  search?: string;        // free text on name / description
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  priceUnit?: string;
  warehouseLocation?: string;
  maxLeadTime?: string;
  laborRequired?: boolean;
  contractEligible?: boolean;
  status?: string;
  availableFrom?: string; // ISO date - item must have on-hand availability
  minQuantity?: number;
};

/** List inventory for an org, with the blueprint 12.3 search filters applied. */
export async function listInventory(
  orgId: string,
  filters: InventorySearchFilters = {},
): Promise<any[]> {
  const where: string[] = ["organization_id = $1"];
  const params: any[] = [orgId];
  /** Bind a value, returning its $N placeholder. */
  const bind = (value: any): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.search) {
    const p = bind(filters.search);
    // Same bound value in both halves of the OR (no duplicate param needed).
    where.push(`(name ilike '%' || ${p} || '%' or description ilike '%' || ${p} || '%')`);
  }
  if (filters.category) where.push(`category = ${bind(filters.category)}`);
  if (filters.priceUnit) where.push(`price_unit = ${bind(filters.priceUnit)}`);
  if (filters.warehouseLocation) where.push(`warehouse_location ilike '%' || ${bind(filters.warehouseLocation)} || '%'`);
  if (typeof filters.minPrice === "number") where.push(`price >= ${bind(filters.minPrice)}`);
  if (typeof filters.maxPrice === "number") where.push(`price <= ${bind(filters.maxPrice)}`);
  if (typeof filters.laborRequired === "boolean") where.push(`labor_required = ${bind(filters.laborRequired)}`);
  if (typeof filters.contractEligible === "boolean") where.push(`contract_pricing_eligible = ${bind(filters.contractEligible)}`);
  if (filters.status) where.push(`status = ${bind(filters.status)}`);
  if (typeof filters.minQuantity === "number") where.push(`coalesce(quantity, 0) >= ${bind(filters.minQuantity)}`);

  const sql = `select ${ITEM_COLS} from inventory_items
                where ${where.join(" and ")}
                order by created_at desc`;
  return q(sql, params);
}

/** Get one inventory item scoped to the org. */
export async function getInventoryItem(orgId: string, id: string): Promise<any | null> {
  return q1(
    `select ${ITEM_COLS} from inventory_items where id = $1 and organization_id = $2`,
    [id, orgId],
  );
}

/** Create an inventory item under the actor's org + vendor. */
export async function createInventoryItem(
  orgId: string,
  input: InventoryItemInput,
): Promise<any> {
  const vendorId = await vendorIdForOrg(orgId);
  const row = await q1(
    `insert into inventory_items (
       vendor_id, organization_id, name, category, description, photos,
       dimensions, weight, quantity, price, price_unit, fees, delivery_fee,
       install_fee, labor_required, labor_hours, damage_deposit, replacement_value,
       warehouse_location, service_radius, lead_time, venue_restrictions, add_ons,
       contract_pricing_eligible, preferred_venue_pricing, status, updated_at)
     values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,coalesce($26,'active'), now())
     returning ${ITEM_COLS}`,
    [
      vendorId, orgId, input.name ?? null, input.category ?? null, input.description ?? null,
      input.photos ? JSON.stringify(input.photos) : null,
      input.dimensions ?? null, input.weight ?? null, input.quantity ?? null,
      input.price ?? null, input.price_unit ?? null,
      input.fees ? JSON.stringify(input.fees) : null,
      input.delivery_fee ?? null, input.install_fee ?? null,
      input.labor_required ?? false, input.labor_hours ?? null,
      input.damage_deposit ?? null, input.replacement_value ?? null,
      input.warehouse_location ?? null, input.service_radius ?? null, input.lead_time ?? null,
      input.venue_restrictions ?? null,
      input.add_ons ? JSON.stringify(input.add_ons) : null,
      input.contract_pricing_eligible ?? false,
      input.preferred_venue_pricing ? JSON.stringify(input.preferred_venue_pricing) : null,
      input.status ?? null,
    ],
  );
  return row;
}

const UPDATABLE: Record<string, "raw" | "json"> = {
  name: "raw", category: "raw", description: "raw", photos: "json",
  dimensions: "raw", weight: "raw", quantity: "raw", price: "raw",
  price_unit: "raw", fees: "json", delivery_fee: "raw", install_fee: "raw",
  labor_required: "raw", labor_hours: "raw", damage_deposit: "raw",
  replacement_value: "raw", warehouse_location: "raw", service_radius: "raw",
  lead_time: "raw", venue_restrictions: "raw", add_ons: "json",
  contract_pricing_eligible: "raw", preferred_venue_pricing: "json", status: "raw",
};

/** Patch an inventory item (only known columns). Org-scoped. */
export async function updateInventoryItem(
  orgId: string,
  id: string,
  input: InventoryItemInput,
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];
  for (const [key, mode] of Object.entries(UPDATABLE)) {
    if (!(key in input)) continue;
    const value = (input as Record<string, unknown>)[key];
    params.push(mode === "json" && value != null ? JSON.stringify(value) : value ?? null);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) {
    const current = await getInventoryItem(orgId, id);
    if (!current) throw new NotFoundError("inventory item not found");
    return current;
  }
  sets.push(`updated_at = now()`);
  params.push(id, orgId);
  const row = await q1(
    `update inventory_items set ${sets.join(", ")}
      where id = $${params.length - 1} and organization_id = $${params.length}
      returning ${ITEM_COLS}`,
    params,
  );
  if (!row) throw new NotFoundError("inventory item not found");
  return row;
}

/** Delete (org-scoped). Returns true if a row was removed. */
export async function deleteInventoryItem(orgId: string, id: string): Promise<boolean> {
  const rows = await q(
    `delete from inventory_items where id = $1 and organization_id = $2 returning id`,
    [id, orgId],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Availability by date
// ---------------------------------------------------------------------------

export type AvailabilityInput = {
  start_date: string;
  end_date?: string;
  quantity_available?: number;
  quantity_reserved?: number;
  quantity_pending?: number;
  buffer?: number;
  note?: string;
};

/** List availability windows for an item (org-scoped). */
export async function listAvailability(orgId: string, itemId: string): Promise<any[]> {
  return q(
    `select * from inventory_availability
      where inventory_item_id = $1 and organization_id = $2
      order by start_date asc`,
    [itemId, orgId],
  );
}

/** Add an availability window for an item. */
export async function addAvailability(
  orgId: string,
  itemId: string,
  input: AvailabilityInput,
): Promise<any> {
  const owns = await getInventoryItem(orgId, itemId);
  if (!owns) throw new NotFoundError("inventory item not found");
  return q1(
    `insert into inventory_availability (
       inventory_item_id, organization_id, start_date, end_date,
       quantity_available, quantity_reserved, quantity_pending, buffer, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning *`,
    [
      itemId, orgId, input.start_date, input.end_date ?? null,
      input.quantity_available ?? 0, input.quantity_reserved ?? 0,
      input.quantity_pending ?? 0, input.buffer ?? 0, input.note ?? null,
    ],
  );
}

/**
 * Net free quantity for an item on a given date (available minus reserved,
 * pending and buffer). Returns the item's base quantity if no window matches.
 */
export async function netAvailableOn(
  orgId: string,
  itemId: string,
  isoDate: string,
): Promise<number> {
  const row = await q1<{ net: string | null }>(
    `select max(
        greatest(coalesce(quantity_available,0)
          - coalesce(quantity_reserved,0)
          - coalesce(quantity_pending,0)
          - coalesce(buffer,0), 0)) as net
       from inventory_availability
      where inventory_item_id = $1 and organization_id = $2
        and start_date <= $3 and (end_date is null or end_date >= $3)`,
    [itemId, orgId, isoDate],
  );
  if (row?.net != null) return Number(row.net);
  const item = await getInventoryItem(orgId, itemId);
  return Number(item?.quantity ?? 0);
}
