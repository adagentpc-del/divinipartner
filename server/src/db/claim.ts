/**
 * Claim Your Profile - data-access layer (automation addendum).
 *
 * Tables (db/schema.sql + db/schema-claim.sql):
 *   discovered_businesses  - raw, source-attributed business records
 *   unclaimed_profiles     - public, clearly-labelled unclaimed pages
 *   claim_outreach         - one row per outreach send (cadence + compliance)
 *   claim_verifications    - ownership verification attempts
 *   claim_markets          - geographic expansion scheduler
 *   claim_suppression      - emails/domains that must never be contacted
 *
 * Safety rules baked into this layer:
 *   - We never invent pricing, availability, capacity, insurance, or
 *     certifications. AI-suggested copy is clearly tagged and owner-unverified.
 *   - Suppression is authoritative. isSuppressed() is checked before any send.
 *   - Public reads expose only unclaimed, non-removed, non-archived profiles and
 *     always carry the "generated from publicly available information" banner.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { q, q1, pool } from "../pool.js";
import { claimTotals } from "./email-events.js";

// ---- Status model ----------------------------------------------------------

export type DiscoveryStatus =
  | "discovered"
  | "unclaimed"
  | "claim_email_sent"
  | "claim_pending"
  | "claimed"
  | "verified"
  | "rejected"
  | "do_not_contact"
  | "archived";

export const DISCOVERY_STATUSES: DiscoveryStatus[] = [
  "discovered",
  "unclaimed",
  "claim_email_sent",
  "claim_pending",
  "claimed",
  "verified",
  "rejected",
  "do_not_contact",
  "archived",
];

export const SOURCE_ATTRIBUTION =
  "Unclaimed profile generated from publicly available information";

// ---- Types -----------------------------------------------------------------

export type DiscoveredBusiness = {
  id: string;
  business_name: string | null;
  category: string | null;
  subcategories: string[] | null;
  website_url: string | null;
  source_urls: unknown;
  public_email: string | null;
  public_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
  social_links: unknown;
  confidence_score: string | null;
  confidence_band: string | null;
  confidence_inputs: unknown;
  discovery_status: DiscoveryStatus | null;
  duplicate_of: string | null;
  duplicate_reason: string | null;
  market_id: string | null;
  do_not_contact: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_enriched_at: string | null;
};

export type UnclaimedProfile = {
  id: string;
  discovered_business_id: string | null;
  profile_slug: string | null;
  public_profile_url: string | null;
  claim_status: string | null;
  ai_generated_description: string | null;
  ai_generated_tags: string[] | null;
  brand_colors: unknown;
  logo_url: string | null;
  image_urls: unknown;
  source_attribution: string | null;
  owner_verified: boolean | null;
  published_status: string | null;
  noindex_status: boolean | null;
  removal_requested: boolean | null;
  claimed_organization_id: string | null;
  claimed_at: string | null;
  archived: boolean | null;
  created_at: string;
};

export type ClaimOutreach = {
  id: string;
  profile_id: string | null;
  email: string | null;
  sequence_step: number | null;
  email_subject: string | null;
  email_body: string | null;
  sent_at: string | null;
  delivery_status: string | null;
  bounced: boolean | null;
  unsubscribed: boolean | null;
  removal_requested: boolean | null;
  next_send_date: string | null;
  cadence: string | null;
  stop_reason: string | null;
  created_at: string;
};

export type ClaimVerification = {
  id: string;
  profile_id: string | null;
  user_id: string | null;
  verification_method: string | null;
  verification_status: string | null;
  verified_email: string | null;
  verified_domain: string | null;
  verification_code: string | null;
  code_expires_at: string | null;
  agreement_version: string | null;
  full_name: string | null;
  claimant_role: string | null;
  admin_approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
};

export type ClaimMarket = {
  id: string;
  market_name: string | null;
  state: string | null;
  region: string | null;
  status: string | null;
  target_categories: string[] | null;
  max_profiles: number | null;
  profiles_discovered: number | null;
  outreach_cadence: string | null;
  priority: number | null;
  created_at: string;
};

export type Suppression = {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string | null;
  profile_id: string | null;
  source_ip: string | null;
  created_at: string;
};

const DB_FIELDS =
  `id, business_name, category, subcategories, website_url, source_urls,
   public_email, public_phone, address, city, state, region, country,
   social_links, confidence_score, confidence_band, confidence_inputs,
   discovery_status, duplicate_of, duplicate_reason, market_id, do_not_contact,
   notes, created_at, updated_at, last_enriched_at`;

const UP_FIELDS =
  `id, discovered_business_id, profile_slug, public_profile_url, claim_status,
   ai_generated_description, ai_generated_tags, brand_colors, logo_url,
   image_urls, source_attribution, owner_verified, published_status,
   noindex_status, removal_requested, claimed_organization_id, claimed_at,
   archived, created_at`;

// ---- discovered_businesses CRUD --------------------------------------------

export async function insertDiscoveredBusiness(
  b: {
    businessName: string;
    category?: string | null;
    subcategories?: string[] | null;
    websiteUrl?: string | null;
    sourceUrls?: unknown;
    publicEmail?: string | null;
    publicPhone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    region?: string | null;
    country?: string | null;
    socialLinks?: unknown;
    confidenceScore?: number | null;
    confidenceBand?: string | null;
    confidenceInputs?: unknown;
    discoveryStatus?: DiscoveryStatus;
    duplicateOf?: string | null;
    duplicateReason?: string | null;
    marketId?: string | null;
  },
): Promise<DiscoveredBusiness> {
  const row = await q1<DiscoveredBusiness>(
    `insert into discovered_businesses
       (business_name, category, subcategories, website_url, source_urls,
        public_email, public_phone, address, city, state, region, country,
        social_links, confidence_score, confidence_band, confidence_inputs,
        discovery_status, duplicate_of, duplicate_reason, market_id,
        last_enriched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now())
     returning ${DB_FIELDS}`,
    [
      b.businessName,
      b.category ?? null,
      b.subcategories ?? null,
      b.websiteUrl ?? null,
      b.sourceUrls === undefined ? null : JSON.stringify(b.sourceUrls),
      b.publicEmail ?? null,
      b.publicPhone ?? null,
      b.address ?? null,
      b.city ?? null,
      b.state ?? null,
      b.region ?? null,
      b.country ?? null,
      b.socialLinks === undefined ? null : JSON.stringify(b.socialLinks),
      b.confidenceScore ?? null,
      b.confidenceBand ?? null,
      b.confidenceInputs === undefined ? null : JSON.stringify(b.confidenceInputs),
      b.discoveryStatus ?? "discovered",
      b.duplicateOf ?? null,
      b.duplicateReason ?? null,
      b.marketId ?? null,
    ],
  );
  return row as DiscoveredBusiness;
}

export async function getDiscoveredBusiness(id: string): Promise<DiscoveredBusiness | null> {
  return q1<DiscoveredBusiness>(
    `select ${DB_FIELDS} from discovered_businesses where id = $1`,
    [id],
  );
}

export async function listDiscoveredBusinesses(
  filter: { status?: DiscoveryStatus; category?: string; region?: string; limit?: number } = {},
): Promise<DiscoveredBusiness[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`discovery_status = $${params.length}`);
  }
  if (filter.category) {
    params.push(filter.category);
    where.push(`category = $${params.length}`);
  }
  if (filter.region) {
    params.push(filter.region);
    where.push(`region = $${params.length}`);
  }
  params.push(Math.min(filter.limit ?? 200, 1000));
  const limit = `$${params.length}`;
  return q<DiscoveredBusiness>(
    `select ${DB_FIELDS} from discovered_businesses
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by confidence_score desc nulls last, created_at desc
      limit ${limit}`,
    params,
  );
}

export async function setDiscoveryStatus(
  id: string,
  status: DiscoveryStatus,
  extra?: { duplicateOf?: string | null; duplicateReason?: string | null; notes?: string | null },
): Promise<DiscoveredBusiness | null> {
  return q1<DiscoveredBusiness>(
    `update discovered_businesses set
        discovery_status = $2,
        duplicate_of = coalesce($3, duplicate_of),
        duplicate_reason = coalesce($4, duplicate_reason),
        notes = coalesce($5, notes),
        do_not_contact = case when $2 = 'do_not_contact' then true else do_not_contact end,
        updated_at = now()
      where id = $1
      returning ${DB_FIELDS}`,
    [id, status, extra?.duplicateOf ?? null, extra?.duplicateReason ?? null, extra?.notes ?? null],
  );
}

export async function editDiscoveredBusiness(
  id: string,
  patch: Partial<{
    business_name: string;
    category: string;
    subcategories: string[];
    website_url: string;
    public_email: string;
    public_phone: string;
    city: string;
    state: string;
    region: string;
    notes: string;
  }>,
): Promise<DiscoveredBusiness | null> {
  const cols: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    params.push(v);
    cols.push(`${k} = $${params.length}`);
  }
  if (!cols.length) return getDiscoveredBusiness(id);
  return q1<DiscoveredBusiness>(
    `update discovered_businesses set ${cols.join(", ")}, updated_at = now()
      where id = $1 returning ${DB_FIELDS}`,
    params,
  );
}

/** Candidate set for duplicate detection: same name/website/phone/email/city. */
export async function findDuplicateCandidates(seed: {
  businessName?: string | null;
  websiteUrl?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  city?: string | null;
  excludeId?: string | null;
}): Promise<DiscoveredBusiness[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, val: unknown) => {
    params.push(val);
    clauses.push(sql.replace("$$", `$${params.length}`));
  };
  if (seed.businessName) add(`lower(business_name) = lower($$)`, seed.businessName);
  if (seed.websiteUrl) add(`lower(website_url) = lower($$)`, seed.websiteUrl);
  if (seed.publicPhone) add(`public_phone = $$`, seed.publicPhone);
  if (seed.publicEmail) add(`lower(public_email) = lower($$)`, seed.publicEmail);
  if (seed.businessName && seed.city) {
    params.push(seed.businessName, seed.city);
    clauses.push(`(lower(business_name) = lower($${params.length - 1}) and lower(city) = lower($${params.length}))`);
  }
  if (!clauses.length) return [];
  let exclude = "";
  if (seed.excludeId) {
    params.push(seed.excludeId);
    exclude = ` and id <> $${params.length}`;
  }
  return q<DiscoveredBusiness>(
    `select ${DB_FIELDS} from discovered_businesses
      where (${clauses.join(" or ")})${exclude}
      order by created_at asc`,
    params,
  );
}

