/**
 * WS-2 - Preferred Partners data layer.
 *
 * A general org-scoped saved-counterparty store: any org can curate the vendors,
 * sponsors, venues, planners, etc. it wants to work with again. This lives next
 * to (not on top of) the venue-only `preferred_vendors` and the vendor-only
 * `starred_vendors`.
 *
 * Every read/write is IDOR-scoped to the caller's own org (owner_org_id). The
 * suggestions endpoint is deterministic: it surfaces the real partner orgs the
 * caller has worked with, drawn from event_vendors (vendors) and sponsor_purchases
 * (sponsors), ranked by frequency then recency, minus anyone already saved.
 *
 * No AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";

export type PartnerKind =
  | "vendor"
  | "sponsor"
  | "nonprofit"
  | "venue"
  | "planner"
  | "supplier"
  | "installer"
  | "client";

export type PartnerTier = "preferred" | "approved" | "exclusive" | "recommended" | "vip";

const PARTNER_KINDS = new Set<PartnerKind>([
  "vendor",
  "sponsor",
  "nonprofit",
  "venue",
  "planner",
  "supplier",
  "installer",
  "client",
]);
const PARTNER_TIERS = new Set<PartnerTier>([
  "preferred",
  "approved",
  "exclusive",
  "recommended",
  "vip",
]);

export function isPartnerKind(v: unknown): v is PartnerKind {
  return typeof v === "string" && PARTNER_KINDS.has(v as PartnerKind);
}
function normTier(v: unknown): PartnerTier | null {
  return typeof v === "string" && PARTNER_TIERS.has(v as PartnerTier) ? (v as PartnerTier) : null;
}

export interface PreferredPartnerRow {
  id: string;
  owner_org_id: string | null;
  partner_org_id: string | null;
  partner_kind: PartnerKind;
  tier: PartnerTier | null;
  label: string | null;
  note: string | null;
  last_event_id: string | null;
  last_worked_at: string | null;
  times_worked: number | null;
  saved_by: string | null;
  created_at: string;
  updated_at: string;
  /** joined for display */
  partner_name?: string | null;
}

/** Require the caller to belong to an org (owner scope). */
function ownerOrgId(actor: Actor): string {
  const id = actor.org?.id ?? null;
  if (!id) throw new ForbiddenError("join or create an organization to save preferred partners");
  return id;
}

const COLS = `pp.id, pp.owner_org_id, pp.partner_org_id, pp.partner_kind, pp.tier,
  pp.label, pp.note, pp.last_event_id, pp.last_worked_at, pp.times_worked,
  pp.saved_by, pp.created_at, pp.updated_at, o.name as partner_name`;

/** List the caller org's saved partners, optionally filtered by kind. */
export async function listPreferred(actor: Actor, kind?: string | null): Promise<PreferredPartnerRow[]> {
  const owner = ownerOrgId(actor);
  const params: unknown[] = [owner];
  let where = `pp.owner_org_id = $1`;
  if (isPartnerKind(kind)) {
    params.push(kind);
    where += ` and pp.partner_kind = $${params.length}`;
  }
  return q<PreferredPartnerRow>(
    `select ${COLS}
       from preferred_partners pp
       left join organizations o on o.id = pp.partner_org_id
      where ${where}
      order by pp.times_worked desc nulls last, pp.last_worked_at desc nulls last, pp.created_at desc
      limit 500`,
    params,
  );
}

export interface SavePreferredInput {
  partner_org_id: string;
  partner_kind: string;
  tier?: string | null;
  label?: string | null;
  note?: string | null;
  last_event_id?: string | null;
  last_worked_at?: string | null;
  times_worked?: number | null;
}

/** Save (upsert) a preferred partner for the caller's org. */
export async function savePreferred(actor: Actor, input: SavePreferredInput): Promise<PreferredPartnerRow> {
  const owner = ownerOrgId(actor);
  if (!input.partner_org_id || typeof input.partner_org_id !== "string") {
    throw new ForbiddenError("partner_org_id required");
  }
  if (!isPartnerKind(input.partner_kind)) {
    throw new ForbiddenError("invalid partner_kind");
  }
  if (input.partner_org_id === owner) {
    throw new ForbiddenError("cannot save your own organization");
  }
  const row = await q1<{ id: string }>(
    `insert into preferred_partners
       (owner_org_id, partner_org_id, partner_kind, tier, label, note,
        last_event_id, last_worked_at, times_worked, saved_by, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (owner_org_id, partner_org_id, partner_kind) do update set
        tier = coalesce(excluded.tier, preferred_partners.tier),
        label = coalesce(excluded.label, preferred_partners.label),
        note = coalesce(excluded.note, preferred_partners.note),
        last_event_id = coalesce(excluded.last_event_id, preferred_partners.last_event_id),
        last_worked_at = coalesce(excluded.last_worked_at, preferred_partners.last_worked_at),
        times_worked = greatest(coalesce(excluded.times_worked, 0), coalesce(preferred_partners.times_worked, 0)),
        updated_at = now()
     returning id`,
    [
      owner,
      input.partner_org_id,
      input.partner_kind,
      normTier(input.tier),
      input.label ?? null,
      input.note ?? null,
      input.last_event_id ?? null,
      input.last_worked_at ?? null,
      input.times_worked ?? 0,
      actor.user.id,
    ],
  );
  const full = await q1<PreferredPartnerRow>(
    `select ${COLS} from preferred_partners pp
       left join organizations o on o.id = pp.partner_org_id
      where pp.id = $1`,
    [row?.id],
  );
  return full as PreferredPartnerRow;
}

