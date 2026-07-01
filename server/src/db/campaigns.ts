/**
 * Admin Email Campaigns - data-access layer (db/schema-campaigns.sql).
 *
 * Tables:
 *   email_campaigns     - one row per broadcast (draft -> test_sent -> sent)
 *   campaign_recipients - per-send snapshot of who was emailed and the result
 *
 * Audience resolution reads discovered_businesses (public emails only) and
 * subtracts the authoritative claim_suppression list, so every send honors the
 * same unsubscribe/removal/bounce suppression as the claim outreach engine.
 * Recipients are deduped by lowercased email.
 *
 * Zero em dashes in this file.
 */
import { q, q1 } from "../pool.js";

export type AudienceKind = "venue" | "vendor" | "planner" | "all";

export type Campaign = {
  id: string;
  name: string;
  audience: { kind?: AudienceKind } | Record<string, unknown>;
  subject: string;
  body_html: string;
  status: string;
  created_by_email: string | null;
  recipient_count: number;
  sent_count: number;
  test_sent_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export type AudienceContact = { email: string; name: string | null };

const FIELDS = `id, name, audience, subject, body_html, status, created_by_email,
   recipient_count, sent_count, test_sent_at, approved_at, sent_at, created_at`;

// ---- email_campaigns CRUD --------------------------------------------------

export async function createCampaign(input: {
  name: string;
  audience: { kind: AudienceKind };
  subject: string;
  bodyHtml: string;
  createdByEmail: string | null;
}): Promise<Campaign> {
  const row = await q1<Campaign>(
    `insert into email_campaigns (name, audience, subject, body_html, created_by_email)
       values ($1, $2::jsonb, $3, $4, $5)
     returning ${FIELDS}`,
    [
      input.name,
      JSON.stringify(input.audience ?? {}),
      input.subject,
      input.bodyHtml ?? "",
      input.createdByEmail ?? null,
    ],
  );
  return row as Campaign;
}

export async function listCampaigns(limit = 200): Promise<Campaign[]> {
  return q<Campaign>(
    `select ${FIELDS} from email_campaigns order by created_at desc limit $1`,
    [Math.min(limit, 1000)],
  );
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return q1<Campaign>(`select ${FIELDS} from email_campaigns where id = $1`, [id]);
}

/** Mark the test send timestamp + move status to test_sent. */
export async function markTestSent(id: string): Promise<Campaign | null> {
  return q1<Campaign>(
    `update email_campaigns set test_sent_at = now(), status = 'test_sent'
      where id = $1 returning ${FIELDS}`,
    [id],
  );
}

/** Finalize an approved send: timestamps, counts, and status = sent. */
export async function markSent(
  id: string,
  recipientCount: number,
  sentCount: number,
): Promise<Campaign | null> {
  return q1<Campaign>(
    `update email_campaigns set
        approved_at = now(),
        sent_at = now(),
        status = 'sent',
        recipient_count = $2,
        sent_count = $3
      where id = $1 returning ${FIELDS}`,
    [id, recipientCount, sentCount],
  );
}

// ---- campaign_recipients ---------------------------------------------------

export async function insertRecipient(r: {
  campaignId: string;
  email: string;
  name: string | null;
  status: "sent" | "failed" | "pending";
}): Promise<void> {
  await q(
    `insert into campaign_recipients (campaign_id, email, name, status, sent_at)
       values ($1, $2, $3, $4, case when $4 = 'sent' then now() else null end)`,
    [r.campaignId, r.email, r.name ?? null, r.status],
  );
}

export async function listRecipients(campaignId: string): Promise<
  { id: string; email: string; name: string | null; status: string; sent_at: string | null }[]
> {
  return q(
    `select id, email, name, status, sent_at
       from campaign_recipients where campaign_id = $1 order by created_at asc`,
    [campaignId],
  );
}

// ---- audience resolution ---------------------------------------------------

/**
 * Resolve an audience to a deduped list of {email, name} contacts. Reads
 * discovered_businesses with a public email, excludes archived records, filters
 * by category when the audience is not "all", and subtracts the authoritative
 * claim_suppression list (matched on lowercased email). Dedupe is by lowercased
 * email so a business is never emailed twice in one send.
 */
export async function resolveAudience(
  audience: { kind?: AudienceKind } | Record<string, unknown>,
  limit = 5000,
): Promise<AudienceContact[]> {
  const kind = ((audience as { kind?: string })?.kind ?? "all") as string;
  const params: unknown[] = [];
  let categoryClause = "";
  if (kind && kind !== "all") {
    params.push(kind);
    categoryClause = `and category = $${params.length}`;
  }
  params.push(Math.min(limit, 20000));
  const limitParam = `$${params.length}`;

  const rows = await q<{ email: string; name: string | null }>(
    `select public_email as email, business_name as name
       from discovered_businesses
      where public_email is not null
        and coalesce(discovery_status, 'discovered') not in ('archived')
        ${categoryClause}
        and lower(public_email) not in (
          select lower(email) from claim_suppression where email is not null
        )
      order by created_at desc
      limit ${limitParam}`,
    params,
  );

  const seen = new Set<string>();
  const out: AudienceContact[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email: r.email, name: r.name ?? null });
  }
  return out;
}