// ---- unclaimed_profiles CRUD -----------------------------------------------

export async function createUnclaimedProfile(p: {
  discoveredBusinessId: string;
  slug: string;
  description: string;
  tags: string[];
  brandColors?: unknown;
  logoUrl?: string | null;
  imageUrls?: unknown;
  noindex?: boolean;
}): Promise<UnclaimedProfile> {
  const row = await q1<UnclaimedProfile>(
    `insert into unclaimed_profiles
       (discovered_business_id, profile_slug, public_profile_url, claim_status,
        ai_generated_description, ai_generated_tags, brand_colors, logo_url,
        image_urls, source_attribution, owner_verified, published_status,
        noindex_status, removal_requested)
     values ($1,$2,$3,'unclaimed',$4,$5,$6,$7,$8,$9,false,'unclaimed',$10,false)
     returning ${UP_FIELDS}`,
    [
      p.discoveredBusinessId,
      p.slug,
      `/claim/${p.slug}`,
      p.description,
      p.tags,
      p.brandColors === undefined ? null : JSON.stringify(p.brandColors),
      p.logoUrl ?? null,
      p.imageUrls === undefined ? null : JSON.stringify(p.imageUrls),
      SOURCE_ATTRIBUTION,
      p.noindex ?? true,
    ],
  );
  return row as UnclaimedProfile;
}

