import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import BeforeAfter from '../../components/marketing/BeforeAfter';
import Scorecard from '../../components/marketing/Scorecard';
import OpportunityFeedPreview from '../../components/marketing/OpportunityFeedPreview';
import AnimatedCounter from '../../components/marketing/AnimatedCounter';
import RoiPanel from '../../components/marketing/RoiPanel';

/**
 * ForVendors - conversion-upgraded vendor landing page for Divini Partners,
 * The Venue Intelligence and Revenue Infrastructure Platform. Reframes the
 * vendor story around qualified opportunities that arrive with venue
 * intelligence already attached, so vendors quote and close instead of
 * chasing information. Uses the shared public chrome and marketing visuals.
 * Page-specific CSS is scoped under the .vnd- prefix.
 */

const BENEFITS: { t: string; d: string }[] = [
  {
    t: 'Opportunities, not cold leads',
    d: 'Requests arrive matched to your category, region, and availability, with budget and decision maker already confirmed.',
  },
  {
    t: 'Venue intelligence attached',
    d: 'Dimensions, power, load-in, and layout come with every opportunity, so you quote against real requirements the first time.',
  },
  {
    t: 'Quotes that draft themselves',
    d: 'Build your catalog and packages once. A draft quote generates the moment an opportunity lands, accurate from the start.',
  },
  {
    t: 'Clean payments and payouts',
    d: 'Deposits, invoices, and payouts are tracked with a complete record, so you always know exactly where money stands.',
  },
  {
    t: 'One shared timeline',
    d: 'Know precisely when to load in, set up, and break down, with every team working the event on the same clock.',
  },
  {
    t: 'A reputation that compounds',
    d: 'Verified reviews from completed events build a profile that wins you more of the work you actually want.',
  },
];

const STEPS: { n: string; t: string; d: string }[] = [
  {
    n: '1',
    t: 'Build your profile',
    d: 'Create your vendor profile with services, portfolio, packages, and a reusable pricing catalog.',
  },
  {
    n: '2',
    t: 'Receive qualified opportunities',
    d: 'Opportunities arrive matched to your craft, with verified budget, venue, decision maker, and event details.',
  },
  {
    n: '3',
    t: 'Review the auto-generated draft',
    d: 'A draft quote is ready against real venue requirements. Adjust, confirm, and send in minutes.',
  },
  {
    n: '4',
    t: 'Deliver and get paid',
    d: 'Work from a shared timeline, get paid cleanly, and earn verified reviews that grow your business.',
  },
];

const LEAD_BADGES: { label: string; sub: string }[] = [
  { label: 'Verified Budget', sub: 'Confirmed spend range' },
  { label: 'Verified Venue', sub: 'Dimensions and load-in attached' },
  { label: 'Verified Decision Maker', sub: 'Signer identified' },
  { label: 'Verified Event', sub: 'Date, guest count, format' },
];

const VENDOR_FEED: { label: string; meta?: string; value?: string }[] = [
  { label: 'Garden gala, 220 guests', meta: 'Grand Ballroom, premier window', value: '$32,400' },
  { label: 'Coastal wedding weekend', meta: 'Matched to your category and region', value: '$48,900' },
  { label: 'Corporate awards night', meta: 'Open to invited vendors', value: '$21,600' },
  { label: 'Private estate dinner', meta: 'New opportunity, just posted', value: '$14,800' },
  { label: 'Charity luncheon, 90', meta: 'Salon A, decision maker confirmed', value: '$9,200' },
];

const READINESS_ROWS: { label: string; value: string }[] = [
  { label: 'Avg. response time', value: 'Under 2 hrs' },
  { label: 'Quote-to-book rate', value: '68%' },
  { label: 'Repeat clients', value: '41%' },
  { label: 'Verified reviews', value: '4.9 / 5' },
];

const ROI_METRICS: { k: string; v: string; d?: string }[] = [
  { k: 'Time to quote', v: '10 min', d: 'down from 7 days' },
  { k: 'Quotes per win', v: '1.4', d: 'no more wasted bids' },
  { k: 'Win rate', v: '68%', d: 'on qualified opportunities' },
  { k: 'Chasing emails', v: '0', d: 'requirements come attached' },
];

