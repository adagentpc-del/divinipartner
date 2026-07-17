import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './public/components/PublicChrome';
import EcosystemGraph from '../components/marketing/EcosystemGraph';
import { reportSignal } from '../lib/fingerprint';

/* ------------------------------------------------------------------ *
 * Problem / Solution content
 * ------------------------------------------------------------------ */
const PAINS: { t: string; d: string }[] = [
  { t: 'Slow Quotes', d: 'Days lost waiting on pricing that should take minutes.' },
  { t: 'Missing Information', d: 'Guest counts, layouts, and requirements scattered across threads.' },
  { t: 'Endless Follow-Ups', d: 'Chasing confirmations one email at a time.' },
  { t: 'Vendor Confusion', d: 'Nobody sure who is responsible for what, or when.' },
  { t: 'Lost Revenue Opportunities', d: 'Upgrades, sponsorships, and rebookings left on the table.' },
];

const SOLUTIONS: { kicker: string; t: string; d: string }[] = [
  {
    kicker: 'Venue Intelligence',
    t: 'A living digital twin of every space',
    d: 'Capacity, availability, layouts, and pricing stay current, so every request maps to the right room instantly.',
  },
  {
    kicker: 'Vendor Intelligence',
    t: 'The right partners, matched and ranked',
    d: 'Category, region, and availability are matched against verified history to surface the vendors most likely to win.',
  },
  {
    kicker: 'Quote Automation',
    t: 'Accurate quotes the moment a request lands',
    d: 'Rental inventory and package pricing turn an inquiry into a precise, comparable quote in seconds.',
  },
  {
    kicker: 'Revenue Opportunities',
    t: 'Surface the upside on every event',
    d: 'Upgrades, add-ons, and sponsorship matches are flagged automatically, turning bookings into more revenue.',
  },
  {
    kicker: 'Approval Automation',
    t: 'Move from request to confirmed without the chase',
    d: 'Quotes, contracts, and deposits route to the right party with a complete record at every step.',
  },
  {
    kicker: 'Relationship Intelligence',
    t: 'Trust that compounds with every event',
    d: 'Verified reviews and shared history make the next booking faster than the last.',
  },
];

/* ------------------------------------------------------------------ *
 * Interactive Event Builder - fully client side, deterministic
 * ------------------------------------------------------------------ */
type EventType = 'Wedding' | 'Corporate' | 'Gala' | 'Conference' | 'Social';
type VenueType = 'Ballroom' | 'Estate' | 'Rooftop' | 'Hotel' | 'Modern Loft';

const EVENT_TYPES: EventType[] = ['Wedding', 'Corporate', 'Gala', 'Conference', 'Social'];
const VENUE_TYPES: VenueType[] = ['Ballroom', 'Estate', 'Rooftop', 'Hotel', 'Modern Loft'];

// Per-event-type vendor and sponsor pools, plus a budget multiplier per guest.
const EVENT_PROFILE: Record<
  EventType,
  { perGuest: number; vendors: string[]; sponsors: string[]; venues: VenueType[] }
