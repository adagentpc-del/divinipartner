import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

/**
 * Auto-generated marketplace SEO landing page (public, no login).
 *
 * Route: /discover/:type/:slug  where type is "venues" | "vendors" and the slug
 * encodes a category and an optional city, e.g.
 *   /discover/venues/ballrooms-miami
 *   /discover/vendors/wedding-florists-austin
 *
 * The page renders an SEO H1, an intro paragraph, a filtered grid of marketplace
 * cards (fetched live from the public marketplace search API, filtered by
 * category and city, with a sample state if nothing is published yet), internal
 * links to related categories and cities, JSON-LD structured data, and a clear
 * call to action. Document title and meta description are set on mount.
 *
 * Brand language reuses src/pages/public/Marketplace.tsx (emerald / gold / ivory,
 * Cormorant + Inter).
 */

const NAV: { label: string; to: string }[] = [
  { label: 'For Venues', to: '/for-venues' },
  { label: 'For Vendors', to: '/for-vendors' },
  { label: 'For Planners', to: '/for-planners' },
  { label: 'For Clients', to: '/for-clients' },
  { label: 'Marketplace', to: '/marketplace' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
];

// Venue categories: slug fragment -> { label (singular), plural, db category }.
export const VENUE_CATEGORIES: { slug: string; label: string; plural: string; category: string }[] = [
  { slug: 'ballrooms', label: 'Ballroom', plural: 'Ballrooms', category: 'Ballrooms' },
  { slug: 'estates-and-mansions', label: 'Estate and mansion', plural: 'Estates and Mansions', category: 'Estates and Mansions' },
  { slug: 'rooftops', label: 'Rooftop', plural: 'Rooftops', category: 'Rooftops' },
  { slug: 'gardens', label: 'Garden', plural: 'Gardens', category: 'Gardens' },
  { slug: 'hotels-and-resorts', label: 'Hotel and resort', plural: 'Hotels and Resorts', category: 'Hotels and Resorts' },
  { slug: 'vineyards', label: 'Vineyard', plural: 'Vineyards', category: 'Vineyards' },
  { slug: 'lofts-and-warehouses', label: 'Loft and warehouse', plural: 'Lofts and Warehouses', category: 'Lofts and Warehouses' },
  { slug: 'waterfront', label: 'Waterfront', plural: 'Waterfront venues', category: 'Waterfront' },
  { slug: 'barns-and-farms', label: 'Barn and farm', plural: 'Barns and Farms', category: 'Barns and Farms' },
  { slug: 'galleries-and-museums', label: 'Gallery and museum', plural: 'Galleries and Museums', category: 'Galleries and Museums' },
];

// Vendor categories: slug fragment -> { label, plural, db category }.
export const VENDOR_CATEGORIES: { slug: string; label: string; plural: string; category: string }[] = [
  { slug: 'caterers', label: 'Caterer', plural: 'Caterers', category: 'Catering' },
  { slug: 'florists', label: 'Florist', plural: 'Florists', category: 'Florals' },
  { slug: 'photographers', label: 'Photographer', plural: 'Photographers', category: 'Photography' },
  { slug: 'videographers', label: 'Videographer', plural: 'Videographers', category: 'Videography' },
  { slug: 'entertainment', label: 'Entertainment', plural: 'Entertainment', category: 'Entertainment' },
  { slug: 'djs-and-music', label: 'DJ and music', plural: 'DJs and Music', category: 'Music and DJ' },
  { slug: 'rentals', label: 'Rental', plural: 'Rentals', category: 'Rentals' },
  { slug: 'lighting-and-production', label: 'Lighting and production', plural: 'Lighting and Production', category: 'Lighting and Production' },
  { slug: 'decor-and-design', label: 'Decor and design', plural: 'Decor and Design', category: 'Decor and Design' },
  { slug: 'bar-and-beverage', label: 'Bar and beverage', plural: 'Bar and Beverage', category: 'Bar and Beverage' },
  { slug: 'bakeries-and-cakes', label: 'Bakery and cake', plural: 'Bakeries and Cakes', category: 'Bakery and Cake' },
  { slug: 'hair-and-makeup', label: 'Hair and makeup', plural: 'Hair and Makeup', category: 'Hair and Makeup' },
  { slug: 'transportation', label: 'Transportation', plural: 'Transportation', category: 'Transportation' },
  { slug: 'stationery', label: 'Stationery', plural: 'Stationery', category: 'Stationery' },
  { slug: 'officiants', label: 'Officiant', plural: 'Officiants', category: 'Officiants' },
  { slug: 'staffing', label: 'Staffing', plural: 'Staffing', category: 'Staffing' },
];

// Major US cities the matrix is generated against. slug -> { city, region }.
export const DISCOVER_CITIES: { slug: string; city: string; region: string }[] = [
  { slug: 'new-york', city: 'New York', region: 'New York' },
  { slug: 'los-angeles', city: 'Los Angeles', region: 'California' },
  { slug: 'chicago', city: 'Chicago', region: 'Illinois' },
  { slug: 'houston', city: 'Houston', region: 'Texas' },
  { slug: 'miami', city: 'Miami', region: 'Florida' },
  { slug: 'dallas', city: 'Dallas', region: 'Texas' },
  { slug: 'atlanta', city: 'Atlanta', region: 'Georgia' },
  { slug: 'austin', city: 'Austin', region: 'Texas' },
  { slug: 'seattle', city: 'Seattle', region: 'Washington' },
  { slug: 'denver', city: 'Denver', region: 'Colorado' },
  { slug: 'nashville', city: 'Nashville', region: 'Tennessee' },
  { slug: 'san-diego', city: 'San Diego', region: 'California' },
];

type DiscoverType = 'venues' | 'vendors';

type ParsedSlug = {
  cat: { slug: string; label: string; plural: string; category: string };
  city: { slug: string; city: string; region: string } | null;
};

/**
 * Parse a slug like "ballrooms-miami" into a category and an optional city.
 * Strategy: try every known city suffix first (longest match wins), then resolve
 * the remaining prefix against the category list for this type.
 */
export function parseSlug(type: DiscoverType, slug: string): ParsedSlug | null {
  const cats = type === 'venues' ? VENUE_CATEGORIES : VENDOR_CATEGORIES;
  const lower = (slug || '').toLowerCase();

  // City suffix (try longest city slug first so "san-diego" beats a stray match).
  const cities = [...DISCOVER_CITIES].sort((a, b) => b.slug.length - a.slug.length);
  let city: ParsedSlug['city'] = null;
  let rest = lower;
  for (const c of cities) {
    if (lower === `${c.slug}` || lower.endsWith(`-${c.slug}`)) {
      city = c;
      rest = lower === c.slug ? '' : lower.slice(0, lower.length - c.slug.length - 1);
      break;
    }
  }

  const cat = cats.find((c) => c.slug === rest);
  if (!cat) return null;
  return { cat, city };
}

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

type Listing = {
  slug: string | null;
  kind: string | null;
  name: string | null;
  about: string | null;
  region: string | null;
  city: string | null;
  category: string | null;
  capacity: number | null;
  review_score: number | null;
  premier: boolean;
};

// Sample fallback cards (shown when the live marketplace has no published match).
const SAMPLE_ARTS = ['a', 'b', 'c', 'd', 'a', 'c'];
function sampleListings(label: string, place: string): Listing[] {
  const names = [
    `The ${label} Collective`, `${place} ${label} House`, `Maison ${label}`,
    `${label} and Co.`, `The ${place} ${label}`, `Atelier ${label}`,
  ];
  return names.map((n, i) => ({
    slug: null, kind: null, name: n, about: null,
    region: place, city: place, category: label, capacity: null,
    review_score: 4.7 + (i % 3) * 0.1, premier: i === 0,
  }));
}

function artFor(i: number): string {
  return SAMPLE_ARTS[i % SAMPLE_ARTS.length];
}

export default function CategoryLanding() {
  const nav = useNavigate();
  const { type, slug } = useParams<{ type: string; slug: string }>();
  const join = () => nav('/register');
  const login = () => nav('/login');

  const dtype: DiscoverType | null = type === 'venues' || type === 'vendors' ? type : null;
  const parsed = useMemo(() => (dtype && slug ? parseSlug(dtype, slug) : null), [dtype, slug]);

  const [live, setLive] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Human-readable bits used across copy, title, JSON-LD.
  const place = parsed?.city?.city ?? null;
  const plural = parsed?.cat.plural ?? '';
  const h1 = parsed
    ? place
      ? `${plural} in ${place}`
      : `${plural} on Divini Partners`
    : 'Discover venues and vendors';
  const intro = parsed
    ? place
      ? `Browse vetted ${plural.toLowerCase()} in ${place} for weddings, galas, and corporate events. Compare profiles, reviews, and starting rates in one place, then request quotes from the partners that fit your vision.`
      : `Browse vetted ${plural.toLowerCase()} for weddings, galas, and corporate events across the country. Compare profiles, reviews, and starting rates in one place, then request quotes from the partners that fit your vision.`
    : '';

  const metaDesc = parsed
    ? place
      ? `Find and compare ${plural.toLowerCase()} in ${place}. Vetted ${dtype} on Divini Partners, the premium event partnership marketplace. Request quotes and book with confidence.`
      : `Find and compare ${plural.toLowerCase()}. Vetted ${dtype} on Divini Partners, the premium event partnership marketplace. Request quotes and book with confidence.`
    : 'Discover vetted event venues and vendors on Divini Partners.';

  // Fetch a filtered slice from the public marketplace search API.
  useEffect(() => {
    if (!dtype || !parsed) return;
    let mounted = true;
    setLoading(true);
    const kind = dtype === 'venues' ? 'venue' : 'vendor';
    const params = new URLSearchParams({ kind, category: parsed.cat.category, limit: '12' });
    if (parsed.city) params.set('city', parsed.city.city);
    fetch(`${BASE}/api/marketplace/search?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search failed'))))
      .then((d: { results?: Listing[] }) => {
        if (mounted) { setLive(Array.isArray(d.results) ? d.results : []); setLoading(false); }
      })
      .catch(() => { if (mounted) { setLive([]); setLoading(false); } });
    return () => { mounted = false; };
  }, [dtype, parsed]);

  // Document title + meta description on mount / change.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${h1} | Divini Partners`;
    const setMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      return el;
    };
    const descEl = setMeta('description', metaDesc);
    return () => {
      document.title = prevTitle;
      // Leave the meta tag in place but clear our content to avoid stale text.
      if (descEl) descEl.setAttribute('content', '');
    };
  }, [h1, metaDesc]);

  if (!dtype || !parsed) {
    return (
      <div className="dcl">
        <CategoryStyles />
        <Header nav={nav} login={login} join={join} />
        <section className="hero">
          <div className="hero-bg" />
          <div className="hero-scrim" />
          <div className="wrap">
            <span className="eyebrow">Discover</span>
            <h1>That page is not available</h1>
            <p>The category you were looking for has moved. Explore the discovery hub to find venues and vendors by category and city.</p>
            <div className="cta">
              <Link className="btn gold lg" to="/discover">Browse the discovery hub</Link>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const cards: Listing[] =
    live && live.length > 0 ? live : sampleListings(parsed.cat.label, place ?? 'Local');
  const showingSample = !live || live.length === 0;

  // Related categories (same type) and related cities (same category).
  const cats = dtype === 'venues' ? VENUE_CATEGORIES : VENDOR_CATEGORIES;
  const relatedCats = cats.filter((c) => c.slug !== parsed.cat.slug).slice(0, 8);
  const relatedCities = DISCOVER_CITIES.filter((c) => c.slug !== parsed.city?.slug).slice(0, 8);

  // JSON-LD: ItemList of the visible cards, on a LocalBusiness/CollectionPage frame.
  const itemListJson = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: h1,
    description: metaDesc,
    about: { '@type': 'Thing', name: parsed.cat.plural },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: cards.slice(0, 10).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': dtype === 'venues' ? 'EventVenue' : 'LocalBusiness',
          name: c.name || parsed.cat.label,
          ...(place ? { address: { '@type': 'PostalAddress', addressLocality: place } } : {}),
          ...(c.review_score
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(c.review_score).toFixed(1), bestRating: '5' } }
            : {}),
        },
      })),
    },
  };

  return (
    <div className="dcl">
      <CategoryStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJson) }} />
      <Header nav={nav} login={login} join={join} />

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-scrim" />
        <div className="wrap">
          <span className="eyebrow">{dtype === 'venues' ? 'Event venues' : 'Event vendors'}</span>
          <h1>{h1}</h1>
          <p>{intro}</p>
          <div className="cta">
            <button className="btn gold lg" onClick={join}>Plan an event</button>
            <button className="btn ghost lg" onClick={join}>List your business</button>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="kicker">{place ? `${place} listings` : 'Featured listings'}</div>
          <h2>{plural}{place ? ` in ${place}` : ''}</h2>
          {showingSample && !loading && (
            <div style={{ textAlign: 'center' }}>
              <span className="sampnote">Sample listings shown. Sign in to browse the live marketplace.</span>
            </div>
          )}
          {loading ? (
            <p className="sectsub">Loading listings…</p>
          ) : (
            <div className="cards">
              {cards.map((c, i) => (
                <div
                  className="card"
                  key={`${c.name}-${i}`}
                  onClick={() => (c.slug ? nav(`/${dtype}/${c.slug}`) : join())}
                >
                  <div className={'cimg ' + artFor(i)}>
                    <span className="tag">{c.category || parsed.cat.label}</span>
                    {c.review_score ? <span className="rate">{Number(c.review_score).toFixed(1)}</span> : null}
                  </div>
                  <div className="cbody">
                    <h3>{c.name}</h3>
                    <div className="loc">{c.city || c.region || place || 'Featured partner'}</div>
                    <div className="meta">
                      {dtype === 'venues'
                        ? c.capacity
                          ? `Up to ${c.capacity} guests`
                          : `${parsed.cat.label} venue`
                        : `${parsed.cat.label} services`}
                    </div>
                    <div className="view">View profile</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Related categories */}
      <section style={{ background: 'var(--ivory)' }}>
        <div className="wrap">
          <div className="kicker">Keep exploring</div>
          <h2>Related {dtype === 'venues' ? 'venue types' : 'vendor categories'}</h2>
          <div className="linkgrid">
            {relatedCats.map((c) => (
              <Link key={c.slug} className="linkchip" to={`/discover/${dtype}/${c.slug}${parsed.city ? `-${parsed.city.slug}` : ''}`}>
                {c.plural}{place ? ` in ${place}` : ''}
              </Link>
            ))}
          </div>

          <div className="kicker" style={{ marginTop: 36 }}>By city</div>
          <h2>{plural} in other cities</h2>
          <div className="linkgrid">
            {relatedCities.map((ci) => (
              <Link key={ci.slug} className="linkchip" to={`/discover/${dtype}/${parsed.cat.slug}-${ci.slug}`}>
                {plural} in {ci.city}
              </Link>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link className="btn" to="/discover">See all discovery pages</Link>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="closer">
            <h2>Find your perfect {dtype === 'venues' ? 'venue' : 'vendor'}</h2>
            <p>Create a free account to browse the full marketplace, request quotes, and book with confidence.</p>
            <div className="cta">
              <button className="btn gold lg" onClick={join}>Plan an event</button>
              <button className="btn ghost lg" onClick={join}>List your business</button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Header({ nav, login, join }: { nav: (to: string) => void; login: () => void; join: () => void }) {
  return (
    <header>
      <div className="wrap bar">
        <div className="logo" onClick={() => nav('/')}>
          <div className="mk">D</div>
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">by Divini Group</div>
          </div>
        </div>
        <div className="navlinks">
          {NAV.map((n) => (
            <a key={n.to} className={'hidelink' + (n.to === '/marketplace' ? ' cur' : '')} onClick={() => nav(n.to)}>{n.label}</a>
          ))}
          <a onClick={login}>Login</a>
          <button className="btn primary" onClick={join}>Get started</button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="nm">Divini Partners</div>
        Divini Partners by Divini Group. The premium event partnership marketplace.
      </div>
    </footer>
  );
}

function CategoryStyles() {
  return (
    <style>{`
      .dcl{background:var(--bg);color:var(--ink);min-height:100vh;overflow-x:hidden;font-family:Inter,system-ui,sans-serif}
      .dcl a{cursor:pointer;text-decoration:none}
      .dcl .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
      .dcl header{position:sticky;top:0;z-index:40;background:rgba(247,244,238,.88);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
      .dcl .bar{display:flex;align-items:center;justify-content:space-between;height:66px;gap:16px}
      .dcl .logo{display:flex;align-items:center;gap:11px}
      .dcl .logo .mk{width:38px;height:38px;border-radius:9px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:21px;line-height:1}
      .dcl .logo .nm{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--emerald-deep);line-height:1}
      .dcl .logo .tg{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
      .dcl .navlinks{display:flex;align-items:center;gap:20px}
      .dcl .navlinks a{font-size:13.5px;font-weight:500;color:var(--ink);white-space:nowrap}
      .dcl .navlinks a:hover{color:var(--emerald)}
      .dcl .navlinks a.cur{color:var(--emerald);font-weight:700}
      .dcl .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:13.5px;font-weight:600;padding:10px 17px;border-radius:11px;cursor:pointer;transition:.15s}
      .dcl .btn:hover{border-color:var(--emerald);background:var(--ivory)}
      .dcl .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
      .dcl .btn.primary:hover{background:var(--emerald-mid)}
      .dcl .btn.gold{background:var(--champagne);border-color:var(--champagne);color:var(--emerald-deep)}
      .dcl .btn.ghost{background:transparent;border-color:rgba(255,255,255,.5);color:#fff}
      .dcl .btn.ghost:hover{background:rgba(255,255,255,.12);border-color:#fff}
      .dcl .btn.lg{padding:13px 24px;font-size:15px}
      @media(max-width:1040px){.dcl .navlinks .hidelink{display:none}}

      .dcl .hero{position:relative;overflow:hidden;isolation:isolate;padding:72px 0 56px;text-align:center}
      .dcl .hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 30% 10%,#1E5D4A 0%,#123c2e 55%,#0c2a20 100%);background-size:200% 200%;animation:dcldrift 24s ease-in-out infinite}
      .dcl .hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.25),rgba(9,28,22,.5))}
      @keyframes dcldrift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
      .dcl .eyebrow{display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:var(--champagne);background:rgba(217,204,176,.12);border:1px solid rgba(217,204,176,.36);padding:7px 16px;border-radius:30px;margin-bottom:20px}
      .dcl .hero h1{font-size:48px;line-height:1.06;letter-spacing:-.5px;max-width:760px;margin:0 auto;color:#fff}
      .dcl .hero p{font-size:17px;line-height:1.6;color:rgba(255,255,255,.86);max-width:640px;margin:18px auto 0}
      .dcl .hero .cta{margin-top:28px}
      @media(max-width:640px){.dcl .hero h1{font-size:34px}}

      .dcl section{padding:50px 0;position:relative}
      .dcl .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
      .dcl h2{font-size:36px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
      .dcl .sectsub{text-align:center;color:var(--muted);font-size:16px;max-width:620px;margin:0 auto 42px;line-height:1.6}
      @media(max-width:620px){.dcl h2{font-size:30px}}
      .dcl .sampnote{text-align:center;font-size:12.5px;letter-spacing:.4px;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:20px;padding:7px 16px;display:inline-block;margin:6px 0 24px}

      .dcl .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:18px}
      .dcl .card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:.2s;cursor:pointer}
      .dcl .card:hover{transform:translateY(-5px);box-shadow:0 30px 56px -30px rgba(18,60,46,.45);border-color:var(--champagne)}
      .dcl .cimg{height:170px;position:relative}
      .dcl .cimg.a{background:linear-gradient(150deg,#1e5d4a,#123c2e)}
      .dcl .cimg.b{background:linear-gradient(150deg,#e9e2d2,#cfc3a6)}
      .dcl .cimg.c{background:linear-gradient(150deg,#174838,#0f3527)}
      .dcl .cimg.d{background:linear-gradient(150deg,#d9ccb0,#b8a07a)}
      .dcl .cimg .tag{position:absolute;top:12px;left:12px;background:rgba(255,255,255,.92);color:var(--emerald-deep);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:5px 11px;border-radius:20px}
      .dcl .cimg .rate{position:absolute;top:12px;right:12px;background:var(--emerald-deep);color:var(--champagne);font-size:12px;font-weight:700;padding:5px 11px;border-radius:20px}
      .dcl .cbody{padding:20px 22px}
      .dcl .cbody h3{font-size:22px;margin-bottom:5px}
      .dcl .cbody .loc{font-size:13px;color:var(--emerald);font-weight:600;margin-bottom:8px}
      .dcl .cbody .meta{font-size:13.5px;color:var(--muted)}
      .dcl .cbody .view{margin-top:14px;font-size:13px;font-weight:700;color:var(--emerald-deep)}

      .dcl .linkgrid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:880px;margin:0 auto}
      .dcl .linkchip{display:inline-block;padding:9px 16px;border-radius:22px;border:1px solid var(--line);font-size:13.5px;font-weight:600;color:var(--emerald-deep);background:#fff;transition:.15s}
      .dcl .linkchip:hover{border-color:var(--champagne);background:var(--ivory)}

      .dcl .closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden;margin-top:20px}
      .dcl .closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
      .dcl .closer h2{color:#fff;font-size:34px;margin-bottom:12px;position:relative}
      .dcl .closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:520px;margin:0 auto 26px;position:relative;line-height:1.6}
      .dcl .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

      .dcl footer{border-top:1px solid var(--line);padding:34px 0;text-align:center;color:var(--muted);font-size:13px;background:var(--ivory)}
      .dcl footer .nm{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--emerald-deep);margin-bottom:4px}

      @media(max-width:880px){.dcl .cards{grid-template-columns:1fr 1fr}}
      @media(max-width:560px){.dcl .cards{grid-template-columns:1fr}}
    `}</style>
  );
}
