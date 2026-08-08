/**
 * WS-3 - Relationship Campaigns data layer.
 *
 * An org sends one message to a saved-partner segment (WS-2 preferred_partners)
 * or a past event's roster, to drive repeat annual events and rebookings. Unlike
 * the admin cold-outreach campaigns, this is org-scoped (a partner sends to its
 * own relationships) and targets real accounts, not scraped prospects.
 *
 * Recipients resolve deterministically to partner-org contact emails, deduped by
 * lowercased email and filtered against claim_suppression. All reads/writes are
 * IDOR-scoped to the caller's own org. No AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { PUBLIC_APP_URL } from "../config.js";

export type CtaKind =
  | "clone_playbook"
  | "open_rfp"
  | "sponsorship_packages"
  | "create_event"
  | "custom";

export interface RelationshipCampaignRow {
  id: string;
  owner_org_id: string | null;
  name: string;
  audience: unknown;
  subject: string | null;
  body_html: string | null;
  cta_kind: CtaKind | null;
  cta_ref: string | null;
  cta_url: string | null;
  status: string;
  recipient_count: number | null;
  sent_count: number | null;
  test_sent_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipientRow {
  id: string;
  campaign_id: string;
  partner_org_id: string | null;
  email: string;
  name: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

type Audience = {
  kind?: "preferred" | "event_roster";
  partner_kind?: string | null;
  tiers?: string[] | null;
  event_id?: string | null;
};

const CTA_KINDS = new Set<CtaKind>([
  "clone_playbook",
  "open_rfp",
  "sponsorship_packages",
  "create_event",
  "custom",
]);
function normCta(v: unknown): CtaKind | null {
  return typeof v === "string" && CTA_KINDS.has(v as CtaKind) ? (v as CtaKind) : null;
}

function ownerOrgId(actor: Actor): string {
  const id = actor.org?.id ?? null;
  if (!id) throw new ForbiddenError("join or create an organization to send campaigns");
  return id;
}

const COLS = `id, owner_org_id, name, audience, subject, body_html, cta_kind, cta_ref,
  cta_url, status, recipient_count, sent_count, test_sent_at, approved_at, sent_at,
  created_by, created_at, updated_at`;

/** Absolute base for CTA links in emails. */
function appBase(): string {
  return (PUBLIC_APP_URL || "https://divinipartners.com").replace(/\/$/, "");
}

/** Resolve the campaign's call-to-action into an absolute URL. */
export function buildCtaUrl(c: RelationshipCampaignRow): string {
  const base = appBase();
  if (c.cta_kind === "custom" && c.cta_url) return c.cta_url;
  switch (c.cta_kind) {
    case "clone_playbook":
      return `${base}/playbooks`;
    case "open_rfp":
      return c.cta_ref ? `${base}/events/${c.cta_ref}` : `${base}/events`;
    case "sponsorship_packages":
      return c.cta_ref ? `${base}/sponsorship-packages?event=${c.cta_ref}` : `${base}/sponsorship-packages`;
    case "create_event":
      return `${base}/events`;
    default:
      return c.cta_url || base;
  }
}

export interface CampaignInput {
  name: string;
  audience?: Audience;
  subject?: string | null;
  body_html?: string | null;
  cta_kind?: string | null;
  cta_ref?: string | null;
  cta_url?: string | null;
}

export async function createCampaign(actor: Actor, input: CampaignInput): Promise<RelationshipCampaignRow> {
  const owner = ownerOrgId(actor);
  if (!input.name || typeof input.name !== "string") throw new ForbiddenError("name required");
  const row = await q1<RelationshipCampaignRow>(
    `insert into relationship_campaigns
       (owner_org_id, name, audience, subject, body_html, cta_kind, cta_ref, cta_url, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning ${COLS}`,
    [
      owner,
      input.name,
      JSON.stringify(input.audience ?? {}),
      input.subject ?? null,
      input.body_html ?? null,
      normCta(input.cta_kind),
      input.cta_ref ?? null,
      input.cta_url ?? null,
      actor.user.id,
    ],
  );
  return row as RelationshipCampaignRow;
}

