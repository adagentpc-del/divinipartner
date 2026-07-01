/**
 * Divini Partners - Phase 2 data layer: AI-assisted onboarding + co-branded
 * partner profiles (blueprint sections 8 + 9).
 *
 * Everything here is organization-scoped. Callers resolve the actor with
 * getActor(sub, email) from ../db.js and pass actor.org.id as orgId. There is no
 * cross-org read except getPublicProfileBySlug(), which returns only published,
 * approved, public fields.
 *
 * AI behaviour: we do NOT call any external model and we never invent pricing,
 * capacity, insurance, or certifications. "AI suggestions" are deterministic
 * structuring of what the partner gave us (a website URL, a document reference)
 * into safe, clearly-labelled placeholder fields. Every suggested field is
 * returned as { value, status: 'ai_suggested_pending_verification' } and stored
 * in ai_profile_suggestions until the partner accepts/edits/rejects it.
 */
import { q, q1, pool } from "../pool.js";
import { listBadges, type VerificationBadgeRow } from "./leads.js";

// ---- Lifecycle ------------------------------------------------------------

export type CompletionStatus =
  | "Draft"
  | "Basic Complete"
  | "Pending Review"
  | "Published"
  | "Verified"
  | "Preferred Eligible"
  | "Preferred"
  | "Premier"
  | "Suspended"
  | "Archived";

export const COMPLETION_STATUSES: CompletionStatus[] = [
  "Draft",
  "Basic Complete",
  "Pending Review",
  "Published",
  "Verified",
  "Preferred Eligible",
  "Preferred",
  "Premier",
  "Suspended",
  "Archived",
];

export const AI_PENDING = "ai_suggested_pending_verification" as const;

// ---- Types ----------------------------------------------------------------

export type OnboardingDraft = {
  id: string;
  organization_id: string;
  role: string | null;
  sections: Record<string, unknown>;
  current_step: string | null;
  steps_completed: string[];
  strength: number;
  completion_status: CompletionStatus;
  submitted_at: string | null;
  published_at: string | null;
};

export type ProfileTheme = {
  id: string;
  organization_id: string;
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  button_style: string | null;
  template: string | null;
};

export type AiSuggestion = {
  id: string;
  organization_id: string;
  source: string | null;
  source_ref: string | null;
  section: string | null;
  field: string | null;
  suggested_value: unknown;
  status: string;
  resolved_value: unknown;
};

export type AiSuggestedField = {
  value: unknown;
  status: typeof AI_PENDING;
};

// ---- Helpers --------------------------------------------------------------

/** Lowercase, hyphenated, ASCII-safe slug. */
export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

const KIND_FROM_ROLE: Record<string, string> = {
  venue: "venue",
  vendor: "vendor",
  supplier: "supplier",
  installer: "installer",
  planner: "planner",
};

function kindForRole(role: string | null | undefined): string {
  return (role && KIND_FROM_ROLE[role]) || "vendor";
}

/** Compute a 0..100 profile-strength score from the saved sections. */
export function computeStrength(
  sections: Record<string, any>,
  theme: ProfileTheme | null,
): number {
  let score = 0;
  const has = (v: unknown) =>
    v !== undefined && v !== null && String(v).trim().length > 0;
  const basics = sections.basics ?? {};
  if (has(basics.name)) score += 12;
  if (has(basics.tagline)) score += 8;
  if (has(basics.city) || has(basics.region)) score += 8;
  const about = sections.about ?? {};
  if (has(about.body)) score += 16;
  const services = sections.services ?? {};
  if (Array.isArray(services.items) && services.items.length > 0) score += 16;
  const gallery = sections.gallery ?? {};
  if (Array.isArray(gallery.images) && gallery.images.length > 0) score += 12;
  const packages = sections.packages ?? {};
  if (Array.isArray(packages.items) && packages.items.length > 0) score += 8;
  const docs = sections.documents ?? {};
  if (Array.isArray(docs.items) && docs.items.length > 0) score += 8;
  if (theme && (has(theme.logo_url) || has(theme.primary_color))) score += 12;
  return Math.min(100, score);
}