export async function getUnclaimedProfile(id: string): Promise<UnclaimedProfile | null> {
  return q1<UnclaimedProfile>(`select ${UP_FIELDS} from unclaimed_profiles where id = $1`, [id]);
}

export async function getUnclaimedProfileBySlug(slug: string): Promise<UnclaimedProfile | null> {
  return q1<UnclaimedProfile>(
    `select ${UP_FIELDS} from unclaimed_profiles where profile_slug = $1`,
    [slug],
  );
}

/**
 * Public read joined with its discovered business. Returns null when the
 * profile is claimed, removed, archived, or missing. Always carries the
 * source-attribution banner so the page can never imply verified/partner status.
 */
export async function getPublicUnclaimedBySlug(slug: string): Promise<
  | (UnclaimedProfile & {
      business: Pick<
        DiscoveredBusiness,
        | "business_name"
        | "category"
        | "subcategories"
        | "website_url"
        | "city"
        | "state"
        | "region"
        | "country"
        | "social_links"
      >;
    })
  | null
> {
  const row = await q1<UnclaimedProfile & Record<string, unknown>>(
    `select ${UP_FIELDS.split(", ").map((f) => `up.${f}`).join(", ")},
            db.business_name, db.category, db.subcategories, db.website_url,
            db.city, db.state, db.region, db.country, db.social_links
       from unclaimed_profiles up
       join discovered_businesses db on db.id = up.discovered_business_id
      where up.profile_slug = $1
        and coalesce(up.removal_requested, false) = false
        and coalesce(up.archived, false) = false
        and up.claim_status = 'unclaimed'`,
    [slug],
  );
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    ...(row as unknown as UnclaimedProfile),
    business: {
      business_name: (r.business_name as string) ?? null,
      category: (r.category as string) ?? null,
      subcategories: (r.subcategories as string[]) ?? null,
      website_url: (r.website_url as string) ?? null,
      city: (r.city as string) ?? null,
      state: (r.state as string) ?? null,
      region: (r.region as string) ?? null,
      country: (r.country as string) ?? null,
      social_links: r.social_links ?? null,
    },
  };
}