export async function listCampaigns(actor: Actor): Promise<RelationshipCampaignRow[]> {
  const owner = ownerOrgId(actor);
  return q<RelationshipCampaignRow>(
    `select ${COLS} from relationship_campaigns where owner_org_id = $1 order by created_at desc limit 300`,
    [owner],
  );
}

/** Get a campaign the caller owns, or throw. */
export async function getCampaign(actor: Actor, id: string): Promise<RelationshipCampaignRow> {
  const owner = ownerOrgId(actor);
  const row = await q1<RelationshipCampaignRow>(
    `select ${COLS} from relationship_campaigns where id = $1 and owner_org_id = $2`,
    [id, owner],
  );
  if (!row) throw new NotFoundError("campaign not found");
  return row;
}

export async function listRecipients(actor: Actor, id: string): Promise<CampaignRecipientRow[]> {
  await getCampaign(actor, id); // ownership
  return q<CampaignRecipientRow>(
    `select * from relationship_campaign_recipients where campaign_id = $1 order by created_at asc`,
    [id],
  );
}

export async function updateCampaign(
  actor: Actor,
  id: string,
  patch: Partial<CampaignInput>,
): Promise<RelationshipCampaignRow> {
  await getCampaign(actor, id);
  const owner = ownerOrgId(actor);
  const row = await q1<RelationshipCampaignRow>(
    `update relationship_campaigns set
        name = coalesce($3, name),
        audience = coalesce($4, audience),
        subject = coalesce($5, subject),
        body_html = coalesce($6, body_html),
        cta_kind = coalesce($7, cta_kind),
        cta_ref = coalesce($8, cta_ref),
        cta_url = coalesce($9, cta_url),
        updated_at = now()
      where id = $1 and owner_org_id = $2
      returning ${COLS}`,
    [
      id,
      owner,
      patch.name ?? null,
      patch.audience != null ? JSON.stringify(patch.audience) : null,
      patch.subject ?? null,
      patch.body_html ?? null,
      patch.cta_kind != null ? normCta(patch.cta_kind) : null,
      patch.cta_ref ?? null,
      patch.cta_url ?? null,
    ],
  );
  return row as RelationshipCampaignRow;
}

export async function deleteCampaign(actor: Actor, id: string): Promise<boolean> {
  const owner = ownerOrgId(actor);
  const rows = await q(
    `delete from relationship_campaigns where id = $1 and owner_org_id = $2 returning id`,
    [id, owner],
  );
  return rows.length > 0;
}

/** Gather the partner org ids this campaign targets, scoped to the owner. */
async function audienceOrgIds(actor: Actor, owner: string, audience: Audience): Promise<string[]> {
  if (audience.kind === "event_roster") {
    const eventId = audience.event_id;
    if (!eventId) return [];
    // Ownership: only the org that owns the event may target its roster.
    const own = await q1<{ ok: boolean }>(
      `select true as ok from events where id = $1 and organization_id = $2 limit 1`,
      [eventId, owner],
    );
    if (!own && actor.user.role !== "super_admin" && actor.user.role !== "admin") {
      throw new ForbiddenError("you do not own that event");
    }
    const vendors = await q<{ organization_id: string | null }>(
      `select distinct organization_id from event_vendors where event_id = $1`,
      [eventId],
    );
    const sponsors = await q<{ sponsor_org_id: string | null }>(
      `select distinct spur.sponsor_org_id
         from sponsor_purchases spur
         join fundraising_events fe on fe.id = spur.fundraising_event_id
        where fe.event_id = $1`,
      [eventId],
    );
    const ids = [
      ...vendors.map((v) => v.organization_id),
      ...sponsors.map((s) => s.sponsor_org_id),
    ].filter((x): x is string => !!x && x !== owner);
    return Array.from(new Set(ids));
  }
  // default: preferred partners segment
  const params: unknown[] = [owner];
  let where = `owner_org_id = $1`;
  if (audience.partner_kind) {
    params.push(audience.partner_kind);
    where += ` and partner_kind = $${params.length}`;
  }
  if (Array.isArray(audience.tiers) && audience.tiers.length) {
    params.push(audience.tiers);
    where += ` and tier = any($${params.length})`;
  }
  const rows = await q<{ partner_org_id: string | null }>(
    `select distinct partner_org_id from preferred_partners where ${where}`,
    params,
  );
  return rows.map((r) => r.partner_org_id).filter((x): x is string => !!x && x !== owner);
}

