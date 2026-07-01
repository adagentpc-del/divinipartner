/**
 * Phase 7 - Starred / preferred vendors + repeat-relationship detection
 * (blueprint 27.4).
 *
 * An org stars another org (usually a vendor) so the recommendation engine and
 * dashboards can surface preferred partners. detectRepeatRelationships scans an
 * org's event history for counterparties it has worked with repeatedly but has
 * not yet starred, and returns gentle prompts ("You have booked this vendor 3
 * times. Star them?").
 *
 * Backed by the starred_vendors + event_history tables (db/schema-phase7.sql).
 */
import { q, q1 } from "../pool.js";

export type StarredRow = {
  id: string;
  organization_id: string;
  vendor_org_id: string;
  vendor_id: string | null;
  label: string | null;
  note: string | null;
  starred_by: string | null;
  created_at: string;
  vendor_name?: string | null;
};

const COLS = `
  id, organization_id, vendor_org_id, vendor_id, label, note, starred_by, created_at
`;

/** List the orgs this org has starred (with the starred org's name). */
export async function listStarred(orgId: string): Promise<StarredRow[]> {
  return q<StarredRow>(
    `select s.id, s.organization_id, s.vendor_org_id, s.vendor_id, s.label,
            s.note, s.starred_by, s.created_at, o.name as vendor_name
       from starred_vendors s
       left join organizations o on o.id = s.vendor_org_id
      where s.organization_id = $1
      order by s.created_at desc`,
    [orgId],
  );
}

/** True when this org has already starred the given org. */
export async function isStarred(orgId: string, vendorOrgId: string): Promise<boolean> {
  const row = await q1<{ ok: boolean }>(
    `select true as ok from starred_vendors
      where organization_id = $1 and vendor_org_id = $2 limit 1`,
    [orgId, vendorOrgId],
  );
  return !!row?.ok;
}

/** Star an org (idempotent per organization_id + vendor_org_id). */
export async function starVendor(
  orgId: string,
  userId: string | null,
  input: { vendor_org_id: string; vendor_id?: string | null; label?: string | null; note?: string | null },
): Promise<StarredRow> {
  const row = await q1<StarredRow>(
    `insert into starred_vendors (organization_id, vendor_org_id, vendor_id, label, note, starred_by)
       values ($1,$2,$3,$4,$5,$6)
     on conflict (organization_id, vendor_org_id) do update set
        vendor_id = coalesce(excluded.vendor_id, starred_vendors.vendor_id),
        label = coalesce(excluded.label, starred_vendors.label),
        note = coalesce(excluded.note, starred_vendors.note)
     returning ${COLS}`,
    [orgId, input.vendor_org_id, input.vendor_id ?? null, input.label ?? null, input.note ?? null, userId],
  );
  return row as StarredRow;
}

/** Unstar an org. */
export async function unstarVendor(orgId: string, vendorOrgId: string): Promise<boolean> {
  const rows = await q(
    `delete from starred_vendors where organization_id = $1 and vendor_org_id = $2 returning id`,
    [orgId, vendorOrgId],
  );
  return rows.length > 0;
}

export type RepeatPrompt = {
  vendor_org_id: string;
  vendor_name: string | null;
  times: number;
  already_starred: boolean;
  prompt: string;
  cta: string;
};

/**
 * Repeat-relationship detection (blueprint 27.4). Counts how many times the org
 * has worked each counterparty (from event_history.vendor_org_ids) and emits a
 * prompt for any counterparty booked >= `threshold` times that is not yet
 * starred.
 */
export async function detectRepeatRelationships(
  orgId: string,
  threshold = 2,
): Promise<RepeatPrompt[]> {
  // Unnest vendor_org_ids across this org's events, count occurrences.
  const rows = await q<{ vendor_org_id: string; times: string; vendor_name: string | null }>(
    `select v as vendor_org_id, count(*)::int as times, max(o.name) as vendor_name
       from event_history eh
       cross join lateral unnest(coalesce(eh.vendor_org_ids, '{}')) as v
       left join organizations o on o.id = v
      where eh.organization_id = $1
        and v is not null
        and v <> $1
      group by v
      having count(*) >= $2
      order by count(*) desc`,
    [orgId, threshold],
  );

  const starred = await q<{ vendor_org_id: string }>(
    `select vendor_org_id from starred_vendors where organization_id = $1`,
    [orgId],
  );
  const starredSet = new Set(starred.map((s) => s.vendor_org_id));

  return rows
    .filter((r) => !starredSet.has(r.vendor_org_id))
    .map((r) => {
      const times = Number(r.times);
      const name = r.vendor_name ?? "this partner";
      return {
        vendor_org_id: r.vendor_org_id,
        vendor_name: r.vendor_name,
        times,
        already_starred: false,
        prompt: `You have booked ${name} ${times} times. Star them?`,
        cta: "Star partner",
      };
    });
}