// ---- Onboarding draft -----------------------------------------------------

/** Get (or lazily create) the organization's onboarding draft + theme + slug. */
export async function getMyProfileState(
  orgId: string,
  role?: string | null,
): Promise<{
  draft: OnboardingDraft;
  theme: ProfileTheme | null;
  slug: string | null;
  suggestions: AiSuggestion[];
  org: { id: string; name: string; tier: string | null; verification_status: string | null } | null;
}> {
  const draft = await ensureDraft(orgId, role);
  const theme = await getTheme(orgId);
  const slugRow = await q1<{ slug: string }>(
    `select slug from profile_slugs where organization_id = $1`,
    [orgId],
  );
  const suggestions = await listSuggestions(orgId);
  const org = await q1<{
    id: string;
    name: string;
    tier: string | null;
    verification_status: string | null;
  }>(
    `select id, name, tier, verification_status from organizations where id = $1`,
    [orgId],
  );
  return { draft, theme, slug: slugRow?.slug ?? null, suggestions, org };
}

/** Ensure a draft row exists; create with a reserved slug on first touch. */
export async function ensureDraft(
  orgId: string,
  role?: string | null,
): Promise<OnboardingDraft> {
  const existing = await q1<OnboardingDraft>(
    `select id, organization_id, role, sections, current_step, steps_completed,
            strength, completion_status, submitted_at, published_at
       from onboarding_drafts where organization_id = $1`,
    [orgId],
  );
  if (existing) return existing;

  // Derive the role from the organizations row if not provided.
  const org = await q1<{ name: string; type: string | null }>(
    `select name, type from organizations where id = $1`,
    [orgId],
  );
  const resolvedRole = role ?? org?.type ?? null;
  const created = await q1<OnboardingDraft>(
    `insert into onboarding_drafts (organization_id, role, sections, completion_status)
       values ($1, $2, '{}'::jsonb, 'Draft')
     on conflict (organization_id) do update set updated_at = now()
     returning id, organization_id, role, sections, current_step, steps_completed,
               strength, completion_status, submitted_at, published_at`,
    [orgId, resolvedRole],
  );
  await reserveSlug(orgId, org?.name ?? "partner", kindForRole(resolvedRole));
  return created as OnboardingDraft;
}

/** Save one or more onboarding sections (merge), plus step + strength. */
export async function saveDraft(
  orgId: string,
  payload: {
    sections?: Record<string, unknown>;
    currentStep?: string | null;
    stepsCompleted?: string[];
    role?: string | null;
  },
): Promise<OnboardingDraft> {
  await ensureDraft(orgId, payload.role ?? null);
  const merged = payload.sections ?? {};
  const theme = await getTheme(orgId);

  // Merge the supplied section keys into the stored jsonb (shallow merge by key).
  const current = await q1<OnboardingDraft>(
    `select sections from onboarding_drafts where organization_id = $1`,
    [orgId],
  );
  const nextSections = {
    ...((current?.sections as Record<string, unknown>) ?? {}),
    ...merged,
  };
  const strength = computeStrength(nextSections as Record<string, any>, theme);

  const row = await q1<OnboardingDraft>(
    `update onboarding_drafts set
        sections = $2::jsonb,
        current_step = coalesce($3, current_step),
        steps_completed = coalesce($4, steps_completed),
        role = coalesce($5, role),
        strength = $6,
        completion_status = case
          when completion_status = 'Draft' and $6 >= 45 then 'Basic Complete'
          else completion_status end,
        updated_at = now()
      where organization_id = $1
      returning id, organization_id, role, sections, current_step, steps_completed,
                strength, completion_status, submitted_at, published_at`,
    [
      orgId,
      JSON.stringify(nextSections),
      payload.currentStep ?? null,
      payload.stepsCompleted ?? null,
      payload.role ?? null,
      strength,
    ],
  );
  return row as OnboardingDraft;
}

