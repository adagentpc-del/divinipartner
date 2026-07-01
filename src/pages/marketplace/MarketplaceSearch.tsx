import React, { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import VerifiedBadges, {
  fetchBadgesBatch,
  type VerifiedBadgeData,
} from '../../components/VerifiedBadges';

/**
 * MarketplaceSearch (blueprint 38 + 40) - the real, data-backed marketplace
 * search over PUBLISHED public profiles. Reads /api/marketplace/search +
 * /api/marketplace/meta. Public, approved fields only; no private pricing.
 */
type Result = {
  slug: string | null;
  kind: string | null;
  organization_id: string | null;
  name: string | null;
  about: string | null;
  region: string | null;
  city: string | null;
  category: string | null;
  capacity: number | null;
  review_score: number | null;
  preferred: boolean;
  premier: boolean;
  // Pricing V2 Featured Vendor advertising upgrade. Optional so the card is safe
  // whether or not the search endpoint supplies it yet (absent = no badge).
  featured?: boolean;
};
type Facets = { kinds: string[]; categories: string[]; regions: string[] };

export default function MarketplaceSearch() {
  const [facets, setFacets] = useState<Facets>({ kinds: [], categories: [], regions: [] });
  const [sorts, setSorts] = useState<string[]>(['relevance', 'rating', 'newest', 'name']);
  const [rows, setRows] = useState<Result[]>([]);
  // Verified badges (U5) keyed by organization id, batch-fetched once per result
  // set so each card can show its company's verified badge without an N+1 storm.
  const [badges, setBadges] = useState<Record<string, VerifiedBadgeData[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [capacityMin, setCapacityMin] = useState('');
  const [ratingMin, setRatingMin] = useState('');
  const [premierOnly, setPremierOnly] = useState(false);
  const [sort, setSort] = useState('relevance');

  useEffect(() => {
    apiGet<{ sorts: string[]; facets: Facets }>('/marketplace/meta')
      .then((r) => { setFacets(r.facets); setSorts(r.sorts); })
      .catch(() => {});
  }, []);

  async function search() {
    setLoading(true);
    setErr(null);
    try {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (kind) p.set('kind', kind);
      if (category) p.set('category', category);
      if (region) p.set('region', region);
      if (capacityMin) p.set('capacity_min', capacityMin);
      if (ratingMin) p.set('rating_min', ratingMin);
      if (premierOnly) p.set('premier', 'true');
      if (sort) p.set('sort', sort);
      const r = await apiGet<{ results: Result[] }>(`/marketplace/search?${p.toString()}`);
      setRows(r.results);
      // One batch request for all visible result orgs (no per-card fetch).
      const orgIds = r.results.map((x) => x.organization_id);
      setBadges(await fetchBadgesBatch('company', orgIds));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void search(); /* eslint-disable-next-line */ }, [kind, category, region, sort, premierOnly]);

  return (
    <div className="ms">
      <style>{MS_CSS}</style>
      <header className="ms-head">
        <span className="ms-kicker">Marketplace</span>
        <h1 className="ms-title">Find your partners</h1>
        <p className="ms-sub">Search published venues, vendors, and planners. All listing details shown are public.</p>
      </header>

      <div className="ms-search">
        <input
          className="ms-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(); }}
          placeholder="Search by name, category, or keyword"
        />
        <button type="button" className="ms-btn" onClick={() => void search()}>Search</button>
      </div>

      <div className="ms-filters">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {facets.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {facets.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="number" className="ms-num" value={capacityMin} onChange={(e) => setCapacityMin(e.target.value)} placeholder="Min capacity" onBlur={() => void search()} />
        <input type="number" className="ms-num" value={ratingMin} onChange={(e) => setRatingMin(e.target.value)} placeholder="Min rating" onBlur={() => void search()} />
        <label className="ms-check"><input type="checkbox" checked={premierOnly} onChange={(e) => setPremierOnly(e.target.checked)} /> Premier only</label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {sorts.map((s) => <option key={s} value={s}>Sort: {s}</option>)}
        </select>
      </div>

      {err ? <p className="ms-err">{err}</p> : null}

      {loading ? (
        <p className="ms-muted">Searching...</p>
      ) : rows.length === 0 ? (
        <div className="ms-empty"><p>No published listings match your filters yet.</p></div>
      ) : (
        <div className="ms-grid">
          {rows.map((r) => (
            <a key={r.slug ?? r.organization_id} className="ms-card" href={r.slug ? `/p/${r.slug}` : undefined}>
              <div className="ms-card-top">
                <span className="ms-kindtag">{r.kind ?? 'partner'}</span>
                {r.featured ? <span className="ms-featured">Featured</span> : r.premier ? <span className="ms-premier">Premier</span> : r.preferred ? <span className="ms-preferred">Preferred</span> : null}
              </div>
              <h3 className="ms-name">{r.name ?? 'Listing'}</h3>
              {r.organization_id ? (
                <VerifiedBadges
                  badges={badges[r.organization_id]}
                  only={['company']}
                />
              ) : null}
              <div className="ms-meta">
                {r.category ? <span className="ms-cap">{r.category}</span> : null}
                {r.city || r.region ? <span>{[r.city, r.region].filter(Boolean).join(', ')}</span> : null}
                {r.capacity ? <span>Up to {r.capacity}</span> : null}
                {r.review_score != null ? <span className="ms-rating">{Number(r.review_score).toFixed(1)} rating</span> : null}
              </div>
              {r.about ? <p className="ms-about">{r.about}</p> : null}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const MS_CSS = `
.ms {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.ms *, .ms *::before, .ms *::after { box-sizing: border-box; }
.ms h1, .ms h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ms-head { margin-bottom: 16px; }
.ms-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.ms-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.ms-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.ms-muted { color: var(--dp-muted); font-size: 13px; }
.ms-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.ms-search { display: flex; gap: 10px; margin-bottom: 12px; }
.ms-q { flex: 1 1 auto; font: inherit; font-size: 14px; padding: 11px 14px; border: 1px solid var(--dp-line); border-radius: 10px; background: #fff; }
.ms-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 600; padding: 0 20px; cursor: pointer; }
.ms-btn:hover { background: var(--dp-emerald-2); }
.ms-filters { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; margin-bottom: 18px; }
.ms-filters select, .ms-num { font: inherit; font-size: 12.5px; padding: 8px 11px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; }
.ms-num { width: 130px; }
.ms-check { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dp-ink); }
.ms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.ms-card { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 17px; text-decoration: none; color: inherit; transition: border-color .15s ease, transform .15s ease; }
.ms-card:hover { border-color: var(--dp-gold); transform: translateY(-1px); }
.ms-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ms-kindtag { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; font-weight: 600; color: var(--dp-emerald); background: rgba(18,60,46,.07); border-radius: 999px; padding: 2px 9px; }
.ms-premier { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; color: #8a6d27; background: rgba(201,163,91,.2); border: 1px solid rgba(201,163,91,.5); border-radius: 999px; padding: 1px 8px; }
.ms-featured { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; color: #123c2e; background: linear-gradient(90deg, rgba(201,163,91,.32), rgba(201,163,91,.18)); border: 1px solid rgba(201,163,91,.7); border-radius: 999px; padding: 1px 9px; }
.ms-preferred { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; color: #1E5D4A; background: rgba(30,93,74,.1); border-radius: 999px; padding: 1px 8px; }
.ms-name { font-size: 21px; color: var(--dp-emerald); }
.ms-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; font-size: 12px; color: var(--dp-muted); }
.ms-cap { text-transform: capitalize; }
.ms-rating { color: #8a6d27; font-weight: 600; }
.ms-about { margin: 0; font-size: 13px; color: #4a463e; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ms-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 40px; background: rgba(247,244,238,.55); text-align: center; }
.ms-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
`;
