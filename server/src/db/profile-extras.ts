/**
 * Divini Partners - data layer for PROFILE DECKS + PROGRAMS.
 *
 * Every profile (venue, vendor, sponsor, nonprofit) can (1) upload pitch decks /
 * marketing collateral and (2) publish custom programs / offerings on its public
 * profile. Both are organization-scoped: owner-facing calls take orgId (from
 * getActor(...).org.id); the only cross-org reads are the public listers, which
 * resolve a slug to its owning org via profile_slugs and return only PUBLIC
 * decks + ACTIVE programs.
 *
 * Deck files are stored on local disk through the existing storage helper
 * (server/src/storage.ts: writeFile + signDownloadUrl), the same mechanism the
 * native e-signature route uses. We persist the relative storage_key here; the
 * route layer turns it into a short-lived signed download URL.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";

export type DeckKind =
  | "deck"
  | "brochure"
  | "one_pager"
  | "case_study"
  | "media_kit"
  | "other";

export const DECK_KINDS: DeckKind[] = [
  "deck",
  "brochure",
  "one_pager",
  "case_study",
  "media_kit",
  "other",
];

export type ProfileDeck = {
  id: string;
  organization_id: string;
  owner_id: string | null;
  title: string;
  kind: string;
  storage_key: string | null;
  file_url: string | null;
  file_name: string | null;
  content_type: string | null;
  size_bytes: string | null;
  visibility: string;
  sort: number;
  created_at: string;
};

export type ProfileProgram = {
  id: string;
  organization_id: string;
  owner_id: string | null;
  title: string;
  summary: string | null;
  details: string | null;
  price_terms: string | null;
  cta_label: string | null;
  cta_url: string | null;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
};

const DECK_COLS = `id, organization_id, owner_id, title, kind, storage_key, file_url,
  file_name, content_type, size_bytes, visibility, sort, created_at`;

const PROGRAM_COLS = `id, organization_id, owner_id, title, summary, details,
  price_terms, cta_label, cta_url, active, sort, created_at, updated_at`;

function safeKind(kind: string | null | undefined): DeckKind {
  return kind && (DECK_KINDS as string[]).includes(kind) ? (kind as DeckKind) : "deck";
}

// ---- Decks: owner-facing -------------------------------------------------

export async function listDecks(orgId: string): Promise<ProfileDeck[]> {
  return q<ProfileDeck>(
    `select ${DECK_COLS} from profile_decks
      where organization_id = $1
      order by sort asc, created_at desc`,
    [orgId],
  );
}

export async function getDeck(orgId: string, id: string): Promise<ProfileDeck | null> {
  return q1<ProfileDeck>(
    `select ${DECK_COLS} from profile_decks where organization_id = $1 and id = $2`,
    [orgId, id],
  );
}

export async function insertDeck(
  orgId: string,
  ownerUserId: string | null,
  deck: {
    title: string;
    kind?: string | null;
    storageKey?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    contentType?: string | null;
    sizeBytes?: number | null;
    visibility?: string | null;
  },
): Promise<ProfileDeck> {
  const visibility = deck.visibility === "private" ? "private" : "public";
  const row = await q1<ProfileDeck>(
    `insert into profile_decks
        (organization_id, owner_id, title, kind, storage_key, file_url,
         file_name, content_type, size_bytes, visibility)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning ${DECK_COLS}`,
    [
      orgId,
      ownerUserId,
      deck.title,
      safeKind(deck.kind),
      deck.storageKey ?? null,
      deck.fileUrl ?? null,
      deck.fileName ?? null,
      deck.contentType ?? null,
      deck.sizeBytes ?? null,
      visibility,
    ],
  );
  return row as ProfileDeck;
}

export async function updateDeck(
  orgId: string,
  id: string,
  patch: { title?: string; kind?: string; visibility?: string; sort?: number },
): Promise<ProfileDeck | null> {
  return q1<ProfileDeck>(
    `update profile_decks set
        title = coalesce($3, title),
        kind = coalesce($4, kind),
        visibility = coalesce($5, visibility),
        sort = coalesce($6, sort)
      where organization_id = $1 and id = $2
      returning ${DECK_COLS}`,
    [
      orgId,
      id,
      patch.title ?? null,
      patch.kind ? safeKind(patch.kind) : null,
      patch.visibility === "public" || patch.visibility === "private" ? patch.visibility : null,
      typeof patch.sort === "number" ? patch.sort : null,
    ],
  );
}

export async function deleteDeck(orgId: string, id: string): Promise<ProfileDeck | null> {
  return q1<ProfileDeck>(
    `delete from profile_decks where organization_id = $1 and id = $2 returning ${DECK_COLS}`,
    [orgId, id],
  );
}

// ---- Programs: owner-facing ----------------------------------------------

export async function listPrograms(orgId: string): Promise<ProfileProgram[]> {
  return q<ProfileProgram>(
    `select ${PROGRAM_COLS} from profile_programs
      where organization_id = $1
      order by sort asc, created_at desc`,
    [orgId],
  );
}

export async function insertProgram(
  orgId: string,
  ownerUserId: string | null,
  p: {
    title: string;
    summary?: string | null;
    details?: string | null;
    priceTerms?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    active?: boolean;
    sort?: number;
  },
): Promise<ProfileProgram> {
  const row = await q1<ProfileProgram>(
    `insert into profile_programs
        (organization_id, owner_id, title, summary, details, price_terms,
         cta_label, cta_url, active, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning ${PROGRAM_COLS}`,
    [
      orgId,
      ownerUserId,
      p.title,
      p.summary ?? null,
      p.details ?? null,
      p.priceTerms ?? null,
      p.ctaLabel ?? null,
      p.ctaUrl ?? null,
      p.active === false ? false : true,
      typeof p.sort === "number" ? p.sort : 0,
    ],
  );
  return row as ProfileProgram;
}

export async function updateProgram(
  orgId: string,
  id: string,
  patch: {
    title?: string;
    summary?: string | null;
    details?: string | null;
    priceTerms?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    active?: boolean;
    sort?: number;
  },
): Promise<ProfileProgram | null> {
  return q1<ProfileProgram>(
    `update profile_programs set
        title = coalesce($3, title),
        summary = coalesce($4, summary),
        details = coalesce($5, details),
        price_terms = coalesce($6, price_terms),
        cta_label = coalesce($7, cta_label),
        cta_url = coalesce($8, cta_url),
        active = coalesce($9, active),
        sort = coalesce($10, sort),
        updated_at = now()
      where organization_id = $1 and id = $2
      returning ${PROGRAM_COLS}`,
    [
      orgId,
      id,
      patch.title ?? null,
      patch.summary === undefined ? null : patch.summary,
      patch.details === undefined ? null : patch.details,
      patch.priceTerms === undefined ? null : patch.priceTerms,
      patch.ctaLabel === undefined ? null : patch.ctaLabel,
      patch.ctaUrl === undefined ? null : patch.ctaUrl,
      typeof patch.active === "boolean" ? patch.active : null,
      typeof patch.sort === "number" ? patch.sort : null,
    ],
  );
}

export async function deleteProgram(orgId: string, id: string): Promise<ProfileProgram | null> {
  return q1<ProfileProgram>(
    `delete from profile_programs where organization_id = $1 and id = $2 returning ${PROGRAM_COLS}`,
    [orgId, id],
  );
}

// ---- Public reads (by slug) ----------------------------------------------

/** Resolve a profile slug to its owning organization id, only when published. */
async function publishedOrgIdForSlug(slug: string): Promise<string | null> {
  const row = await q1<{ organization_id: string }>(
    `select organization_id from profiles
      where slug = $1 and published_status = 'published'`,
    [slug],
  );
  return row?.organization_id ?? null;
}

