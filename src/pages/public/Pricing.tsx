import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import RoiPanel from '../../components/marketing/RoiPanel';

/**
 * Pricing - the public pricing page for Divini Partners, the Event Commerce
 * Infrastructure for booking and running events. This is the V2 model: free for
 * everyone to join, one included seat per business, additional seats at $10 a
 * month, an optional Featured Vendor placement at $49 a month, and a single flat
 * 5% platform fee added at checkout on top of the vendor price. There are no
 * subscription tiers, no tier based percentages, and no bid access windows. The
 * model has no tiers to fetch, so all copy renders directly and statically.
 */

// One simple card per side of the marketplace.
type PlanCard = {
  audience: string;
  price: string;
  priceNote: string;
  blurb: string;
  features: string[];
  seatLine?: string;
  cta: string;
  ctaRole?: string;
  highlight?: boolean;
};

const PLANS: PlanCard[] = [
  {
    audience: 'Clients',
    price: 'Free',
    priceNote: 'always',
    blurb: 'Book events and vendors with no fees to browse, plan, or book.',
    features: [
      'Browse the full marketplace',
      'Request and compare quotes',
      'Book venues and vendors',
      'Secure messaging and payments',
      'No fees to plan or book',
    ],
    cta: 'Plan an event',
    ctaRole: 'client',
  },
  {
    audience: 'Venues',
    price: 'Free',
    priceNote: 'to join',
    blurb: 'List your space, fill your calendar, and earn on every booking.',
    features: [
      'Profile, calendar, and leads',
      'Bookings and revenue dashboard',
      'Vendor referrals',
      'Earn revenue share on every booking at your venue',
    ],
    seatLine: '1 seat included. Additional seats $10/mo.',
    cta: 'List your venue',
    ctaRole: 'venue',
    highlight: true,
  },
  {
    audience: 'Vendors',
    price: 'Free',
    priceNote: 'to join',
    blurb: 'Get found, win work, and only pay when you win business.',
    features: [
      'Profile and marketplace visibility',
      'Leads, quotes, and invoicing',
      'Reviews and a trust profile',
      'You only pay when you win business',
    ],
    seatLine: '1 seat included. Additional seats $10/mo.',
    cta: 'List your services',
    ctaRole: 'vendor',
  },
];

// Featured Vendor is advertising, not a membership tier.
const FEATURED_BENEFITS: string[] = [
  'Top placement in search results',
  'Featured badge on your profile',
  'Homepage placement',
  'Preferred matching on new requests',
];

// Plain language explanation of the single flat fee.
const FEE_POINTS: { t: string; s: string }[] = [
  {
    t: 'One flat 5% platform fee',
    s: 'A single 5% fee is added at checkout on top of the vendor price. No tiers, no percentages that change, no surprises.',
  },
  {
    t: 'Vendors keep their full quote',
    s: 'The fee sits on top of the vendor price, so vendors take home the full amount they quoted.',
  },
  {
    t: 'Clients see the fee clearly',
    s: 'The platform fee is shown plainly before any payment, so clients always know exactly what they are paying.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is it really free to join?',
    a: 'Yes. Clients, venues, and vendors all join for free. Clients pay no fees to browse, plan, or book. Venues and vendors get a full profile and one seat at no cost.',
  },
  {
    q: 'How does the platform fee work?',
    a: 'A flat 5% platform fee is added at checkout, on top of the vendor price. Vendors keep their full quote, and clients see the fee clearly before they pay.',
  },
  {
    q: 'How do seats work?',
    a: 'Every venue and vendor account includes one seat. If your team needs more logins, additional seats are $10 per seat per month, so coordinators and staff each get their own access while everything stays connected to your account.',
  },
  {
    q: 'What is Featured Vendor?',
    a: 'Featured Vendor is an optional advertising placement at $49 per month. It puts you at the top of search, adds a featured badge, places you on the homepage, and prioritizes you in matching. It is advertising, not a membership, and it is entirely optional.',
  },
  {
    q: 'Do venues earn money?',
    a: 'Yes. Venues earn revenue share on every booking that happens at their venue, on top of their free profile, calendar, leads, and revenue dashboard.',
  },
  {
    q: 'Are there any setup or listing fees?',
    a: 'No. There are no setup fees and no charge to list your venue or services. Vendors only pay when they win business through the platform.',
  },
];

