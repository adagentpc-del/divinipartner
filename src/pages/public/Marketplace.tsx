import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import Scorecard from '../../components/marketing/Scorecard';
import AnimatedCounter from '../../components/marketing/AnimatedCounter';

/**
 * Marketplace - conversion-upgraded discovery page for Divini Partners, the
 * Venue Intelligence and Revenue Infrastructure Platform. Leads with a search
 * bar above the fold, then proves trust with verified, Scorecard-style sample
 * results. The search is a client-side filter builder that, on submit, routes
 * into the live marketplace search route (/marketplace?... currently gated
 * behind sign in) via /register so prospects convert into accounts. The page
 * had no live data call to preserve; all results shown are sample listings.
 */

// Filter option sets (kept aligned with the venue/vendor blueprints)
const PARTNER_TYPES = ['Venue', 'Vendor', 'Sponsor'] as const;
const EVENT_TYPES = [
  'Any event type', 'Wedding', 'Corporate', 'Gala or fundraiser', 'Conference',
  'Social celebration', 'Concert or festival', 'Nonprofit', 'Brand activation',
];
const CAPACITIES = ['Any capacity', 'Up to 100', '100 to 250', '250 to 500', '500 to 1,000', '1,000+'];
const BUDGETS = ['Any budget', 'Under $10K', '$10K to $25K', '$25K to $50K', '$50K to $100K', '$100K+'];
const AVAILABILITY = ['Any date', 'This month', 'Next 90 days', 'This year', 'Flexible'];

type PartnerType = (typeof PARTNER_TYPES)[number];

type Result = {
  name: string;
  type: PartnerType;
  cat: string;
  loc: string;
  meta: string;
  score: number;
  rows: { label: string; value: string }[];
  art: 'a' | 'b' | 'c' | 'd';
};

// Sample, verified partner results shown to build trust before sign in.
const RESULTS: Result[] = [
  {
    name: 'The Emerald Hall', type: 'Venue', cat: 'Ballroom', loc: 'Downtown', meta: 'Up to 400 guests',
    score: 96, art: 'a',
    rows: [
      { label: 'Response time', value: 'Under 2 hrs' },
      { label: 'Confirmed bookings', value: '210+' },
      { label: 'Repeat clients', value: '44%' },
      { label: 'Verified reviews', value: '4.9 / 5' },
    ],
  },
  {
    name: 'Hillcrest Estate', type: 'Venue', cat: 'Estate', loc: 'Wine Country', meta: 'Up to 250 guests',
    score: 94, art: 'b',
    rows: [
      { label: 'Response time', value: 'Same day' },
      { label: 'Confirmed bookings', value: '140+' },
      { label: 'Repeat clients', value: '38%' },
      { label: 'Verified reviews', value: '5.0 / 5' },
    ],
  },
  {
    name: 'Maison Verde Catering', type: 'Vendor', cat: 'Catering', loc: 'Regional', meta: 'Plated and family style',
    score: 93, art: 'c',
    rows: [
      { label: 'Response time', value: 'Under 3 hrs' },
      { label: 'Quote win rate', value: '61%' },
      { label: 'Events served', value: '480+' },
      { label: 'Verified reviews', value: '4.9 / 5' },
    ],
  },
  {
    name: 'Petal and Stem', type: 'Vendor', cat: 'Florals', loc: 'Regional', meta: 'Luxury floral design',
    score: 95, art: 'd',
    rows: [
      { label: 'Response time', value: 'Same day' },
      { label: 'Quote win rate', value: '67%' },
      { label: 'Events served', value: '320+' },
      { label: 'Verified reviews', value: '5.0 / 5' },
    ],
  },
  {
    name: 'Northpoint Beverage Co.', type: 'Sponsor', cat: 'Brand sponsor', loc: 'National', meta: 'Activation and product',
    score: 91, art: 'a',
    rows: [
      { label: 'Active programs', value: '12' },
      { label: 'Avg. activation', value: '$36K' },
      { label: 'Events sponsored', value: '90+' },
      { label: 'Renewal rate', value: '72%' },
    ],
  },
  {
    name: 'Skyline Terrace', type: 'Venue', cat: 'Rooftop', loc: 'City Center', meta: 'Up to 180 guests',
    score: 90, art: 'c',
    rows: [
      { label: 'Response time', value: 'Under 4 hrs' },
      { label: 'Confirmed bookings', value: '120+' },
      { label: 'Repeat clients', value: '33%' },
      { label: 'Verified reviews', value: '4.8 / 5' },
    ],
  },
];

