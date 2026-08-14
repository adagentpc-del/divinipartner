// Client-side types + formatters for the plan catalog fetched from
// GET /api/plans (server/src/lib/planCatalog.ts is the single source of
// truth for the actual numbers; this file only shapes/labels them for
// display, so GetStarted.tsx and the public Pricing page never disagree).

export type Role = 'venue' | 'vendor' | 'supplier' | 'installer' | 'planner' | 'client' | 'sponsor' | 'nonprofit';

export type CatalogTier = {
  key: string;
  label: string;
  monthlyUsd: number | null;
  annualUsd?: number | null;
  platformFeeRate: number | null;
  feeCapCents?: number | null;
  seatsIncluded?: number;
  features: string[];
  priceNote?: string;
};

export type RoleCatalog = { role: Role; displayName: string; tiers: CatalogTier[] };

export function priceLabel(t: CatalogTier): string {
  if (t.monthlyUsd === 0) return 'Free';
  if (t.monthlyUsd != null) return `$${t.monthlyUsd}`;
  return t.priceNote ?? 'Custom';
}

export function pricePeriod(t: CatalogTier): string {
  if (t.monthlyUsd === 0) return 'always';
  if (t.monthlyUsd != null) return 'per month';
  return t.priceNote ? '' : 'contact us';
}

export function feeLabel(t: CatalogTier): string {
  if (t.platformFeeRate == null) return 'No platform fee';
  const pct = (t.platformFeeRate * 100).toFixed((t.platformFeeRate * 100) % 1 === 0 ? 0 : 1);
  const cap = t.feeCapCents ? `, capped $${(t.feeCapCents / 100).toLocaleString()}/event` : '';
  return `${pct}% platform fee${cap}`;
}

/** organizations.tier value for a catalog tier's position (0=free, 1=plus/team,
 *  2=pro). Matches server/src/lib/planCatalog.ts's TIER_LEVEL mapping, inverted. */
export function tierEnumForLevel(role: Role, level: number): 'client' | 'free_partner' | 'partner' | 'premier' {
  if (level === 0) return role === 'client' ? 'client' : 'free_partner';
  return level === 1 ? 'partner' : 'premier';
}