/** Explicitly set the lifecycle status (admin/transition rules live in routes). */
export async function setCompletionStatus(
  orgId: string,
  status: CompletionStatus,
): Promise<OnboardingDraft> {
  const row = await q1<OnboardingDraft>(
    `update onboarding_drafts set
        completion_status = $2,
        submitted_at = case when $2 = 'Pending Review' then now() else submitted_at end,
        published_at = case when $2 = 'Published' then now() else published_at end,
        updated_at = now()
      where organization_id = $1
      returning id, organization_id, role, sections, current_step, steps_completed,
                strength, completion_status, submitted_at, published_at`,
    [orgId, status],
  );
  return row as OnboardingDraft;
}

// ---- Theme controls -------------------------------------------------------

export async function getTheme(orgId: string): Promise<ProfileTheme | null> {
  return q1<ProfileTheme>(
    `select id, organization_id, logo_url, cover_url, primary_color,
            secondary_color, accent_color, button_style, template
       from profile_themes where organization_id = $1`,
    [orgId],
  );
}

export async function saveTheme(
  orgId: string,
  t: Partial<Omit<ProfileTheme, "id" | "organization_id">>,
): Promise<ProfileTheme> {
  const row = await q1<ProfileTheme>(
    `insert into profile_themes
        (organization_id, logo_url, cover_url, primary_color, secondary_color,
         accent_color, button_style, template)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (organization_id) do update set
        logo_url = coalesce(excluded.logo_url, profile_themes.logo_url),
        cover_url = coalesce(excluded.cover_url, profile_themes.cover_url),
        primary_color = coalesce(excluded.primary_color, profile_themes.primary_color),
        secondary_color = coalesce(excluded.secondary_color, profile_themes.secondary_color),
        accent_color = coalesce(excluded.accent_color, profile_themes.accent_color),
        button_style = coalesce(excluded.button_style, profile_themes.button_style),
        template = coalesce(excluded.template, profile_themes.template),
        updated_at = now()
     returning id, organization_id, logo_url, cover_url, primary_color,
               secondary_color, accent_color, button_style, template`,
    [
      orgId,
      t.logo_url ?? null,
      t.cover_url ?? null,
      t.primary_color ?? null,
      t.secondary_color ?? null,
      t.accent_color ?? null,
      t.button_style ?? null,
      t.template ?? null,
    ],
  );
  // Keep strength in sync now that theme may have changed.
  const draft = await q1<OnboardingDraft>(
    `select sections from onboarding_drafts where organization_id = $1`,
    [orgId],
  );
  if (draft) {
    const strength = computeStrength(
      (draft.sections as Record<string, any>) ?? {},
      row,
    );
    await q(
      `update onboarding_drafts set strength = $2, updated_at = now() where organization_id = $1`,
      [orgId, strength],
    );
  }
  return row as ProfileTheme;
}

// ---- Slugs ----------------------------------------------------------------

/** Reserve a unique slug for the org (idempotent). Appends a suffix on clash. */
export async function reserveSlug(
  orgId: string,
  base: string,
  kind: string,
): Promise<string> {
  const existing = await q1<{ slug: string }>(
    `select slug from profile_slugs where organization_id = $1`,
    [orgId],
  );
  if (existing) return existing.slug;

  let candidate = slugify(base) || "partner";
  let attempt = candidate;
  for (let i = 2; i < 50; i++) {
    const taken = await q1<{ id: string }>(
      `select id from profile_slugs where slug = $1`,
      [attempt],
    );
    if (!taken) break;
    attempt = `${candidate}-${i}`;
  }
  const row = await q1<{ slug: string }>(
    `insert into profile_slugs (organization_id, slug, kind)
       values ($1, $2, $3)
     on conflict (organization_id) do update set slug = profile_slugs.slug
     returning slug`,
    [orgId, attempt, kind],
  );
  return row?.slug ?? attempt;
}

// ---- AI suggestions -------------------------------------------------------

export async function listSuggestions(orgId: string): Promise<AiSuggestion[]> {
  return q<AiSuggestion>(
    `select id, organization_id, source, source_ref, section, field,
            suggested_value, status, resolved_value
       from ai_profile_suggestions
      where organization_id = $1
      order by created_at asc`,
    [orgId],
  );
}