export async function editUnclaimedProfile(
  id: string,
  patch: Partial<{
    ai_generated_description: string;
    ai_generated_tags: string[];
    logo_url: string;
    noindex_status: boolean;
    published_status: string;
  }>,
): Promise<UnclaimedProfile | null> {
  const cols: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    params.push(v);
    cols.push(`${k} = $${params.length}`);
  }
  if (!cols.length) return getUnclaimedProfile(id);
  return q1<UnclaimedProfile>(
    `update unclaimed_profiles set ${cols.join(", ")} where id = $1 returning ${UP_FIELDS}`,
    params,
  );
}

export async function setProfileClaimStatus(
  id: string,
  status: string,
): Promise<UnclaimedProfile | null> {
  return q1<UnclaimedProfile>(
    `update unclaimed_profiles set claim_status = $2 where id = $1 returning ${UP_FIELDS}`,
    [id, status],
  );
}

export async function markRemovalRequested(slug: string): Promise<UnclaimedProfile | null> {
  return q1<UnclaimedProfile>(
    `update unclaimed_profiles set removal_requested = true, published_status = 'removed',
        noindex_status = true
      where profile_slug = $1 returning ${UP_FIELDS}`,
    [slug],
  );
}

export async function archiveProfile(id: string): Promise<UnclaimedProfile | null> {
  return q1<UnclaimedProfile>(
    `update unclaimed_profiles set archived = true, published_status = 'archived'
      where id = $1 returning ${UP_FIELDS}`,
    [id],
  );
}

/** Link a successfully-claimed profile to a new organization + verify. */
export async function linkClaimedOrganization(
  profileId: string,
  organizationId: string,
): Promise<UnclaimedProfile | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const up = (
      await client.query(
        `update unclaimed_profiles set
            claim_status = 'claimed', owner_verified = true,
            claimed_organization_id = $2, claimed_at = now(),
            published_status = 'claimed', noindex_status = false
          where id = $1 returning ${UP_FIELDS}`,
        [profileId, organizationId],
      )
    ).rows[0];
    if (up) {
      await client.query(
        `update discovered_businesses set discovery_status = 'verified', updated_at = now()
           where id = (select discovered_business_id from unclaimed_profiles where id = $1)`,
        [profileId],
      );
    }
    await client.query("commit");
    return (up as UnclaimedProfile) ?? null;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function slugExists(slug: string): Promise<boolean> {
  const row = await q1<{ id: string }>(
    `select id from unclaimed_profiles where profile_slug = $1`,
    [slug],
  );
  return !!row;
}

