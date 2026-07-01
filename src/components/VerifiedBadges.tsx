import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { VerifiedBadge } from '../pages/LeadInbox';

/**
 * VerifiedBadges - Friction Elimination Upgrade 5 ("Verified Budget / Decision
 * Maker / Event / Company / Venue badges, displayed throughout"). A reusable
 * surface that renders the green VerifiedBadge chips for a subject's REAL,
 * verified badges. It reuses the existing presentational VerifiedBadge from
 * LeadInbox (the same chip already shown in the lead inbox) so the look is
 * consistent everywhere.
 *
 * Design: data-passed-in by default. List pages (marketplace, preferred
 * vendors) batch-fetch every visible row's badges ONCE via
 * GET /leads/badges/batch and pass each row its already-fetched badge array, so
 * there is no per-row request storm (no N+1). Single-subject pages (a public
 * profile) can instead pass subjectType + subjectId and let this component
 * self-fetch that one subject.
 *
 * Deterministic + honest: only badges whose `verified` flag is true render.
 * A subject with no verified badges renders nothing (returns null) - it never
 * fabricates a "verified" state.
 */

export type BadgeSubjectType =
  | 'budget'
  | 'decision_maker'
  | 'event'
  | 'company'
  | 'venue';

export type VerifiedBadgeData = {
  id?: string;
  subject_type: BadgeSubjectType | null;
  verified?: boolean | null;
};

/** Keep only the verified badges, de-duplicated by subject_type. */
function verifiedTypes(badges: VerifiedBadgeData[] | undefined): BadgeSubjectType[] {
  if (!Array.isArray(badges)) return [];
  const seen = new Set<BadgeSubjectType>();
  for (const b of badges) {
    if (b.verified && b.subject_type) seen.add(b.subject_type);
  }
  return Array.from(seen);
}

/**
 * Render the verified-badge chips for a subject from already-fetched data.
 * Prefer this on list pages (pass each row its batch-fetched `badges`).
 *
 * `only` optionally restricts which subject types are shown (e.g. a vendor card
 * shows only the 'company' badge, a venue shows only 'venue'); when omitted, all
 * verified types in the data render.
 */
export default function VerifiedBadges({
  badges,
  only,
  size = 'sm',
}: {
  badges: VerifiedBadgeData[] | undefined;
  only?: BadgeSubjectType[];
  size?: 'sm' | 'md';
}) {
  let types = verifiedTypes(badges);
  if (only && only.length > 0) {
    const allow = new Set(only);
    types = types.filter((t) => allow.has(t));
  }
  if (types.length === 0) return null;
  return (
    <span
      className={`vbs vbs-${size}`}
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
    >
      {types.map((t) => (
        <VerifiedBadge key={t} subjectType={t} verified />
      ))}
    </span>
  );
}

/**
 * Self-fetching single-subject variant for profile-style pages. Fetches one
 * subject's badges (GET /leads/badges) and renders the verified chips. Safe to
 * use when there is exactly one subject on the page; do NOT use this inside a
 * list .map() (that would be the per-row N+1 this component exists to avoid -
 * use the batch fetch + default VerifiedBadges there instead).
 */
export function VerifiedBadgesForSubject({
  subjectType,
  subjectId,
  only,
  size = 'sm',
}: {
  subjectType: BadgeSubjectType;
  subjectId: string | null | undefined;
  only?: BadgeSubjectType[];
  size?: 'sm' | 'md';
}) {
  const [badges, setBadges] = useState<VerifiedBadgeData[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!subjectId) {
      setBadges([]);
      return;
    }
    apiGet<{ badges: VerifiedBadgeData[] }>(
      `/leads/badges?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(
        subjectId,
      )}`,
    )
      .then((r) => {
        if (!cancelled) setBadges(Array.isArray(r.badges) ? r.badges : []);
      })
      .catch(() => {
        if (!cancelled) setBadges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectType, subjectId]);

  return <VerifiedBadges badges={badges} only={only} size={size} />;
}

/**
 * Batch fetch helper for list pages. Calls GET /leads/badges/batch once for all
 * ids of a single subject_type and returns the { subjectId: Badge[] } map.
 * Best-effort: resolves to an empty map on any error so a list never fails to
 * render because the trust signal could not be loaded.
 */
export async function fetchBadgesBatch(
  subjectType: BadgeSubjectType,
  subjectIds: Array<string | null | undefined>,
): Promise<Record<string, VerifiedBadgeData[]>> {
  const ids = Array.from(
    new Set(subjectIds.filter((s): s is string => typeof s === 'string' && s.length > 0)),
  );
  if (ids.length === 0) return {};
  try {
    const r = await apiGet<{ badges: Record<string, VerifiedBadgeData[]> }>(
      `/leads/badges/batch?subject_type=${encodeURIComponent(subjectType)}&subject_ids=${encodeURIComponent(
        ids.join(','),
      )}`,
    );
    return r.badges ?? {};
  } catch {
    return {};
  }
}