async function insertSuggestion(
  orgId: string,
  s: {
    source: string;
    sourceRef: string;
    section: string;
    field: string;
    value: unknown;
  },
): Promise<AiSuggestion> {
  const row = await q1<AiSuggestion>(
    `insert into ai_profile_suggestions
        (organization_id, source, source_ref, section, field, suggested_value, status)
       values ($1,$2,$3,$4,$5,$6,$7)
     returning id, organization_id, source, source_ref, section, field,
               suggested_value, status, resolved_value`,
    [
      orgId,
      s.source,
      s.sourceRef,
      s.section,
      s.field,
      JSON.stringify({ value: s.value, status: AI_PENDING }),
      AI_PENDING,
    ],
  );
  return row as AiSuggestion;
}

/**
 * Accept / edit / reject an AI suggestion. On accept/edit we promote the value
 * into the onboarding draft section so it becomes a real (partner-owned) field.
 */
export async function resolveSuggestion(
  orgId: string,
  suggestionId: string,
  action: "accepted" | "edited" | "rejected",
  resolvedValue?: unknown,
): Promise<AiSuggestion> {
  const sugg = await q1<AiSuggestion>(
    `update ai_profile_suggestions set
        status = $3,
        resolved_value = $4,
        updated_at = now()
      where organization_id = $1 and id = $2
      returning id, organization_id, source, source_ref, section, field,
                suggested_value, status, resolved_value`,
    [orgId, suggestionId, action, resolvedValue === undefined ? null : JSON.stringify({ value: resolvedValue })],
  );
  if (sugg && (action === "accepted" || action === "edited") && sugg.section && sugg.field) {
    const sv: any = sugg.suggested_value ?? {};
    const value = action === "edited" ? resolvedValue : sv.value;
    const draft = await q1<OnboardingDraft>(
      `select sections from onboarding_drafts where organization_id = $1`,
      [orgId],
    );
    const sections = ((draft?.sections as Record<string, any>) ?? {});
    const section = { ...(sections[sugg.section] ?? {}) };
    section[sugg.field] = value;
    sections[sugg.section] = section;
    await q(
      `update onboarding_drafts set sections = $2::jsonb, updated_at = now()
        where organization_id = $1`,
      [orgId, JSON.stringify(sections)],
    );
  }
  return sugg as AiSuggestion;
}

/**
 * Website intake. Records the URL and produces DETERMINISTIC, safe placeholder
 * suggestions (structure + neutral copy only). NEVER invents pricing, capacity,
 * insurance, or certifications. Each suggested field is created as a pending
 * AI suggestion the partner must verify.
 */
export async function intakeWebsite(
  orgId: string,
  url: string,
  linkType?: string,
): Promise<{ intake: { id: string; url: string }; suggestions: AiSuggestion[] }> {
  const clean = (url || "").trim();
  const intake = await q1<{ id: string; url: string }>(
    `insert into website_intakes (organization_id, url, link_type)
       values ($1, $2, $3)
     returning id, url`,
    [orgId, clean, linkType ?? guessLinkType(clean)],
  );

  // Derive a safe display name from the host (structure only).
  let host = "";
  try {
    host = new URL(clean.startsWith("http") ? clean : `https://${clean}`).hostname.replace(/^www\./, "");
  } catch {
    host = clean;
  }
  const namePlaceholder = host
    ? host.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Your business";

  const drafts: { section: string; field: string; value: unknown }[] = [
    { section: "basics", field: "name", value: namePlaceholder },
    {
      section: "basics",
      field: "tagline",
      value: "Add a short tagline that describes your offering.",
    },
    {
      section: "basics",
      field: "website",
      value: clean,
    },
    {
      section: "about",
      field: "body",
      value:
        "We imported your link as a starting point. Replace this with your own description of who you are, the experiences you create, and what makes your work distinctive. Nothing here is published until you review and approve it.",
    },
    {
      section: "services",
      field: "items",
      value: [
        { name: "Add a service", description: "Describe a service you offer." },
      ],
    },
    {
      section: "links",
      field: "primaryLink",
      value: clean,
    },
  ];

  const suggestions: AiSuggestion[] = [];
  for (const d of drafts) {
    suggestions.push(
      await insertSuggestion(orgId, {
        source: "website",
        sourceRef: clean,
        section: d.section,
        field: d.field,
        value: d.value,
      }),
    );
  }
  return { intake: intake as { id: string; url: string }, suggestions };
}