> = {
  Wedding: {
    perGuest: 285,
    vendors: ['Catering', 'Florals', 'Photography', 'Entertainment', 'Rentals', 'Lighting'],
    sponsors: ['Luxury Spirits Brand', 'Premium Bridal Label', 'Fine Jewelry House'],
    venues: ['Estate', 'Ballroom', 'Rooftop'],
  },
  Corporate: {
    perGuest: 195,
    vendors: ['Catering', 'AV Production', 'Staging', 'Branding', 'Transportation', 'Security'],
    sponsors: ['Enterprise Software Brand', 'Financial Services Partner', 'Premium Beverage Brand'],
    venues: ['Hotel', 'Modern Loft', 'Ballroom'],
  },
  Gala: {
    perGuest: 340,
    vendors: ['Catering', 'Florals', 'Lighting', 'Entertainment', 'Staging', 'Auction Tech'],
    sponsors: ['Luxury Auto Brand', 'Private Banking Partner', 'Champagne House'],
    venues: ['Ballroom', 'Estate', 'Hotel'],
  },
  Conference: {
    perGuest: 165,
    vendors: ['Catering', 'AV Production', 'Staging', 'Registration Tech', 'Signage', 'Security'],
    sponsors: ['Technology Platform', 'Industry Association', 'Travel Partner'],
    venues: ['Hotel', 'Modern Loft', 'Ballroom'],
  },
  Social: {
    perGuest: 145,
    vendors: ['Catering', 'Entertainment', 'Bar Service', 'Rentals', 'Photography'],
    sponsors: ['Premium Beverage Brand', 'Lifestyle Label', 'Local Hospitality Partner'],
    venues: ['Rooftop', 'Modern Loft', 'Estate'],
  },
};

const BUDGET_BANDS = ['Value', 'Premium', 'Luxury'] as const;
type BudgetBand = (typeof BUDGET_BANDS)[number];
const BUDGET_MULT: Record<BudgetBand, number> = { Value: 0.8, Premium: 1, Luxury: 1.35 };

function formatUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function buildPlan(opts: {
  eventType: EventType;
  guests: number;
  venueType: VenueType;
  budget: BudgetBand;
}) {
  const profile = EVENT_PROFILE[opts.eventType];
  const base = profile.perGuest * opts.guests * BUDGET_MULT[opts.budget];
  // Larger events earn a slight volume efficiency, so per-guest cost eases off.
  const efficiency = opts.guests > 250 ? 0.93 : opts.guests > 120 ? 0.97 : 1;
  const estimate = base * efficiency;

  // Vendor count scales with guest count.
  const vendorCount = Math.max(3, Math.min(profile.vendors.length, Math.ceil(opts.guests / 45) + 2));
  const vendors = profile.vendors.slice(0, vendorCount);

  // Sponsors scale up for larger, higher-budget events.
  const sponsorCount =
    opts.guests >= 200 || opts.budget === 'Luxury'
      ? profile.sponsors.length
      : opts.guests >= 100
        ? 2
        : 1;
  const sponsors = profile.sponsors.slice(0, sponsorCount);

  // Timeline (lead weeks) scales with scale and formality.
  const weeks =
    8 +
    Math.round(opts.guests / 30) +
    (opts.eventType === 'Wedding' || opts.eventType === 'Gala' ? 6 : 0);

  // Venue suggestions: lead with the selected type, then profile favorites.
  const venueSuggestions = [
    opts.venueType,
    ...profile.venues.filter((v) => v !== opts.venueType),
  ].slice(0, 3);

  return {
    estimate,
    perGuest: estimate / opts.guests,
    vendors,
    sponsors,
    weeks,
    venueSuggestions,
  };
}