export default function ForVendors() {
  const nav = useNavigate();
  const demo = () => nav('/demo');
  const join = () => nav('/register?role=vendor');

  return (
    <div className="pub vnd">
      <style>{`
        .vnd .vnd-hero{position:relative;overflow:hidden;isolation:isolate;padding:96px 0 84px;text-align:center}
        .vnd .vnd-hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 78% 10%,#1E5D4A 0%,#123c2e 50%,#0c2a20 100%);background-size:200% 200%;animation:vnd-drift 24s ease-in-out infinite}
        .vnd .vnd-hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.3),rgba(9,28,22,.55))}
        @keyframes vnd-drift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
        .vnd .vnd-eyebrow{display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:var(--champagne);background:rgba(217,204,176,.12);border:1px solid rgba(217,204,176,.36);padding:7px 16px;border-radius:30px;margin-bottom:22px}
        .vnd .vnd-hero h1{font-size:54px;line-height:1.06;letter-spacing:-.5px;max-width:860px;margin:0 auto;color:#fff;font-family:'Cormorant Garamond',serif;font-weight:700}
        .vnd .vnd-hero p{font-size:18px;line-height:1.65;color:rgba(255,255,255,.86);max-width:660px;margin:22px auto 30px}
        .vnd .vnd-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        @media(max-width:640px){.vnd .vnd-hero h1{font-size:38px}}

        .vnd .vnd-sec{padding:72px 0;position:relative}
        .vnd .vnd-ivory{background:var(--ivory)}
        .vnd .vnd-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
        .vnd .vnd-sec h2{font-size:38px;text-align:center;margin-bottom:12px;letter-spacing:-.3px;font-family:'Cormorant Garamond',serif;color:var(--emerald-deep)}
        .vnd .vnd-sub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 46px;line-height:1.6}

        .vnd .vnd-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .vnd .vnd-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:28px 24px;transition:.2s}
        .vnd .vnd-card:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(18,60,46,.4);border-color:var(--champagne)}
        .vnd .vnd-card h3{font-size:21px;margin-bottom:9px;font-family:'Cormorant Garamond',serif;color:var(--emerald-deep)}
        .vnd .vnd-card p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}

        .vnd .vnd-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
        .vnd .vnd-step{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 22px}
        .vnd .vnd-step .vnd-n{width:38px;height:38px;border-radius:11px;background:var(--ivory);color:var(--emerald);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;margin-bottom:14px;border:1px solid var(--line)}
        .vnd .vnd-step h3{font-size:19px;margin-bottom:7px;font-family:'Cormorant Garamond',serif;color:var(--emerald-deep)}
        .vnd .vnd-step p{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0}

        .vnd .vnd-leadwrap{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:start}
        .vnd .vnd-inbox{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 30px 60px -40px rgba(18,60,46,.45)}
        .vnd .vnd-inbox-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
        .vnd .vnd-inbox-title{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--emerald-deep)}
        .vnd .vnd-inbox-tag{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;font-weight:600;color:var(--emerald);background:var(--ivory);border:1px solid var(--line);padding:5px 10px;border-radius:20px}
        .vnd .vnd-lead{border:1px solid var(--line);border-radius:13px;padding:16px;background:var(--ivory)}
        .vnd .vnd-lead-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px}
        .vnd .vnd-lead-name{font-weight:700;color:var(--ink);font-size:15.5px}
        .vnd .vnd-lead-val{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:var(--emerald)}
        .vnd .vnd-lead-meta{font-size:13px;color:var(--muted);margin-bottom:14px}
        .vnd .vnd-badges{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .vnd .vnd-badge{display:flex;align-items:flex-start;gap:9px;background:#fff;border:1px solid var(--line);border-radius:11px;padding:10px 12px}
        .vnd .vnd-badge .vnd-check{flex:0 0 20px;width:20px;height:20px;border-radius:50%;background:var(--emerald);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;margin-top:1px}
        .vnd .vnd-badge .vnd-bl{font-size:12.5px;font-weight:700;color:var(--emerald-deep);line-height:1.25}
        .vnd .vnd-badge .vnd-bs{font-size:11px;color:var(--muted);line-height:1.3;margin-top:2px}
        .vnd .vnd-feedcol{display:flex;flex-direction:column;gap:18px}

        .vnd .vnd-emotion{text-align:center;padding:84px 0}
        .vnd .vnd-emotion p{font-family:'Cormorant Garamond',serif;font-size:34px;line-height:1.28;color:var(--emerald-deep);max-width:760px;margin:0 auto;letter-spacing:-.3px}
        .vnd .vnd-emotion .vnd-em-accent{color:var(--emerald)}
        .vnd .vnd-emotion p.vnd-em-line{font-size:23px;line-height:1.32;margin:18px auto 0;max-width:680px}
        @media(max-width:640px){.vnd .vnd-emotion p{font-size:25px}}

        .vnd .vnd-roiwrap{max-width:760px;margin:0 auto}
        .vnd .vnd-counters{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:760px;margin:0 auto 8px}
        .vnd .vnd-counter{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 18px;text-align:center}

        .vnd .vnd-closer{background:var(--emerald-deep);border-radius:24px;padding:58px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
        .vnd .vnd-closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
        .vnd .vnd-closer h2{color:#fff;position:relative;font-family:'Cormorant Garamond',serif;font-size:38px}
        .vnd .vnd-closer p{color:rgba(255,255,255,.82);font-size:16.5px;max-width:580px;margin:0 auto 28px;position:relative;line-height:1.6}

        @media(max-width:880px){.vnd .vnd-grid3,.vnd .vnd-steps{grid-template-columns:1fr 1fr}.vnd .vnd-leadwrap{grid-template-columns:1fr}.vnd .vnd-counters{grid-template-columns:1fr 1fr 1fr}}
        @media(max-width:560px){.vnd .vnd-grid3,.vnd .vnd-steps,.vnd .vnd-counters{grid-template-columns:1fr}.vnd .vnd-sec h2{font-size:30px}.vnd .vnd-badges{grid-template-columns:1fr}}
      `}</style>

      <SiteHeader active="/for-vendors" />

      <main>
        <section className="vnd-hero">
          <div className="vnd-hero-bg" />
          <div className="vnd-hero-scrim" />
          <div className="wrap">
            <span className="vnd-eyebrow">For vendors and suppliers</span>
            <h1>Stop Chasing Leads. Start Closing Opportunities.</h1>
            <p>
              List for free, get found by more clients, and only pay when you win business. Qualified
              opportunities arrive with the details already attached, so you spend less time on
              administration and more time booking work.
            </p>
            <div className="vnd-ctas">
              <button className="btn gold lg" onClick={demo}>
                Book a Demo
              </button>
              <button className="btn ghost lg" onClick={join}>
                Get started
              </button>
            </div>
          </div>
        </section>

        <section className="vnd-sec">
          <div className="wrap">
            <div className="vnd-kicker">The difference</div>
            <h2>From chasing information to closing work</h2>
            <p className="vnd-sub">
              The old way buries your expertise under follow-up. Divini Partners delivers the
              requirements with the opportunity, so the work starts the moment it lands.
            </p>
            <BeforeAfter
              beforeTitle="The old way to win work"
              afterTitle="The Divini way"
              before={[
                { label: '15 Emails', sub: 'Chasing details that should arrive up front' },
                { label: '3 Calls', sub: 'Confirming budget and decision maker' },
                { label: '7 Days', sub: 'Before you can even send a quote' },
                { label: '1 Quote', sub: 'And no certainty it lands' },
              ]}
              after={[
                { label: 'Venue Selected', sub: 'Dimensions and load-in attached' },
                { label: 'Requirements Auto-Filled', sub: 'Pulled from venue intelligence' },
                { label: 'Draft Generated', sub: 'Accurate from your catalog' },
                { label: 'Vendor Approved', sub: 'Decision maker already verified' },
                { label: '10 Minutes', sub: 'From opportunity to sent quote' },
              ]}
            />
          </div>
        </section>

        <section className="vnd-sec vnd-ivory">
          <div className="wrap">
            <div className="vnd-kicker">The verified lead dashboard</div>
            <h2>Every opportunity arrives qualified</h2>
            <p className="vnd-sub">
              Opportunities land in your inbox with budget, venue, decision maker, and event
              already verified, alongside a live feed of qualified work and your win profile.
            </p>
            <div className="vnd-leadwrap">
              <div className="vnd-inbox">
                <div className="vnd-inbox-h">
                  <div className="vnd-inbox-title">Opportunity inbox</div>
                  <span className="vnd-inbox-tag">Verified</span>
                </div>
                <div className="vnd-lead">
                  <div className="vnd-lead-top">
                    <span className="vnd-lead-name">Autumn gala, 240 guests</span>
                    <span className="vnd-lead-val">$48,500</span>
                  </div>
                  <div className="vnd-lead-meta">Grand Ballroom, Oct 18, full-service catering</div>
                  <div className="vnd-badges">
                    {LEAD_BADGES.map((b) => (
                      <div className="vnd-badge" key={b.label}>
                        <span className="vnd-check" aria-hidden="true">
                          ✓
                        </span>
                        <span>
                          <span className="vnd-bl">{b.label}</span>
                          <span className="vnd-bs">{b.sub}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="vnd-feedcol">
                <OpportunityFeedPreview
                  title="Qualified opportunities, live"
                  items={VENDOR_FEED}
                  visible={4}
                />
                <Scorecard
                  title="Your win profile"
                  score={94}
                  rows={READINESS_ROWS}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="vnd-sec">
          <div className="wrap">
            <div className="vnd-kicker">Why vendors choose Divini</div>
            <h2>Less hunting, more booked work</h2>
            <p className="vnd-sub">
              Everything you need to receive the right opportunities, quote fast against real
              requirements, and get paid cleanly, all in one place.
            </p>
            <div className="vnd-grid3">
              {BENEFITS.map((b) => (
                <div className="vnd-card" key={b.t}>
                  <h3>{b.t}</h3>
                  <p>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="vnd-emotion vnd-ivory">
          <div className="wrap">
            <p>
              Your expertise should win the work.{' '}
              <span className="vnd-em-accent">Not your ability to chase information.</span>
            </p>
            <p className="vnd-em-line">
              Stop chasing information. Start closing business.{' '}
              <span className="vnd-em-accent">The fastest path from opportunity to approved quote.</span>
            </p>
          </div>
        </section>

        <section className="vnd-sec">
          <div className="wrap">
            <div className="vnd-kicker">How it works for vendors</div>
            <h2>From profile to paid</h2>
            <p className="vnd-sub">
              Four steps take you from a listing to a calendar of qualified, well-paid events.
            </p>
            <div className="vnd-steps">
              {STEPS.map((s) => (
                <div className="vnd-step" key={s.n}>
                  <div className="vnd-n">{s.n}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="vnd-sec vnd-ivory">
          <div className="wrap">
            <div className="vnd-kicker">What it changes</div>
            <h2>Quote in minutes, win more of them</h2>
            <p className="vnd-sub">
              When requirements arrive with the opportunity, the math changes. Fewer quotes, faster
              turnaround, and a higher rate of work that actually closes.
            </p>
            <div className="vnd-counters">
              <div className="vnd-counter">
                <AnimatedCounter value={10} suffix=" min" label="Average time to quote" />
              </div>
              <div className="vnd-counter">
                <AnimatedCounter value={68} suffix="%" label="Quote-to-book rate" />
              </div>
              <div className="vnd-counter">
                <AnimatedCounter value={0} label="Chasing emails per opportunity" />
              </div>
            </div>
            <div className="vnd-roiwrap">
              <RoiPanel metrics={ROI_METRICS} />
            </div>
          </div>
        </section>

        <section className="vnd-sec">
          <div className="wrap">
            <div className="vnd-closer">
              <h2>Get in front of qualified work</h2>
              <p>
                Join the founding network of vendors winning premium bookings on Divini Partners,
                The Venue Intelligence and Revenue Infrastructure Platform.
              </p>
              <div className="vnd-ctas">
                <button className="btn gold lg" onClick={join}>
                  Get started
                </button>
                <button className="btn ghost lg" onClick={demo}>
                  Book a Demo
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
