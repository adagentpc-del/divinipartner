import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { VENUE_CATEGORIES, VENDOR_CATEGORIES, DISCOVER_CITIES } from './CategoryLanding';

/**
 * Discovery hub (public, no login) at /discover.
 *
 * An internal-linking hub for SEO: it lists every venue type and vendor category
 * crossed against a set of major US cities, linking to the auto-generated
 * /discover/:type/:slug landing pages. Brand language matches Marketplace.tsx.
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

// A small set of high-intent cities to feature per category (keeps the hub
// scannable while every combination still lives in the sitemap).
const FEATURE_CITIES = DISCOVER_CITIES.slice(0, 6);

export default function DiscoverHub() {
  const nav = useNavigate();
  const join = () => nav('/register');
  const login = () => nav('/login');

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Discover event venues and vendors by city | Divini Partners';
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
    const descEl = setMeta(
      'description',
      'Browse event venues and vendors by category and city on Divini Partners, the premium event partnership marketplace. Ballrooms, estates, caterers, florists, photographers and more.',
    );
    return () => {
      document.title = prevTitle;
      if (descEl) descEl.setAttribute('content', '');
    };
  }, []);

  const hubJson = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Discover event venues and vendors',
    description:
      'Browse event venues and vendors by category and city on Divini Partners.',
    hasPart: [
      ...VENUE_CATEGORIES.map((c) => ({ '@type': 'WebPage', name: c.plural, url: `/discover/venues/${c.slug}` })),
      ...VENDOR_CATEGORIES.map((c) => ({ '@type': 'WebPage', name: c.plural, url: `/discover/vendors/${c.slug}` })),
    ],
  };

  return (
    <div className="dhub">
      <Styles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJson).replace(/</g, '\\u003c') }} />

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

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-scrim" />
        <div className="wrap">
          <span className="eyebrow">Discover</span>
          <h1>Find venues and vendors by category and city</h1>
          <p>Explore vetted event spaces and trusted partners across major cities. Pick a category to compare profiles, reviews, and starting rates, then request quotes in one place.</p>
        </div>
      </section>

      {/* Venues */}
      <section>
        <div className="wrap">
          <div className="kicker">Event venues</div>
          <h2>Browse venues by type</h2>
          <p className="sectsub">Every venue type, in the cities couples and planners search most.</p>
          <div className="catlist">
            {VENUE_CATEGORIES.map((c) => (
              <div className="catrow" key={c.slug}>
                <Link className="cattitle" to={`/discover/venues/${c.slug}`}>{c.plural}</Link>
                <div className="cities">
                  {FEATURE_CITIES.map((ci) => (
                    <Link key={ci.slug} className="citylink" to={`/discover/venues/${c.slug}-${ci.slug}`}>{ci.city}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vendors */}
      <section style={{ background: 'var(--ivory)' }}>
        <div className="wrap">
          <div className="kicker">Event vendors</div>
          <h2>Browse vendors by category</h2>
          <p className="sectsub">From catering to florals to photography, in every city we serve.</p>
          <div className="catlist">
            {VENDOR_CATEGORIES.map((c) => (
              <div className="catrow" key={c.slug}>
                <Link className="cattitle" to={`/discover/vendors/${c.slug}`}>{c.plural}</Link>
                <div className="cities">
                  {FEATURE_CITIES.map((ci) => (
                    <Link key={ci.slug} className="citylink" to={`/discover/vendors/${c.slug}-${ci.slug}`}>{ci.city}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cities */}
      <section>
        <div className="wrap">
          <div className="kicker">By city</div>
          <h2>Popular cities</h2>
          <div className="linkgrid">
            {DISCOVER_CITIES.map((ci) => (
              <Link key={ci.slug} className="linkchip" to={`/discover/venues/ballrooms-${ci.slug}`}>{ci.city}</Link>
            ))}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="closer">
            <h2>Plan your event with confidence</h2>
            <p>Create a free account to browse the full marketplace, request quotes, and book vetted partners.</p>
            <div className="cta">
              <button className="btn gold lg" onClick={join}>Plan an event</button>
              <button className="btn ghost lg" onClick={join}>List your business</button>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="nm">Divini Partners</div>
          Divini Partners by Divini Group. The premium event partnership marketplace.
        </div>
      </footer>
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .dhub{background:var(--bg);color:var(--ink);min-height:100vh;overflow-x:hidden;font-family:Inter,system-ui,sans-serif}
      .dhub a{cursor:pointer;text-decoration:none}
      .dhub .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
      .dhub header{position:sticky;top:0;z-index:40;background:rgba(247,244,238,.88);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
      .dhub .bar{display:flex;align-items:center;justify-content:space-between;height:66px;gap:16px}
      .dhub .logo{display:flex;align-items:center;gap:11px}
      .dhub .logo .mk{width:38px;height:38px;border-radius:9px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:21px;line-height:1}
      .dhub .logo .nm{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--emerald-deep);line-height:1}
      .dhub .logo .tg{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
      .dhub .navlinks{display:flex;align-items:center;gap:20px}
      .dhub .navlinks a{font-size:13.5px;font-weight:500;color:var(--ink);white-space:nowrap}
      .dhub .navlinks a:hover{color:var(--emerald)}
      .dhub .navlinks a.cur{color:var(--emerald);font-weight:700}
      .dhub .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:13.5px;font-weight:600;padding:10px 17px;border-radius:11px;cursor:pointer;transition:.15s}
      .dhub .btn:hover{border-color:var(--emerald);background:var(--ivory)}
      .dhub .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
      .dhub .btn.primary:hover{background:var(--emerald-mid)}
      .dhub .btn.gold{background:var(--champagne);border-color:var(--champagne);color:var(--emerald-deep)}
      .dhub .btn.ghost{background:transparent;border-color:rgba(255,255,255,.5);color:#fff}
      .dhub .btn.ghost:hover{background:rgba(255,255,255,.12);border-color:#fff}
      .dhub .btn.lg{padding:13px 24px;font-size:15px}
      @media(max-width:1040px){.dhub .navlinks .hidelink{display:none}}

      .dhub .hero{position:relative;overflow:hidden;isolation:isolate;padding:72px 0 56px;text-align:center}
      .dhub .hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 30% 10%,#1E5D4A 0%,#123c2e 55%,#0c2a20 100%);background-size:200% 200%;animation:dhubdrift 24s ease-in-out infinite}
      .dhub .hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.25),rgba(9,28,22,.5))}
      @keyframes dhubdrift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
      .dhub .eyebrow{display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:var(--champagne);background:rgba(217,204,176,.12);border:1px solid rgba(217,204,176,.36);padding:7px 16px;border-radius:30px;margin-bottom:20px}
      .dhub .hero h1{font-size:48px;line-height:1.06;letter-spacing:-.5px;max-width:760px;margin:0 auto;color:#fff}
      .dhub .hero p{font-size:17px;line-height:1.6;color:rgba(255,255,255,.86);max-width:640px;margin:18px auto 0}
      @media(max-width:640px){.dhub .hero h1{font-size:34px}}

      .dhub section{padding:50px 0;position:relative}
      .dhub .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
      .dhub h2{font-size:36px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
      .dhub .sectsub{text-align:center;color:var(--muted);font-size:16px;max-width:620px;margin:0 auto 38px;line-height:1.6}
      @media(max-width:620px){.dhub h2{font-size:30px}}

      .dhub .catlist{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .dhub .catrow{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;transition:.18s}
      .dhub .catrow:hover{border-color:var(--champagne);box-shadow:0 24px 44px -32px rgba(18,60,46,.4)}
      .dhub .cattitle{display:inline-block;font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--emerald-deep);margin-bottom:10px}
      .dhub .cattitle:hover{color:var(--emerald)}
      .dhub .cities{display:flex;flex-wrap:wrap;gap:7px}
      .dhub .citylink{font-size:12.5px;font-weight:600;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:18px;padding:5px 12px;transition:.15s}
      .dhub .citylink:hover{color:var(--emerald-deep);border-color:var(--champagne)}

      .dhub .linkgrid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:880px;margin:0 auto}
      .dhub .linkchip{display:inline-block;padding:9px 16px;border-radius:22px;border:1px solid var(--line);font-size:13.5px;font-weight:600;color:var(--emerald-deep);background:#fff;transition:.15s}
      .dhub .linkchip:hover{border-color:var(--champagne);background:var(--ivory)}

      .dhub .closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden;margin-top:20px}
      .dhub .closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
      .dhub .closer h2{color:#fff;font-size:34px;margin-bottom:12px;position:relative}
      .dhub .closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:520px;margin:0 auto 26px;position:relative;line-height:1.6}
      .dhub .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

      .dhub footer{border-top:1px solid var(--line);padding:34px 0;text-align:center;color:var(--muted);font-size:13px;background:var(--ivory)}
      .dhub footer .nm{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--emerald-deep);margin-bottom:4px}

      @media(max-width:720px){.dhub .catlist{grid-template-columns:1fr}}
    `}</style>
  );
}