function guessLinkType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("google.")) return "google";
  if (u.includes("calendly") || u.includes("book")) return "booking";
  if (u.includes("behance") || u.includes("portfolio") || u.includes("dribbble")) return "portfolio";
  return "website";
}

/**
 * Document intake. Records a documents row (existing table) referencing the
 * uploaded file, and creates a pending AI suggestion noting that any fields
 * derived from the document must be verified. We do NOT read or assert the
 * document's contents (no invented insurance/certification facts).
 */
export async function intakeDocument(
  orgId: string,
  ownerUserId: string,
  doc: { fileUrl: string; documentType?: string; section?: string },
): Promise<{ document: { id: string }; suggestion: AiSuggestion }> {
  const document = await q1<{ id: string }>(
    `insert into documents
        (owner_id, organization_id, related_object_type, document_type, file_url,
         visibility, approval_status)
       values ($1,$2,'profile',$3,$4,'private','pending')
     returning id`,
    [ownerUserId, orgId, doc.documentType ?? "intake", doc.fileUrl],
  );
  const suggestion = await insertSuggestion(orgId, {
    source: "document",
    sourceRef: (document as { id: string }).id,
    section: doc.section ?? "documents",
    field: "uploaded",
    value: {
      fileUrl: doc.fileUrl,
      documentType: doc.documentType ?? "intake",
      note: "Document on file. Any details drawn from it must be verified before they appear on your profile.",
    },
  });
  return { document: document as { id: string }, suggestion };
}

// ---- Publish + public read ------------------------------------------------

/**
 * Move the profile toward publication. Free/partner tiers go to 'Pending Review'
 * for a light admin pass; once approved (or for self-publish flows) the profile
 * row in `profiles` is written/refreshed and status becomes 'Published'.
 *
 * `submit` -> Pending Review. `publish` -> writes profiles row + Published.
 */