// ---- claim_outreach --------------------------------------------------------

export async function recordOutreach(o: {
  profileId: string;
  email: string;
  sequenceStep: number;
  subject: string;
  body: string;
  cadence: string;
  nextSendDate: string | null;
  deliveryStatus?: string;
}): Promise<ClaimOutreach> {
  const row = await q1<ClaimOutreach>(
    `insert into claim_outreach
       (profile_id, email, sequence_step, email_subject, email_body, sent_at,
        delivery_status, cadence, next_send_date)
     values ($1,$2,$3,$4,$5, now(), $6,$7,$8)
     returning *`,
    [
      o.profileId,
      o.email,
      o.sequenceStep,
      o.subject,
      o.body,
      o.deliveryStatus ?? "logged",
      o.cadence,
      o.nextSendDate,
    ],
  );
  return row as ClaimOutreach;
}

export async function listOutreachForProfile(profileId: string): Promise<ClaimOutreach[]> {
  return q<ClaimOutreach>(
    `select * from claim_outreach where profile_id = $1 order by sequence_step asc, created_at asc`,
    [profileId],
  );
}

export async function countSendsForProfile(profileId: string): Promise<number> {
  const row = await q1<{ n: string }>(
    `select count(*)::text as n from claim_outreach where profile_id = $1 and sent_at is not null`,
    [profileId],
  );
  return Number(row?.n ?? 0);
}

/**
 * Profiles whose next claim outreach is due now. Joins each unclaimed profile to
 * its discovered business and computes, via a lateral subquery over claim_outreach,
 * how many sends have happened and when the next send is due. A profile is due
 * when it has had no sends yet (and the business is freshly unclaimed) or when its
 * recorded next_send_date has passed. Profiles that are claimed, archived, removal
 * requested, missing a public email, marked do_not_contact, or already at the send
 * cap are excluded. Suppression and the final stop-condition checks happen inside
 * the email send() path.
 */
export type DueOutreachRow = {
  profile_id: string;
  slug: string | null;
  business_name: string | null;
  city: string | null;
  category: string | null;
  email: string | null;
};

export async function listProfilesDueForOutreach(
  maxSends: number,
  limit: number,
): Promise<DueOutreachRow[]> {
  return q<DueOutreachRow>(
    `select p.id as profile_id,
            p.profile_slug as slug,
            b.business_name,
            b.city,
            b.category,
            b.public_email as email,
            o.next_due
       from unclaimed_profiles p
       join discovered_businesses b on b.id = p.discovered_business_id
       left join lateral (
         select max(next_send_date) as next_due, count(*) as sends
           from claim_outreach
          where profile_id = p.id
       ) o on true
      where coalesce(p.claim_status, 'unclaimed') = 'unclaimed'
        and coalesce(p.archived, false) = false
        and coalesce(p.removal_requested, false) = false
        and b.public_email is not null
        and coalesce(b.do_not_contact, false) = false
        and coalesce(o.sends, 0) < $1
        and (
          (o.sends = 0 and b.discovery_status = 'unclaimed')
          or (o.sends > 0 and o.next_due is not null and o.next_due <= now())
        )
      order by o.next_due nulls first
      limit $2`,
    [maxSends, limit],
  );
}

export async function stopOutreachForProfile(
  profileId: string,
  reason: string,
): Promise<void> {
  await q(
    `update claim_outreach set cadence = 'stopped', stop_reason = $2, next_send_date = null
      where profile_id = $1 and (cadence is null or cadence <> 'stopped')`,
    [profileId, reason],
  );
}

export async function markBounced(outreachId: string): Promise<void> {
  await q(`update claim_outreach set bounced = true, delivery_status = 'bounced' where id = $1`, [
    outreachId,
  ]);
}

// ---- claim_verifications ---------------------------------------------------