export default function Pricing() {
  const nav = useNavigate();
  const join = (role?: string) => nav(role ? `/register?role=${role}` : '/register');
  const goFeatured = () => nav('/register?role=vendor');

  return (
    <>
      <SiteHeader active="/pricing" />
      <main className="pub prc">
        <style>{`
          .prc{background:var(--bg);color:var(--ink)}
          .prc .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
          .prc .wrapn{max-width:880px;margin:0 auto;padding:0 24px}
          .prc section{padding:58px 0;position:relative}

          /* hero */
          .prc .prc-hero{position:relative;overflow:hidden;isolation:isolate;padding:80px 0 60px;text-align:center}
          .prc .prc-hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 28% 12%,#1E5D4A 0%,#123c2e 52%,#0c2a20 100%);background-size:200% 200%;animation:prc-drift 24s ease-in-out infinite}
          .prc .prc-hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.28),rgba(9,28,22,.55))}
          @keyframes prc-drift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
          .prc .prc-hero h1{font-size:50px;line-height:1.05;letter-spacing:-.5px;max-width:780px;margin:0 auto;color:#fff}
          .prc .prc-hero p{font-size:17.5px;line-height:1.6;color:rgba(255,255,255,.88);max-width:640px;margin:18px auto 0}
          @media(max-width:640px){.prc .prc-hero h1{font-size:36px}}

          .prc .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .prc h2{font-size:36px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .prc .sectsub{text-align:center;color:var(--muted);font-size:16px;max-width:660px;margin:0 auto 38px;line-height:1.6}
          @media(max-width:620px){.prc h2{font-size:30px}}

          /* three plan cards */
          .prc .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:stretch}
          .prc .plan{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 26px;display:flex;flex-direction:column;position:relative}
          .prc .plan.hot{background:var(--emerald-deep);border-color:var(--emerald-deep);color:#fff;box-shadow:0 32px 64px -32px rgba(18,60,46,.6)}
          .prc .plan .au{font-size:13px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;color:var(--emerald);margin-bottom:14px}
          .prc .plan.hot .au{color:var(--champagne)}
          .prc .plan .pp{font-family:'Cormorant Garamond',serif;font-size:46px;font-weight:700;color:var(--emerald-deep);line-height:1}
          .prc .plan.hot .pp{color:#fff}
          .prc .plan .per{font-size:12.5px;color:var(--muted);margin:4px 0 16px}
          .prc .plan.hot .per{color:rgba(255,255,255,.72)}
          .prc .plan .blurb{font-size:14px;color:var(--ink);line-height:1.55;margin:0 0 18px;min-height:44px}
          .prc .plan.hot .blurb{color:rgba(255,255,255,.86)}
          .prc .plan ul{list-style:none;padding:0;margin:0 0 16px;flex:1}
          .prc .plan li{font-size:13.5px;padding:6px 0;display:flex;gap:8px;align-items:flex-start;line-height:1.45}
          .prc .plan li:before{content:"\\2713";color:var(--emerald);font-weight:700;flex-shrink:0}
          .prc .plan.hot li:before{color:var(--champagne)}
          .prc .plan .seat{font-size:12.5px;font-weight:700;color:var(--emerald);background:var(--ivory);border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:16px}
          .prc .plan.hot .seat{background:rgba(255,255,255,.08);border-color:rgba(217,204,176,.3);color:var(--champagne)}

          /* featured vendor */
          .prc .featured{background:var(--emerald-deep);border-radius:24px;padding:46px 40px;color:#fff;position:relative;overflow:hidden;display:grid;grid-template-columns:1.1fr 1fr;gap:32px;align-items:center}
          .prc .featured:before{content:"";position:absolute;inset:0;background:radial-gradient(90% 130% at 80% 0%,rgba(217,204,176,.18),transparent)}
          .prc .featured .fw{position:relative}
          .prc .featured .badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:var(--emerald-deep);background:var(--champagne);padding:7px 15px;border-radius:30px;margin-bottom:16px}
          .prc .featured h2{color:#fff;text-align:left;font-size:34px;margin-bottom:10px;max-width:420px}
          .prc .featured .price{font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:700;color:var(--champagne);margin:0 0 6px}
          .prc .featured .price span{font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:600;color:rgba(255,255,255,.72)}
          .prc .featured .lede{color:rgba(255,255,255,.86);font-size:15.5px;line-height:1.6;margin:0 0 22px;max-width:440px}
          .prc .featured .note{font-size:12.5px;color:rgba(255,255,255,.7);margin-top:14px}
          .prc .featured ul{list-style:none;padding:0;margin:0;position:relative}
          .prc .featured li{font-size:15px;padding:9px 0;display:flex;gap:10px;align-items:flex-start;line-height:1.4;color:#fff}
          .prc .featured li:before{content:"\\2713";color:var(--champagne);font-weight:700;flex-shrink:0}
          @media(max-width:740px){.prc .featured{grid-template-columns:1fr;padding:36px 26px}.prc .featured h2{font-size:28px}}

          /* fee explainer */
          .prc .fees{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:980px;margin:0 auto}
          .prc .feecard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px}
          .prc .feecard h3{font-size:18px;margin-bottom:8px}
          .prc .feecard p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}
          @media(max-width:720px){.prc .fees{grid-template-columns:1fr}}

          /* roi panel framing */
          .prc .roiwrap{max-width:980px;margin:38px auto 0}

          /* faq */
          .prc .faq{max-width:820px;margin:0 auto}
          .prc .qa{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:14px}
          .prc .qa h3{font-size:19px;margin-bottom:7px}
          .prc .qa p{font-size:14.5px;color:var(--muted);line-height:1.6;margin:0}

          /* closer */
          .prc .closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .prc .closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .prc .closer h2{color:#fff;margin-bottom:12px;position:relative}
          .prc .closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:560px;margin:0 auto 26px;position:relative;line-height:1.6}
          .prc .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

          @media(max-width:920px){.prc .plans{grid-template-columns:1fr}}
        `}</style>

        {/* HERO */}
        <section className="prc-hero">
          <div className="prc-hero-bg" />
          <div className="prc-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">Event Commerce Infrastructure</span>
            <h1>Free to join. Simple to grow on.</h1>
            <p>
              Clients book for free. Venues and vendors list for free and only pay when there is real
              business to share. One flat platform fee, shown plainly at checkout, with no tiers and no
              monthly minimums.
            </p>
          </div>
        </section>

        {/* THREE PLAN CARDS */}
        <section>
          <div className="wrap">
            <div className="kicker">One plan for each side</div>
            <h2>Built for clients, venues, and vendors</h2>
            <p className="sectsub">
              Everyone joins for free. Venues and vendors get a full profile and one seat at no cost,
              and only add to it when their business grows.
            </p>
            <div className="plans">
              {PLANS.map((p) => (
                <div className={'plan' + (p.highlight ? ' hot' : '')} key={p.audience}>
                  <div className="au">{p.audience}</div>
                  <div className="pp">{p.price}</div>
                  <div className="per">{p.priceNote}</div>
                  <p className="blurb">{p.blurb}</p>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {p.seatLine && <div className="seat">{p.seatLine}</div>}
                  <button className={'btn block' + (p.highlight ? ' gold' : ' primary')} onClick={() => join(p.ctaRole)}>
                    {p.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURED VENDOR */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="featured">
              <div className="fw">
                <span className="badge">Optional advertising</span>
                <h2>Featured Vendor</h2>
                <div className="price">
                  $49 <span>per month</span>
                </div>
                <p className="lede">
                  Want more visibility? Featured Vendor puts your business in front of more clients. It
                  is advertising, not membership, and it is entirely optional.
                </p>
                <button className="btn gold lg" onClick={goFeatured}>
                  Become a Featured Vendor
                </button>
                <div className="note">Cancel anytime. No long term commitment.</div>
              </div>
              <ul>
                {FEATURED_BENEFITS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* HOW THE FEE WORKS */}
        <section>
          <div className="wrap">
            <div className="kicker">How the fee works</div>
            <h2>One flat fee, added on top</h2>
            <p className="sectsub">
              A flat 5% platform fee is added at checkout, on top of the vendor price. Vendors keep
              their full quote, and clients always see the fee clearly before they pay.
            </p>
            <div className="fees">
              {FEE_POINTS.map((f) => (
                <div className="feecard" key={f.t}>
                  <h3>{f.t}</h3>
                  <p>{f.s}</p>
                </div>
              ))}
            </div>
            <div className="roiwrap">
              <RoiPanel
                metrics={[
                  { k: 'Quotes generated', v: '3,160', d: 'across the network' },
                  { k: 'Booking conversion', v: '+18 pts', d: 'vs manual outreach' },
                  { k: 'Time to first quote', v: '< 4 hrs', d: 'from one brief' },
                  { k: 'Repeat clients', v: '41%', d: 'on verified profiles' },
                  { k: 'Revenue created', v: '$9.4M', d: 'and counting' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrapn">
            <div className="kicker">Questions</div>
            <h2>Pricing FAQ</h2>
            <div className="faq" style={{ marginTop: 36 }}>
              {FAQ.map((f) => (
                <div className="qa" key={f.q}>
                  <h3>{f.q}</h3>
                  <p>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSER */}
        <section>
          <div className="wrap">
            <div className="closer">
              <h2>Join the event commerce network</h2>
              <p>Clients book for free. Venues and vendors list for free and only pay when there is real business to share.</p>
              <div className="cta">
                <button className="btn gold lg" onClick={() => join()}>
                  Get started free
                </button>
                <button className="btn ghost lg" onClick={() => nav('/register')}>
                  Get Started Today
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