/** True when the claim_suppression table exists (optional in some DBs). */
async function suppressionExists(): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass('claim_suppression') as reg`);
  return !!row?.reg;
}

/**
 * Resolve + persist the recipient list for a campaign. Reads the audience,
 * expands to partner-org contact emails, dedupes by lowercased email, filters
 * suppression, replaces the stored recipients, and sets recipient_count.
 */
export async function resolveAudience(actor: Actor, id: string): Promise<CampaignRecipientRow[]> {
  const owner = ownerOrgId(actor);
  const campaign = await getCampaign(actor, id);
  const audience = (campaign.audience ?? {}) as Audience;
  const orgIds = await audienceOrgIds(actor, owner, audience);

  const recipients: { partner_org_id: string | null; name: string | null; email: string }[] = [];
  if (orgIds.length) {
    const rows = await q<{ org_id: string; name: string | null; email: string | null }>(
      `select org_id, name, email from (
         select o.id as org_id, o.name, u.email
           from organizations o join users u on u.organization_id = o.id
          where o.id = any($1::uuid[])
         union
         select o.id, o.name, o.billing_contact
           from organizations o
          where o.id = any($1::uuid[]) and o.billing_contact is not null
       ) t where email is not null`,
      [orgIds],
    );
    // Suppression filter.
    let suppressed = new Set<string>();
    if (await suppressionExists()) {
      const s = await q<{ email: string | null }>(
        `select lower(email) as email from claim_suppression where email is not null`,
      );
      suppressed = new Set(s.map((r) => (r.email ?? "").trim()).filter(Boolean));
    }
    const seen = new Set<string>();
    for (const r of rows) {
      const email = (r.email ?? "").trim();
      const low = email.toLowerCase();
      if (!email || seen.has(low) || suppressed.has(low)) continue;
      seen.add(low);
      recipients.push({ partner_org_id: r.org_id, name: r.name, email });
    }
  }

  // Replace stored recipients.
  await q(`delete from relationship_campaign_recipients where campaign_id = $1`, [id]);
  for (const r of recipients) {
    await q(
      `insert into relationship_campaign_recipients (campaign_id, partner_org_id, email, name, status)
       values ($1,$2,$3,$4,'pending')`,
      [id, r.partner_org_id, r.email, r.name],
    );
  }
  await q(
    `update relationship_campaigns set recipient_count = $2, updated_at = now() where id = $1`,
    [id, recipients.length],
  );
  return listRecipients(actor, id);
}

export async function markTestSent(actor: Actor, id: string): Promise<void> {
  const owner = ownerOrgId(actor);
  await q(
    `update relationship_campaigns set test_sent_at = now(),
        status = case when status = 'draft' then 'test_sent' else status end,
        updated_at = now()
      where id = $1 and owner_org_id = $2`,
    [id, owner],
  );
}

export async function markRecipientSent(id: string, ok: boolean): Promise<void> {
  await q(
    `update relationship_campaign_recipients set status = $2, sent_at = now() where id = $1`,
    [id, ok ? "sent" : "failed"],
  );
}

export async function markSent(actor: Actor, id: string, sentCount: number): Promise<void> {
  const owner = ownerOrgId(actor);
  await q(
    `update relationship_campaigns set status = 'sent', sent_count = $3, sent_at = now(),
        approved_at = coalesce(approved_at, now()), updated_at = now()
      where id = $1 and owner_org_id = $2`,
    [id, owner, sentCount],
  );
}