export async function publishProfile(
  orgId: string,
  mode: "submit" | "publish",
): Promise<{ draft: OnboardingDraft; slug: string }> {
  const draft = await ensureDraft(orgId);
  const slug = await reserveSlug(
    orgId,
    ((draft.sections as any)?.basics?.name as string) || "partner",
    kindForRole(draft.role),
  );

  if (mode === "submit") {
    const d = await setCompletionStatus(orgId, "Pending Review");
    return { draft: d, slug };
  }

  // publish: upsert the public profiles row from the approved draft + theme.
  const theme = await getTheme(orgId);
  const sections = (draft.sections as Record<string, any>) ?? {};
  const hero = {
    title: sections.basics?.name ?? null,
    tagline: sections.basics?.tagline ?? null,
    cover_url: theme?.cover_url ?? null,
  };
  const publicSections = buildPublicSections(sections);
  const themeJson = theme
    ? {
        logo_url: theme.logo_url,
        cover_url: theme.cover_url,
        primary_color: theme.primary_color,
        secondary_color: theme.secondary_color,
        accent_color: theme.accent_color,
        button_style: theme.button_style,
      }
    : null;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into profiles
          (organization_id, kind, slug, public_url, template, theme, hero, about,
           sections, published_status, claim_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'published','owner_verified')
       on conflict (slug) do update set
          template = excluded.template,
          theme = excluded.theme,
          hero = excluded.hero,
          about = excluded.about,
          sections = excluded.sections,
          published_status = 'published'`,
      [
        orgId,
        kindForRole(draft.role),
        slug,
        `/${kindPlural(kindForRole(draft.role))}/${slug}`,
        theme?.template ?? null,
        themeJson ? JSON.stringify(themeJson) : null,
        JSON.stringify(hero),
        sections.about?.body ?? null,
        JSON.stringify(publicSections),
      ],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  const d = await setCompletionStatus(orgId, "Published");
  return { draft: d, slug };
}

function kindPlural(kind: string): string {
  const map: Record<string, string> = {
    venue: "venues",
    vendor: "vendors",
    planner: "planners",
    supplier: "suppliers",
    installer: "installers",
  };
  return map[kind] ?? "vendors";
}

/** Keep only public-safe sections (drop documents + internal-only data). */
function buildPublicSections(sections: Record<string, any>): Record<string, unknown> {
  return {
    about: sections.about?.body ?? null,
    services: Array.isArray(sections.services?.items) ? sections.services.items : [],
    packages: Array.isArray(sections.packages?.items) ? sections.packages.items : [],
    gallery: Array.isArray(sections.gallery?.images) ? sections.gallery.images : [],
    links: sections.links ?? {},
    location: {
      city: sections.basics?.city ?? null,
      region: sections.basics?.region ?? null,
    },
  };
}

export type PublicProfile = {
  slug: string;
  kind: string | null;
  // Owning organization id. Used to look up the company verification badge (U5)
  // shown in the profile header. Public, non-sensitive identifier.
  organization_id: string | null;
  organization: { name: string | null; tier: string | null; verification_status: string | null };
  template: string | null;
  theme: Record<string, unknown> | null;
  hero: Record<string, unknown> | null;
  about: string | null;
  sections: Record<string, unknown> | null;
  verified: boolean;
  // U5 verified badges embedded in the PUBLIC payload so that GUESTS
  // (unauthenticated visitors) see the same trust signals as signed-in users,
  // without any auth-gated request. Only this profile's own subject ids are
  // queried (company keyed on organization_id; venue keyed on the org's venue
  // ids), so this is IDOR-safe and bounded. The frontend filters to
  // verified === true (matching the VerifiedBadges component).
  badges: VerificationBadgeRow[];
};

/** Public read: only published profiles, only public fields. Null if not live. */
export async function getPublicProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const row = await q1<{
    slug: string;
    kind: string | null;
    template: string | null;
    theme: Record<string, unknown> | null;
    hero: Record<string, unknown> | null;
    about: string | null;
    sections: Record<string, unknown> | null;
    published_status: string | null;
    organization_id: string | null;
    org_name: string | null;
    tier: string | null;
    verification_status: string | null;
  }>(
    `select p.slug, p.kind, p.template, p.theme, p.hero, p.about, p.sections,
            p.published_status, o.id as organization_id,
            o.name as org_name, o.tier, o.verification_status
       from profiles p
       join organizations o on o.id = p.organization_id
      where p.slug = $1 and p.published_status = 'published'`,
    [slug],
  );
  if (!row) return null;

  // Public trust signals: embed the verified badges for this profile's own
  // subject ids so guests render them without an auth-gated request. We query
  // only ids that belong to this profile (the owning org for the company badge,
  // and this org's venue ids for the venue badge), keeping it IDOR-safe and
  // bounded to a couple of queries.
  const badges: VerificationBadgeRow[] = [];
  if (row.organization_id) {
    const companyBadges = await listBadges("company", { subjectId: row.organization_id });
    badges.push(...companyBadges);
    // For venue profiles, also surface the venue badge keyed on the venue id.
    // A venue belongs to this org (venues.organization_id); only this org's
    // venue ids are queried, so no cross-tenant exposure.
    if (row.kind === "venue") {
      const venueRows = await q<{ id: string }>(
        `select id from venues where organization_id = $1 order by created_at asc limit 50`,
        [row.organization_id],
      );
      for (const v of venueRows) {
        const venueBadges = await listBadges("venue", { subjectId: v.id });
        badges.push(...venueBadges);
      }
    }
  }

  return {
    slug: row.slug,
    kind: row.kind,
    organization_id: row.organization_id,
    organization: {
      name: row.org_name,
      tier: row.tier,
      verification_status: row.verification_status,
    },
    template: row.template,
    theme: row.theme,
    hero: row.hero,
    about: row.about,
    sections: row.sections,
    verified:
      row.verification_status === "verified" ||
      row.tier === "premier" ||
      row.tier === "partner",
    badges,
  };
}