export async function createVerification(v: {
  profileId: string;
  userId?: string | null;
  method: string;
  verifiedEmail?: string | null;
  verifiedDomain?: string | null;
  code?: string | null;
  codeExpiresAt?: string | null;
  fullName?: string | null;
  claimantRole?: string | null;
  agreementVersion?: string | null;
}): Promise<ClaimVerification> {
  const row = await q1<ClaimVerification>(
    `insert into claim_verifications
       (profile_id, user_id, verification_method, verification_status,
        verified_email, verified_domain, verification_code, code_expires_at,
        full_name, claimant_role, agreement_version)
     values ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      v.profileId,
      v.userId ?? null,
      v.method,
      v.verifiedEmail ?? null,
      v.verifiedDomain ?? null,
      v.code ?? null,
      v.codeExpiresAt ?? null,
      v.fullName ?? null,
      v.claimantRole ?? null,
      v.agreementVersion ?? null,
    ],
  );
  return row as ClaimVerification;
}

export async function getLatestVerification(
  profileId: string,
): Promise<ClaimVerification | null> {
  return q1<ClaimVerification>(
    `select * from claim_verifications where profile_id = $1 order by created_at desc limit 1`,
    [profileId],
  );
}

export async function setVerificationStatus(
  id: string,
  status: string,
  extra?: { adminApprovedBy?: string | null; rejectedReason?: string | null; userId?: string | null },
): Promise<ClaimVerification | null> {
  return q1<ClaimVerification>(
    `update claim_verifications set
        verification_status = $2,
        admin_approved_by = coalesce($3, admin_approved_by),
        rejected_reason = coalesce($4, rejected_reason),
        user_id = coalesce($5, user_id),
        approved_at = case when $2 = 'verified' then now() else approved_at end
      where id = $1 returning *`,
    [id, status, extra?.adminApprovedBy ?? null, extra?.rejectedReason ?? null, extra?.userId ?? null],
  );
}

// ---- claim_markets (geographic scheduler) ----------------------------------

export async function listMarkets(): Promise<ClaimMarket[]> {
  return q<ClaimMarket>(
    `select * from claim_markets order by priority asc nulls last, created_at asc`,
  );
}

export async function upsertMarket(m: {
  marketName: string;
  state?: string | null;
  region?: string | null;
  status?: string;
  targetCategories?: string[] | null;
  maxProfiles?: number | null;
  outreachCadence?: string | null;
  priority?: number | null;
}): Promise<ClaimMarket> {
  const row = await q1<ClaimMarket>(
    `insert into claim_markets
       (market_name, state, region, status, target_categories, max_profiles,
        outreach_cadence, priority)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      m.marketName,
      m.state ?? null,
      m.region ?? null,
      m.status ?? "queued",
      m.targetCategories ?? null,
      m.maxProfiles ?? null,
      m.outreachCadence ?? "weekly_x4_then_monthly",
      m.priority ?? null,
    ],
  );
  return row as ClaimMarket;
}

export async function setMarketStatus(id: string, status: string): Promise<ClaimMarket | null> {
  return q1<ClaimMarket>(`update claim_markets set status = $2 where id = $1 returning *`, [
    id,
    status,
  ]);
}

export async function incrementMarketDiscovered(id: string, by: number): Promise<void> {
  await q(
    `update claim_markets set profiles_discovered = coalesce(profiles_discovered,0) + $2 where id = $1`,
    [id, by],
  );
}

// ---- claim_suppression -----------------------------------------------------

export async function addSuppression(s: {
  email?: string | null;
  domain?: string | null;
  reason: "unsubscribe" | "removal_request" | "do_not_contact" | "bounce" | "manual";
  profileId?: string | null;
  sourceIp?: string | null;
}): Promise<Suppression | null> {
  if (!s.email && !s.domain) return null;
  const row = await q1<Suppression>(
    `insert into claim_suppression (email, domain, reason, profile_id, source_ip)
       values ($1,$2,$3,$4,$5)
     on conflict do nothing
     returning *`,
    [
      s.email ? s.email.toLowerCase() : null,
      s.domain ? s.domain.toLowerCase() : null,
      s.reason,
      s.profileId ?? null,
      s.sourceIp ?? null,
    ],
  );
  return row as Suppression | null;
}

