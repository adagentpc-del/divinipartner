-- ============================================================================
-- Divini Partners - PROFILE DECKS + PROGRAMS (every profile: venue, vendor,
-- sponsor, nonprofit).
--
-- (1) profile_decks: pitch decks / marketing collateral uploaded by a profile
--     owner. Files are stored on local disk via the existing storage helper
--     (server/src/storage.ts writeFile + signDownloadUrl), exactly like the
--     native e-signature PDFs. We keep the storage_key (relative disk key) plus
--     an optional file_url for externally hosted collateral, the original file
--     name + content type, a kind label, and a public|private visibility flag.
--     Owner is the organization (organization_id) plus the uploading user
--     (owner_id), mirroring the existing `documents` table party convention.
--
-- (2) profile_programs: custom programs / offerings a profile publishes on its
--     public profile (a named offering with summary, details, price/terms copy,
--     and a call to action). active + sort control whether and where it shows.
--
-- Both tables are organization-scoped. Public reads return only public decks +
-- active programs for a PUBLISHED profile (see server/src/db/profile-extras.ts).
--
-- Additive + idempotent. Apply AFTER db/schema.sql (organizations, users,
-- profiles, profile_slugs, documents) against the same database:
--   psql "postgres://aibos:<pw>@localhost:5433/divini_partners" -f db/schema-profile-decks-programs.sql
--
-- Conventions match schema.sql: uuid PKs via gen_random_uuid(); timestamptz
-- defaults; on delete cascade to the owning organization. Zero em dashes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- profile_decks ----------
-- A pitch deck or piece of marketing collateral attached to a profile. The
-- bytes live on disk under storage_key (relative key passed to readPath /
-- signDownloadUrl); file_url holds an externally hosted link when there is no
-- uploaded file. visibility 'public' decks render on the public profile.
create table if not exists profile_decks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid references users(id) on delete set null,
  title text not null,
  kind text not null default 'deck'
    check (kind in ('deck','brochure','one_pager','case_study','media_kit','other')),
  storage_key text,
  file_url text,
  file_name text,
  content_type text,
  size_bytes bigint,
  visibility text not null default 'public'
    check (visibility in ('public','private')),
  sort int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_profile_decks_org on profile_decks (organization_id);
create index if not exists idx_profile_decks_visibility on profile_decks (organization_id, visibility);

-- ---------- profile_programs ----------
-- A custom program / offering a profile publishes (named offering with summary,
-- longer details, price/terms copy, and a call to action). active controls
-- whether it shows on the public profile; sort orders the list.
create table if not exists profile_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid references users(id) on delete set null,
  title text not null,
  summary text,
  details text,
  price_terms text,
  cta_label text,
  cta_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profile_programs_org on profile_programs (organization_id);
create index if not exists idx_profile_programs_active on profile_programs (organization_id, active);