/** Patch a saved partner (owner only). */
export async function updatePreferred(
  actor: Actor,
  id: string,
  patch: { tier?: string | null; label?: string | null; note?: string | null },
): Promise<PreferredPartnerRow> {
  const owner = ownerOrgId(actor);
  const updated = await q1<{ id: string }>(
    `update preferred_partners set
        tier = coalesce($3, tier),
        label = coalesce($4, label),
        note = coalesce($5, note),
        updated_at = now()
      where id = $1 and owner_org_id = $2
      returning id`,
    [id, owner, patch.tier != null ? normTier(patch.tier) : null, patch.label ?? null, patch.note ?? null],
  );
  if (!updated) throw new NotFoundError("preferred partner not found");
  const full = await q1<PreferredPartnerRow>(
    `select ${COLS} from preferred_partners pp
       left join organizations o on o.id = pp.partner_org_id
      where pp.id = $1`,
    [id],
  );
  return full as PreferredPartnerRow;
}

/** Remove a saved partner (owner only). */
export async function removePreferred(actor: Actor, id: string): Promise<boolean> {
  const owner = ownerOrgId(actor);
  const rows = await q(
    `delete from preferred_partners where id = $1 and owner_org_id = $2 returning id`,
    [id, owner],
  );
  return rows.length > 0;
}

export interface PartnerSuggestion {
  partner_org_id: string;
  partner_name: string | null;
  partner_kind: PartnerKind;
  times_worked: number;
  last_worked_at: string | null;
  last_event_id: string | null;
}

/**
 * Deterministic suggestions: real partner orgs the caller has worked with that
 * are not already saved. Vendors come from event_vendors on the caller's events;
 * sponsors come from sponsor_purchases on the caller's fundraising events. Ranked
 * by frequency then recency.
 */
export async function suggestPreferred(actor: Actor, kind: string): Promise<PartnerSuggestion[]> {
  const owner = ownerOrgId(actor);
  if (kind === "vendor") {
    return q<PartnerSuggestion>(
      `select ev.organization_id as partner_org_id,
              o.name as partner_name,
              'vendor'::text as partner_kind,
              count(distinct ev.event_id)::int as times_worked,
              max(coalesce(e.date_time, ev.created_at)) as last_worked_at,
              (array_agg(ev.event_id order by coalesce(e.date_time, ev.created_at) desc))[1] as last_event_id
         from event_vendors ev
         join events e on e.id = ev.event_id
         left join organizations o on o.id = ev.organization_id
        where e.organization_id = $1
          and ev.organization_id is not null
          and ev.organization_id <> $1
          and not exists (
            select 1 from preferred_partners pp
             where pp.owner_org_id = $1 and pp.partner_org_id = ev.organization_id
               and pp.partner_kind = 'vendor')
        group by ev.organization_id, o.name
        order by times_worked desc, last_worked_at desc nulls last
        limit 12`,
      [owner],
    );
  }
  if (kind === "sponsor") {
    return q<PartnerSuggestion>(
      `select spur.sponsor_org_id as partner_org_id,
              o.name as partner_name,
              'sponsor'::text as partner_kind,
              count(*)::int as times_worked,
              max(spur.created_at) as last_worked_at,
              (array_agg(fe.event_id order by spur.created_at desc))[1] as last_event_id
         from sponsor_purchases spur
         join fundraising_events fe on fe.id = spur.fundraising_event_id
         left join organizations o on o.id = spur.sponsor_org_id
        where fe.organization_id = $1
          and spur.sponsor_org_id is not null
          and spur.sponsor_org_id <> $1
          and not exists (
            select 1 from preferred_partners pp
             where pp.owner_org_id = $1 and pp.partner_org_id = spur.sponsor_org_id
               and pp.partner_kind = 'sponsor')
        group by spur.sponsor_org_id, o.name
        order by times_worked desc, last_worked_at desc nulls last
        limit 12`,
      [owner],
    );
  }
  // Other kinds: no deterministic history source yet; manual save still works.
  return [];
}
