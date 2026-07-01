/**
 * Contract Pricing Partnerships data-access (blueprint section 22).
 *
 * Two partner organizations agree on preferential pricing: a discount %, a fixed
 * rate, and/or a volume tier, scoped to categories + venues, over a date range,
 * with an approval status. Premier-tier feature (gated at the route + UI layer).
 */
import { q, q1 } from "../pool.js";

export const PARTNER_TYPES = [
  "venue_vendor",
  "vendor_vendor",
  "planner_vendor",
  "venue_planner",
  "supplier_vendor",
  "preferred_network",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PRICING_TYPES = ["discount", "fixed_rate", "volume_tier"] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "declined", "expired"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ContractRow {
  id: string;
  name: string | null;
  partner_a_org: string | null;
  partner_b_org: string | null;
  partner_type: string | null;
  pricing_type: string | null;
  discount_pct: string | null;
  fixed_rate: string | null;
  volume_tier: string | null;
  volume_threshold: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_renewal: boolean | null;
  applicable_categories: string[] | null;
  applicable_venues: string[] | null;
  terms: string | null;
  status: string | null;
  approval_status: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateContractInput {
  name?: string | null;
  partner_b_org: string;
  partner_type: PartnerType;
  pricing_type: PricingType;
  discount_pct?: number | null;
  fixed_rate?: number | null;
  volume_tier?: string | null;
  volume_threshold?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  auto_renewal?: boolean;
  applicable_categories?: string[];
  applicable_venues?: string[];
  terms?: string | null;
}

export async function createContract(
  orgId: string,
  createdBy: string | null,
  input: CreateContractInput,
): Promise<ContractRow> {
  return (await q1<ContractRow>(
    `insert into contract_pricing
       (name, partner_a_org, partner_b_org, partner_type, pricing_type, discount_pct, fixed_rate,
        volume_tier, volume_threshold, start_date, end_date, auto_renewal, applicable_categories,
        applicable_venues, terms, status, approval_status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft','pending',$16)
     returning *`,
    [
      input.name ?? null,
      orgId,
      input.partner_b_org,
      input.partner_type,
      input.pricing_type,
      input.discount_pct ?? null,
      input.fixed_rate ?? null,
      input.volume_tier ?? null,
      input.volume_threshold ?? null,
      input.start_date ?? null,
      input.end_date ?? null,
      input.auto_renewal ?? false,
      input.applicable_categories ?? null,
      input.applicable_venues ?? null,
      input.terms ?? null,
      createdBy,
    ],
  )) as ContractRow;
}

/** Contracts where the org is on either side of the partnership. */
export async function listContracts(orgId: string, filters?: { approval_status?: string }): Promise<ContractRow[]> {
  const params: unknown[] = [orgId];
  let extra = "";
  if (filters?.approval_status) {
    params.push(filters.approval_status);
    extra = ` and approval_status = $${params.length}`;
  }
  return q<ContractRow>(
    `select * from contract_pricing
       where (partner_a_org = $1 or partner_b_org = $1)${extra}
       order by created_at desc`,
    params,
  );
}

export async function getContract(orgId: string, id: string): Promise<ContractRow | null> {
  return q1<ContractRow>(
    `select * from contract_pricing where id = $1 and (partner_a_org = $2 or partner_b_org = $2)`,
    [id, orgId],
  );
}

const ALLOWED_APPROVAL: ReadonlySet<ApprovalStatus> = new Set(APPROVAL_STATUSES);

export async function setApprovalStatus(
  orgId: string,
  id: string,
  status: ApprovalStatus,
  approvedBy: string | null,
): Promise<ContractRow | null> {
  if (!ALLOWED_APPROVAL.has(status)) throw new Error(`invalid approval status: ${status}`);
  return q1<ContractRow>(
    `update contract_pricing
        set approval_status = $3, approved_by = $4,
            status = case when $3 = 'approved' then 'active' else status end,
            updated_at = now()
      where id = $1 and (partner_a_org = $2 or partner_b_org = $2)
      returning *`,
    [id, orgId, status, approvedBy],
  );
}