const TRUST_POINTS = [
  { t: 'Verified partners only', s: 'Every venue, vendor, and sponsor is reviewed and badge verified before they appear.' },
  { t: 'Real performance data', s: 'Response time, win rate, and verified reviews are surfaced on every profile.' },
  { t: 'One brief, many quotes', s: 'Send a single request and let matched partners respond with tailored proposals.' },
  { t: 'Booked and managed in one place', s: 'Messages, contracts, and payments stay together from first search to event day.' },
];

export default function Marketplace() {
  const nav = useNavigate();

  const [ptype, setPtype] = useState<PartnerType>('Venue');
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(CAPACITIES[0]);
  const [budget, setBudget] = useState(BUDGETS[0]);
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [availability, setAvailability] = useState(AVAILABILITY[0]);
  const [filter, setFilter] = useState<'All' | PartnerType>('All');

  // The live marketplace search route is gated behind sign in. On submit we
  // forward the prospect into registration, carrying their intent in the query
  // string so it can pre-fill once they land in the authenticated marketplace.
  const runSearch = () => {
    const params = new URLSearchParams();
    params.set('intent', 'search');
    params.set('type', ptype.toLowerCase());
    if (keyword.trim()) params.set('q', keyword.trim());
    if (location.trim()) params.set('location', location.trim());
    if (capacity !== CAPACITIES[0]) params.set('capacity', capacity);
    if (budget !== BUDGETS[0]) params.set('budget', budget);
    if (eventType !== EVENT_TYPES[0]) params.set('eventType', eventType);
    if (availability !== AVAILABILITY[0]) params.set('availability', availability);
    nav(`/register?${params.toString()}`);
  };

  const visible = filter === 'All' ? RESULTS : RESULTS.filter((r) => r.type === filter);

  return (
    <>
      <SiteHeader active="/marketplace" />
      <main className="pub mkt">
        <style>{`
          .mkt{background:var(--bg);color:var(--ink)}
          .mkt .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
          .mkt section{padding:54px 0;position:relative}

          /* hero */
          .mkt .mkt-hero{position:relative;overflow:hidden;isolation:isolate;padding:74px 0 0;text-align:center}
          .mkt .mkt-hero-bg{position:absolute;inset:0 0 auto 0;height:420px;z-index:-2;background:radial-gradient(120% 120% at 30% 10%,#1E5D4A 0%,#123c2e 55%,#0c2a20 100%);background-size:200% 200%;animation:mkt-drift 24s ease-in-out infinite}
          .mkt .mkt-hero-scrim{position:absolute;inset:0 0 auto 0;height:420px;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.2),var(--bg) 96%)}
          @keyframes mkt-drift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
          .mkt .mkt-hero h1{font-size:50px;line-height:1.05;letter-spacing:-.5px;max-width:760px;margin:0 auto;color:#fff}
          .mkt .mkt-hero p{font-size:17.5px;line-height:1.6;color:rgba(255,255,255,.88);max-width:600px;margin:18px auto 0}
          @media(max-width:640px){.mkt .mkt-hero h1{font-size:34px}}

          /* search panel - immediately above the fold */
          .mkt .mkt-search{max-width:920px;margin:34px auto 0;background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 40px 80px -44px rgba(18,60,46,.5);padding:22px;text-align:left}
          .mkt .mkt-tabs{display:inline-flex;background:var(--ivory);border:1px solid var(--line);border-radius:30px;padding:5px;gap:4px;margin-bottom:18px}
          .mkt .mkt-tabs button{border:none;background:transparent;font-family:Inter;font-size:13.5px;font-weight:600;color:var(--muted);padding:8px 20px;border-radius:24px;cursor:pointer;transition:.15s}
          .mkt .mkt-tabs button.on{background:var(--emerald);color:#fff}
          .mkt .mkt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
          .mkt .mkt-f label{display:block;font-size:11px;letter-spacing:.4px;text-transform:uppercase;font-weight:700;color:var(--muted);margin-bottom:6px}
          .mkt .mkt-f input,.mkt .mkt-f select{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:11px;font-family:Inter;font-size:14px;background:#fff;color:var(--ink)}
          .mkt .mkt-f input:focus,.mkt .mkt-f select:focus{outline:none;border-color:var(--emerald)}
          .mkt .mkt-go{margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
          .mkt .mkt-go .btn.primary{flex:1;min-width:200px;padding:13px 24px;font-size:15px}
          .mkt .mkt-go .hint{font-size:12.5px;color:var(--muted)}
          @media(max-width:760px){.mkt .mkt-grid{grid-template-columns:1fr 1fr}}
          @media(max-width:520px){.mkt .mkt-grid{grid-template-columns:1fr}}

          /* trust strip */
          .mkt .mkt-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;max-width:920px;margin:26px auto 0}
          .mkt .mkt-stat{text-align:center}
          @media(max-width:680px){.mkt .mkt-stats{grid-template-columns:1fr 1fr}}

          /* section headings */
          .mkt .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .mkt h2{font-size:36px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .mkt .sectsub{text-align:center;color:var(--muted);font-size:16px;max-width:620px;margin:0 auto 30px;line-height:1.6}
          @media(max-width:620px){.mkt h2{font-size:30px}}
          .mkt .sampnote{text-align:center;font-size:12.5px;letter-spacing:.3px;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:20px;padding:7px 16px;display:inline-block;margin:0 auto 22px}

          /* result filter chips */
          .mkt .chiprow{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-bottom:30px}
          .mkt .chip{display:inline-block;padding:8px 16px;border-radius:22px;border:1px solid var(--line);font-size:13px;font-weight:600;cursor:pointer;color:var(--muted);background:#fff;transition:.15s}
          .mkt .chip:hover{border-color:var(--champagne);color:var(--ink)}
          .mkt .chip.on{background:var(--emerald);border-color:var(--emerald);color:#fff}

          /* result cards (Scorecard inside) */
          .mkt .results{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
          .mkt .rcard{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:.2s;cursor:pointer;display:flex;flex-direction:column}
          .mkt .rcard:hover{transform:translateY(-5px);box-shadow:0 30px 56px -30px rgba(18,60,46,.45);border-color:var(--champagne)}
          .mkt .rcap{height:128px;position:relative}
          .mkt .rcap.a{background:linear-gradient(150deg,#1e5d4a,#123c2e)}
          .mkt .rcap.b{background:linear-gradient(150deg,#e9e2d2,#cfc3a6)}
          .mkt .rcap.c{background:linear-gradient(150deg,#174838,#0f3527)}
          .mkt .rcap.d{background:linear-gradient(150deg,#d9ccb0,#b8a07a)}
          .mkt .rcap .tag{position:absolute;top:12px;left:12px;background:rgba(255,255,255,.92);color:var(--emerald-deep);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:5px 11px;border-radius:20px}
          .mkt .rcap .vbadge{position:absolute;top:12px;right:12px;background:var(--emerald-deep);color:var(--champagne);font-size:11px;font-weight:700;letter-spacing:.3px;padding:5px 11px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}
          .mkt .rbody{padding:18px 20px 20px;display:flex;flex-direction:column;flex:1}
          .mkt .rbody h3{font-size:22px;margin-bottom:3px}
          .mkt .rbody .loc{font-size:13px;color:var(--emerald);font-weight:600;margin-bottom:3px}
          .mkt .rbody .meta{font-size:13px;color:var(--muted);margin-bottom:14px}
          .mkt .rbody .mk-scorecard{border:none;padding:0;margin-bottom:14px}
          .mkt .rbody .view{margin-top:auto;font-size:13px;font-weight:700;color:var(--emerald-deep)}
          @media(max-width:880px){.mkt .results{grid-template-columns:1fr 1fr}}
          @media(max-width:560px){.mkt .results{grid-template-columns:1fr}}

          /* trust cards */
          .mkt .trust{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;max-width:920px;margin:0 auto}
          .mkt .tcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px 26px}
          .mkt .tcard h3{font-size:20px;margin-bottom:7px}
          .mkt .tcard p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}
          @media(max-width:680px){.mkt .trust{grid-template-columns:1fr}}

          /* closer */
          .mkt .closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .mkt .closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .mkt .closer h2{color:#fff;font-size:34px;margin-bottom:12px;position:relative}
          .mkt .closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:520px;margin:0 auto 26px;position:relative;line-height:1.6}
          .mkt .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        `}</style>

        {/* HERO + SEARCH ABOVE THE FOLD */}
        <section className="mkt-hero">
          <div className="mkt-hero-bg" />
          <div className="mkt-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">Event Commerce Infrastructure</span>
            <h1>Discover Trusted Partners Faster</h1>
            <p>
              Search verified venues, vendors, and sponsors, see real performance before you reach
              out, and turn one brief into tailored quotes. More vendors, more bookings, less
              administration.
            </p>

            {/* SEARCH BAR - first thing under the hero */}
            <div className="mkt-search">
              <div className="mkt-tabs">
                {PARTNER_TYPES.map((t) => (
                  <button key={t} className={ptype === t ? 'on' : ''} onClick={() => setPtype(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="mkt-grid">
                <div className="mkt-f" style={{ gridColumn: 'span 2' }}>
                  <label>Search</label>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={`Search ${ptype.toLowerCase()}s by name, style, or specialty`}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  />
                </div>
                <div className="mkt-f">
                  <label>Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City or region"
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  />
                </div>
                <div className="mkt-f">
                  <label>Capacity</label>
                  <select value={capacity} onChange={(e) => setCapacity(e.target.value)}>
                    {CAPACITIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mkt-f">
                  <label>Budget</label>
                  <select value={budget} onChange={(e) => setBudget(e.target.value)}>
                    {BUDGETS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="mkt-f">
                  <label>Event type</label>
                  <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                    {EVENT_TYPES.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div className="mkt-f">
                  <label>Availability</label>
                  <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
                    {AVAILABILITY.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="mkt-go">
                <button className="btn primary" onClick={runSearch}>Search the marketplace</button>
                <span className="hint">Free to search. Create an account to see live availability and request quotes.</span>
              </div>
            </div>

            <div className="mkt-stats">
              <div className="mkt-stat"><AnimatedCounter value={4820} label="Opportunities created" /></div>
              <div className="mkt-stat"><AnimatedCounter value={1870} label="Verified partners" /></div>
              <div className="mkt-stat"><AnimatedCounter value={3160} label="Quotes generated" /></div>
              <div className="mkt-stat"><AnimatedCounter value={9} suffix="M+" prefix="$" label="Revenue created" /></div>
            </div>
          </div>
        </section>

        {/* RESULTS - verified, Scorecard-style trust cards */}
        <section>
          <div className="wrap" style={{ textAlign: 'center' }}>
            <div className="kicker">Trusted partners, proven by data</div>
            <h2>See who you are working with before you reach out</h2>
            <p className="sectsub">
              Every partner is badge verified and shown with real performance data, so you can shortlist
              with confidence in minutes, not weeks.
            </p>
            <div><span className="sampnote">Sample verified listings. Search above to find partners for your event.</span></div>

            <div className="chiprow">
              {(['All', ...PARTNER_TYPES] as const).map((c) => (
                <span key={c} className={'chip' + (filter === c ? ' on' : '')} onClick={() => setFilter(c)}>
                  {c === 'All' ? 'All partners' : `${c}s`}
                </span>
              ))}
            </div>

            <div className="results">
              {visible.map((r) => (
                <div className="rcard" key={r.name} onClick={runSearch}>
                  <div className={'rcap ' + r.art}>
                    <span className="tag">{r.cat}</span>
                    <span className="vbadge">{'✓'} Verified</span>
                  </div>
                  <div className="rbody">
                    <h3>{r.name}</h3>
                    <div className="loc">{r.loc}</div>
                    <div className="meta">{r.meta}</div>
                    <Scorecard title="Divini Score" score={r.score} rows={r.rows} />
                    <div className="view">View profile and request a quote</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHY TRUST THE MARKETPLACE */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="kicker">Built on trust</div>
            <h2>Discovery that protects your event</h2>
            <p className="sectsub">
              Divini Partners is the Venue Intelligence and Revenue Infrastructure Platform. Every search
              is backed by verification and real performance data.
            </p>
            <div className="trust">
              {TRUST_POINTS.map((p) => (
                <div className="tcard" key={p.t}>
                  <h3>{p.t}</h3>
                  <p>{p.s}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSER */}
        <section style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="closer">
              <h2>Find your perfect partners</h2>
              <p>Create a free account to browse the full marketplace, see live availability, and request tailored quotes.</p>
              <div className="cta">
                <button className="btn gold lg" onClick={() => nav('/register')}>Get started free</button>
                <button className="btn ghost lg" onClick={() => nav('/register?role=venue')}>List your business</button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
