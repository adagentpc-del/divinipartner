/**
 * Shareable bid link helpers (client side).
 *
 * A vendor/sponsor lands on /b/:token, registers, and submits. We stash the
 * share context so it survives account creation + verification, fire funnel
 * events to the public tracking endpoint, and read the stash back after
 * onboarding to complete attribution.
 *
 * The tracking endpoint is public (no auth), so these fire for signed-out users
 * too. All calls are best-effort: a tracking failure never blocks the user.
 */
import { apiSend } from './api';

const KEY = 'divini.bidshare';

export type BidShareStash = {
  token: string;
  bidId: string;
  eventId: string | null;
  audience: 'vendor' | 'sponsor' | 'any';
};

export function stashBidShare(s: BidShareStash): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}

export function readBidShare(): BidShareStash | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BidShareStash) : null;
  } catch {
    return null;
  }
}

export function clearBidShare(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Fire a funnel event for a share token. Best-effort, never throws. */
export async function trackBidShare(
  token: string,
  kind: 'view' | 'register_start' | 'registered' | 'submitted',
  ctx?: { email?: string | null; org_id?: string | null; meta?: unknown },
): Promise<void> {
  try {
    await apiSend('POST', `/public/bids/${encodeURIComponent(token)}/track`, { kind, ...ctx });
  } catch {
    /* best-effort */
  }
}

/**
 * Call after onboarding completes: if the user arrived via a share link, mark
 * them registered and return where to send them to submit. Clears the stash.
 */
export async function completeBidShareRegistration(
  ctx?: { email?: string | null; org_id?: string | null },
): Promise<{ next: string } | null> {
  const s = readBidShare();
  if (!s) return null;
  await trackBidShare(s.token, 'registered', ctx);
  clearBidShare();
  // Route them to the bid to submit (vendors: quote; sponsors: sponsorship).
  const next =
    s.audience === 'sponsor'
      ? s.eventId
        ? `/sponsorship-packages?event=${encodeURIComponent(s.eventId)}`
        : '/sponsorships'
      : `/bids?bid=${encodeURIComponent(s.bidId)}`;
  return { next };
}