export type PublicDeck = {
  id: string;
  title: string;
  kind: string;
  file_name: string | null;
  content_type: string | null;
  storage_key: string | null;
  file_url: string | null;
};

/** Public decks for a published profile (visibility 'public' only). */
export async function listPublicDecks(slug: string): Promise<PublicDeck[]> {
  const orgId = await publishedOrgIdForSlug(slug);
  if (!orgId) return [];
  return q<PublicDeck>(
    `select id, title, kind, file_name, content_type, storage_key, file_url
       from profile_decks
      where organization_id = $1 and visibility = 'public'
      order by sort asc, created_at desc`,
    [orgId],
  );
}

export type PublicProgram = {
  id: string;
  title: string;
  summary: string | null;
  details: string | null;
  price_terms: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

/** Active programs for a published profile. */
export async function listPublicPrograms(slug: string): Promise<PublicProgram[]> {
  const orgId = await publishedOrgIdForSlug(slug);
  if (!orgId) return [];
  return q<PublicProgram>(
    `select id, title, summary, details, price_terms, cta_label, cta_url
       from profile_programs
      where organization_id = $1 and active = true
      order by sort asc, created_at desc`,
    [orgId],
  );
}

/** Public deck row by id, only when its profile is published + the deck public. */
export async function getPublicDeckById(slug: string, id: string): Promise<PublicDeck | null> {
  const orgId = await publishedOrgIdForSlug(slug);
  if (!orgId) return null;
  return q1<PublicDeck>(
    `select id, title, kind, file_name, content_type, storage_key, file_url
       from profile_decks
      where organization_id = $1 and id = $2 and visibility = 'public'`,
    [orgId, id],
  );
}