export async function listSuppression(limit = 500): Promise<Suppression[]> {
  return q<Suppression>(
    `select * from claim_suppression order by created_at desc limit $1`,
    [Math.min(limit, 2000)],
  );
}

export async function removeSuppression(id: string): Promise<void> {
  await q(`delete from claim_suppression where id = $1`, [id]);
}

/** Authoritative check before any outreach send. */
export async function isSuppressed(email: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  const domain = e.includes("@") ? e.split("@")[1] : "";
  const row = await q1<{ id: string }>(
    `select id from claim_suppression
      where lower(email) = $1 or (domain is not null and lower(domain) = $2)
      limit 1`,
    [e, domain],
  );
  return !!row;
}

// ---- Dashboard metrics -----------------------------------------------------

export type ClaimMetrics = {
  discovered: number;
  created: number;
  pending: number;
  claimed: number;
  verified: number;
  conversionRate: number;
  emailsSent: number;
  bounces: number;
  unsubscribes: number;
  removals: number;
  duplicates: number;
  reviewQueue: number;
  // Self-hosted email analytics: open/click events recorded against
  // claim_outreach rows (db/email-events.ts). The addendum's future-phase
  // open/click metric, now real.
  openCount: number;
  clickCount: number;
  openRate: number; // opens per email sent, percent
  clickRate: number; // clicks per email sent, percent
  topCategories: { category: string; count: number }[];
  topCities: { city: string; count: number }[];
};

export async function getClaimMetrics(): Promise<ClaimMetrics> {
  const num = (r: { n: string } | null) => Number(r?.n ?? 0);

  const discovered = num(await q1<{ n: string }>(`select count(*)::text n from discovered_businesses`));
  const created = num(await q1<{ n: string }>(`select count(*)::text n from unclaimed_profiles`));
  const pending = num(
    await q1<{ n: string }>(
      `select count(*)::text n from unclaimed_profiles where claim_status = 'claim_pending'`,
    ),
  );
  const claimed = num(
    await q1<{ n: string }>(
      `select count(*)::text n from unclaimed_profiles where claim_status = 'claimed'`,
    ),
  );
  const verified = num(
    await q1<{ n: string }>(
      `select count(*)::text n from claim_verifications where verification_status = 'verified'`,
    ),
  );
  const emailsSent = num(
    await q1<{ n: string }>(`select count(*)::text n from claim_outreach where sent_at is not null`),
  );
  const bounces = num(
    await q1<{ n: string }>(`select count(*)::text n from claim_outreach where bounced = true`),
  );
  const unsubscribes = num(
    await q1<{ n: string }>(`select count(*)::text n from claim_suppression where reason = 'unsubscribe'`),
  );
  const removals = num(
    await q1<{ n: string }>(`select count(*)::text n from unclaimed_profiles where removal_requested = true`),
  );
  const duplicates = num(
    await q1<{ n: string }>(`select count(*)::text n from discovered_businesses where duplicate_of is not null`),
  );
  const reviewQueue = num(
    await q1<{ n: string }>(
      `select count(*)::text n from discovered_businesses where discovery_status = 'discovered' and confidence_band = 'review'`,
    ),
  );

  const events = await claimTotals();
  const openCount = events.openCount;
  const clickCount = events.clickCount;

  const topCategories = await q<{ category: string; count: number }>(
    `select category, count(*)::int as count from discovered_businesses
      where category is not null group by category order by count desc limit 8`,
  );
  const topCities = await q<{ city: string; count: number }>(
    `select city, count(*)::int as count from discovered_businesses
      where city is not null group by city order by count desc limit 8`,
  );

  return {
    discovered,
    created,
    pending,
    claimed,
    verified,
    conversionRate: created > 0 ? Math.round((claimed / created) * 1000) / 10 : 0,
    emailsSent,
    bounces,
    unsubscribes,
    removals,
    duplicates,
    reviewQueue,
    openCount,
    clickCount,
    openRate: emailsSent > 0 ? Math.round((openCount / emailsSent) * 1000) / 10 : 0,
    clickRate: emailsSent > 0 ? Math.round((clickCount / emailsSent) * 1000) / 10 : 0,
    topCategories,
    topCities,
  };
}