function EventBuilder() {
  const nav = useNavigate();
  const [eventType, setEventType] = useState<EventType>('Wedding');
  const [guests, setGuests] = useState(150);
  const [venueType, setVenueType] = useState<VenueType>('Estate');
  const [budget, setBudget] = useState<BudgetBand>('Premium');

  const plan = useMemo(
    () => buildPlan({ eventType, guests, venueType, budget }),
    [eventType, guests, venueType, budget],
  );

  return (
    <div className="lnd-builder">
      <div className="lnd-builder-controls">
        <label className="lnd-field">
          <span>Event Type</span>
          <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="lnd-field">
          <span>
            Guest Count <strong>{guests}</strong>
          </span>
          <input
            type="range"
            min={20}
            max={500}
            step={10}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </label>

        <label className="lnd-field">
          <span>Venue Type</span>
          <select value={venueType} onChange={(e) => setVenueType(e.target.value as VenueType)}>
            {VENUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="lnd-field">
          <span>Budget</span>
          <div className="lnd-segment">
            {BUDGET_BANDS.map((b) => (
              <button
                key={b}
                type="button"
                className={'lnd-seg-btn' + (budget === b ? ' on' : '')}
                onClick={() => setBudget(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </label>

        <button className="btn primary lg lnd-builder-cta" onClick={() => nav('/register')}>
          Build This Event With Us
        </button>
      </div>

      <div className="lnd-builder-output">
        <div className="lnd-out-head">Your live event blueprint</div>

        <div className="lnd-out-grid">
          <div className="lnd-out-stat">
            <div className="lnd-out-k">Estimated Budget</div>
            <div className="lnd-out-v">{formatUsd(plan.estimate)}</div>
            <div className="lnd-out-d">about {formatUsd(plan.perGuest)} per guest</div>
          </div>
          <div className="lnd-out-stat">
            <div className="lnd-out-k">Timeline</div>
            <div className="lnd-out-v">{plan.weeks} wks</div>
            <div className="lnd-out-d">recommended lead time</div>
          </div>
        </div>

        <div className="lnd-out-block">
          <div className="lnd-out-k">Recommended Vendors</div>
          <div className="lnd-chips">
            {plan.vendors.map((v) => (
              <span className="lnd-chip" key={v}>
                {v}
              </span>
            ))}
          </div>
        </div>

        <div className="lnd-out-block">
          <div className="lnd-out-k">Recommended Sponsors</div>
          <div className="lnd-chips">
            {plan.sponsors.map((s) => (
              <span className="lnd-chip gold" key={s}>
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="lnd-out-block">
          <div className="lnd-out-k">Venue Suggestions</div>
          <div className="lnd-chips">
            {plan.venueSuggestions.map((v) => (
              <span className="lnd-chip" key={v}>
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Landing page
 * ------------------------------------------------------------------ */
export default function Landing() {
  const nav = useNavigate();

  // Record one visitor signal per session (device fingerprint + IP + usage)
  // for security, fraud prevention, and attribution. Non-blocking and deduped
  // via a sessionStorage guard so it fires once. See the Privacy Policy.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('divini.signal') === '1') return;
      sessionStorage.setItem('divini.signal', '1');
    } catch {
      /* sessionStorage unavailable; still report once below */
    }
    void reportSignal(window.location.pathname);
  }, []);

  return (
    <>
      <SiteHeader active="/" />
      <main className="lnd">
        <style>{`
          .lnd{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}
          .lnd .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
          .lnd section{padding:80px 0;position:relative}
          .lnd h2{font-family:'Cormorant Garamond',serif;font-size:42px;line-height:1.05;letter-spacing:-.3px;text-align:center;margin:0 0 14px}
          .lnd .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .lnd .sectsub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 48px;line-height:1.6}

          /* HERO */
          .lnd-hero{position:relative;overflow:hidden;isolation:isolate;padding:96px 0 72px;text-align:center;background:radial-gradient(120% 120% at 18% 0%,#1E5D4A 0%,#123c2e 52%,#0c2a20 100%)}
          .lnd-hero .eyebrow{display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:var(--champagne);background:rgba(217,204,176,.12);border:1px solid rgba(217,204,176,.36);padding:7px 16px;border-radius:30px;margin-bottom:24px}
          .lnd-hero h1{font-family:'Cormorant Garamond',serif;font-size:60px;line-height:1.04;letter-spacing:-.5px;max-width:920px;margin:0 auto;color:#fff}
          .lnd-hero .lede{font-size:19px;line-height:1.65;color:rgba(255,255,255,.86);max-width:720px;margin:24px auto 34px}
          .lnd-hero .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
          .lnd-hero .btn.ghost{background:transparent;border-color:rgba(255,255,255,.5);color:#fff}
          .lnd-hero .btn.ghost:hover{background:rgba(255,255,255,.12);border-color:#fff}

          /* ECOSYSTEM panel */
          .lnd-eco{padding-top:0}
          .lnd-eco-card{background:#fff;border:1px solid var(--line);border-radius:24px;padding:30px;margin-top:-44px;position:relative;z-index:2;box-shadow:0 40px 90px -50px rgba(18,60,46,.5)}

          /* PROBLEM / SOLUTION */
          .lnd-pains{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:56px}
          .lnd-pain{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 18px}
          .lnd-pain .x{width:26px;height:26px;border-radius:8px;background:rgba(192,57,43,.1);color:var(--red);display:grid;place-items:center;font-weight:700;font-size:14px;margin-bottom:12px}
          .lnd-pain h3{font-size:16px;margin:0 0 6px;font-family:Inter;font-weight:700}
          .lnd-pain p{font-size:13px;color:var(--muted);line-height:1.5;margin:0}
          .lnd-sol{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
          .lnd-solcard{background:var(--emerald-deep);color:#fff;border-radius:18px;padding:28px;position:relative;overflow:hidden}
          .lnd-solcard:before{content:"";position:absolute;inset:0;background:radial-gradient(90% 130% at 100% 0%,rgba(217,204,176,.16),transparent)}
          .lnd-solcard .fk{font-size:11px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:var(--champagne);margin-bottom:10px;position:relative}
          .lnd-solcard h3{font-family:'Cormorant Garamond',serif;font-size:24px;line-height:1.1;margin:0 0 10px;color:#fff;position:relative}
          .lnd-solcard p{font-size:13.5px;color:rgba(255,255,255,.85);line-height:1.55;margin:0;position:relative}

          /* EVENT BUILDER */
          .lnd-builder{display:grid;grid-template-columns:1fr 1.1fr;gap:24px;align-items:stretch}
          .lnd-builder-controls{background:#fff;border:1px solid var(--line);border-radius:20px;padding:30px;display:flex;flex-direction:column;gap:22px}
          .lnd-field{display:flex;flex-direction:column;gap:9px}
          .lnd-field>span{font-size:13px;font-weight:700;color:var(--ink);display:flex;justify-content:space-between;align-items:baseline}
          .lnd-field>span strong{font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--emerald)}
          .lnd-field select{appearance:none;border:1px solid var(--line);border-radius:11px;padding:11px 14px;font-family:Inter;font-size:14px;font-weight:600;color:var(--emerald-deep);background:var(--ivory);cursor:pointer}
          .lnd-field input[type=range]{accent-color:var(--emerald);width:100%}
          .lnd-segment{display:flex;gap:8px}
          .lnd-seg-btn{flex:1;border:1px solid var(--line);background:var(--ivory);color:var(--emerald-deep);font-family:Inter;font-size:13px;font-weight:600;padding:10px;border-radius:11px;cursor:pointer;transition:.15s}
          .lnd-seg-btn.on{background:var(--emerald);border-color:var(--emerald);color:#fff}
          .lnd-builder-cta{margin-top:4px}
          .lnd-builder-output{background:var(--emerald-deep);color:#fff;border-radius:20px;padding:30px;position:relative;overflow:hidden}
          .lnd-builder-output:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 120% at 100% 0%,rgba(217,204,176,.16),transparent)}
          .lnd-out-head{font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:var(--champagne);margin-bottom:20px;position:relative}
          .lnd-out-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;position:relative}
          .lnd-out-stat{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:18px}
          .lnd-out-k{font-size:11px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:8px}
          .lnd-out-v{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700;color:#fff;line-height:1}
          .lnd-out-d{font-size:12px;color:rgba(255,255,255,.7);margin-top:6px}
          .lnd-out-block{position:relative;margin-bottom:18px}
          .lnd-out-block:last-child{margin-bottom:0}
          .lnd-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
          .lnd-chip{font-size:12.5px;font-weight:600;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);padding:7px 13px;border-radius:30px}
          .lnd-chip.gold{color:var(--emerald-deep);background:var(--champagne);border-color:var(--champagne)}

          /* EMOTIONAL BAND */
          .lnd-band{background:var(--emerald-deep);text-align:center;color:#fff;position:relative;overflow:hidden}
          .lnd-band:before{content:"";position:absolute;inset:0;background:radial-gradient(70% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .lnd-band h2{color:#fff;font-size:46px;max-width:840px;margin:0 auto;position:relative}
          .lnd-band p{color:var(--champagne);font-size:16px;letter-spacing:.4px;margin:18px auto 0;position:relative;font-weight:600}

          @media(max-width:900px){
            .lnd-pains{grid-template-columns:1fr 1fr}
            .lnd-sol{grid-template-columns:1fr}
            .lnd-builder{grid-template-columns:1fr}
          }
          @media(max-width:640px){
            .lnd-hero h1{font-size:40px}
            .lnd h2,.lnd-band h2{font-size:32px}
            .lnd-pains{grid-template-columns:1fr}
          }
        `}</style>

        {/* 1. HERO */}
        <section className="lnd-hero">
          <div className="wrap">
            <span className="eyebrow">Event Commerce Infrastructure</span>
            <h1>The Infrastructure Behind Every Booked Event</h1>
            <p className="lede">
              Divini Partners connects venues, vendors, planners, and clients on one network built
              for booking and running events. More bookings, more vendors, more revenue, less
              administration, and transparent transactions from first inquiry to final payment.
            </p>
            <div className="cta">
              <button className="btn gold lg" onClick={() => nav('/register')}>
                Get Started
              </button>
              <button className="btn ghost lg" onClick={() => nav('/marketplace')}>
                Explore the Marketplace
              </button>
            </div>
          </div>
        </section>

        {/* 2. HERO ECOSYSTEM ANIMATION */}
        <section className="lnd-eco">
          <div className="wrap">
            <div className="lnd-eco-card">
              <EcosystemGraph
                title="One intelligent network, working in real time"
                counters={[
                  { value: 4820, label: 'Opportunities Created' },
                  { value: 3160, label: 'Quotes Generated' },
                  { value: 9400000, label: 'Revenue Created', prefix: '$' },
                  { value: 1870, label: 'Vendor Matches' },
                  { value: 640, label: 'Sponsorship Opportunities' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* 3. PROBLEM / SOLUTION */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="kicker">The problem</div>
            <h2>Events Shouldn't Require Hundreds of Emails</h2>
            <p className="sectsub">
              Today an event lives across inboxes, spreadsheets, and phone calls. Divini Partners
              replaces the scramble with transparent transactions and far less administration.
            </p>
            <div className="lnd-pains">
              {PAINS.map((p) => (
                <div className="lnd-pain" key={p.t}>
                  <div className="x">✕</div>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              ))}
            </div>

            <div className="kicker">The platform</div>
            <h2>Intelligence at Every Layer of the Event</h2>
            <p className="sectsub">
              Six connected systems take an event from first inquiry to confirmed revenue, with no
              detail left to chance.
            </p>
            <div className="lnd-sol">
              {SOLUTIONS.map((s) => (
                <div className="lnd-solcard" key={s.kicker}>
                  <div className="fk">{s.kicker}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. INTERACTIVE EVENT BUILDER */}
        <section>
          <div className="wrap">
            <div className="kicker">Try it live</div>
            <h2>Build Your Event in Seconds</h2>
            <p className="sectsub">
              Set the type, scale, and budget. Watch Divini Partners shape the vendors, sponsors,
              budget, and timeline in real time.
            </p>
            <EventBuilder />
          </div>
        </section>

        {/* 5. EMOTIONAL STATEMENT BAND */}
        <section className="lnd-band">
          <div className="wrap">
            <h2>Stop rebuilding every event from scratch.</h2>
            <p>Build once. Scale forever.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
