import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import ReadinessGauge from '../../components/marketing/ReadinessGauge';
import RevenueWaterfall from '../../components/marketing/RevenueWaterfall';
import Scorecard from '../../components/marketing/Scorecard';
import AnimatedCounter from '../../components/marketing/AnimatedCounter';

/**
 * ForVenues - the Divini Partners venue page. Positioned as
 * "The Venue Intelligence and Revenue Infrastructure Platform."
 * Conversion-focused: hero, interactive Venue Digital Twin, a revenue
 * calculator, readiness + scorecard proof, and an emotional close.
 * Page-scoped styles live in the .vnu- block below.
 */

type TwinArea = {
  id: string;
  name: string;
  tag: string;
  measurements: string;
  restrictions: string[];
  inventory: string[];
  revenueOps: { label: string; value: string }[];
  sponsorships: { label: string; value: string }[];
};

const AREAS: TwinArea[] = [
  {
    id: 'lobby',
    name: 'Lobby',
    tag: 'Arrival and first impression',
    measurements: '2,400 sq ft, 18 ft ceilings, two entry points',
    restrictions: ['Clear egress paths required', 'No open flame', 'Floor protection for heavy installs'],
    inventory: ['Reception desk', '6 lounge clusters', 'Digital welcome wall', 'Coat check station'],
    revenueOps: [
      { label: 'Welcome activation rental', value: '$3,200 / event' },
      { label: 'Branded coat check', value: '$900 / event' },
      { label: 'Arrival photo moment', value: '$1,500 / event' },
    ],
    sponsorships: [
      { label: 'Lobby digital wall takeover', value: '$6,500' },
      { label: 'Welcome gifting station', value: '$4,000' },
    ],
  },
  {
    id: 'ballroom',
    name: 'Ballroom',
    tag: 'Your flagship revenue room',
    measurements: '6,800 sq ft, 24 ft ceilings, seats 420 banquet',
    restrictions: ['Max load 480 standing', 'Rigging by approved vendors only', 'Sound curfew 1:00 AM'],
    inventory: ['72 rounds', '480 chairs', 'Modular stage', 'House AV and lighting grid'],
    revenueOps: [
      { label: 'Premium evening rental', value: '$18,000 / event' },
      { label: 'Stage and rigging package', value: '$4,800 / event' },
      { label: 'Preferred catering minimum', value: '$24,000 / event' },
    ],
    sponsorships: [
      { label: 'Main stage naming', value: '$15,000' },
      { label: 'Table centerpiece branding', value: '$3,500' },
    ],
  },
  {
    id: 'pool',
    name: 'Pool Deck',
    tag: 'Daytime and golden hour',
    measurements: '4,100 sq ft deck, capacity 180, retractable shade',
    restrictions: ['Weather contingency required', 'No glassware poolside', 'Lifeguard for swim access'],
    inventory: ['12 cabanas', 'Bar build-out', 'Lounge seating', 'Sound system zone'],
    revenueOps: [
      { label: 'Daytime social rental', value: '$9,500 / event' },
      { label: 'Cabana reservations', value: '$650 each' },
      { label: 'Poolside bar package', value: '$7,200 / event' },
    ],
    sponsorships: [
      { label: 'Cabana brand wrap', value: '$5,000' },
      { label: 'Signature poolside cocktail', value: '$3,800' },
    ],
  },
  {
    id: 'rooftop',
    name: 'Rooftop',
    tag: 'Skyline and premium pricing',
    measurements: '3,600 sq ft, capacity 220, 360 degree views',
    restrictions: ['Wind limits on staging', 'Guardrail clearance maintained', 'Sound curfew 11:00 PM'],
    inventory: ['Built-in bar', 'Fire features', 'Lounge furniture', 'String lighting grid'],
    revenueOps: [
      { label: 'Sunset premium rental', value: '$14,500 / event' },
      { label: 'Fire feature lounge', value: '$2,400 / event' },
      { label: 'Skyline ceremony slot', value: '$6,000 / event' },
    ],
    sponsorships: [
      { label: 'Rooftop bar naming', value: '$9,000' },
      { label: 'Sunset moment branding', value: '$4,500' },
    ],
  },
  {
    id: 'screens',
    name: 'Screens',
    tag: 'Digital revenue surface',
    measurements: '5 LED screens, 280 sq ft total display area',
    restrictions: ['Content approved 48 hrs prior', 'Brand-safe content only', 'No audio bleed across rooms'],
    inventory: ['Lobby LED wall', 'Ballroom side screens', 'Rooftop ribbon display', 'Scheduling system'],
    revenueOps: [
      { label: 'Looped sponsor reel', value: '$2,800 / event' },
      { label: 'Wayfinding takeover', value: '$1,600 / event' },
      { label: 'Live social wall', value: '$2,200 / event' },
    ],
    sponsorships: [
      { label: 'Full screen network buyout', value: '$11,000' },
      { label: 'Single screen placement', value: '$3,200' },
    ],
  },
  {
    id: 'activation',
    name: 'Activation Areas',
    tag: 'Flexible brand footprints',
    measurements: '8 flex zones, 120 to 600 sq ft each',
    restrictions: ['Footprint approved per layout', 'Power load coordinated', 'No blocking fire lanes'],
    inventory: ['Pop-up footprints', 'Power and data drops', 'Modular walls', 'Sampling counters'],
    revenueOps: [
      { label: 'Brand activation footprint', value: '$4,500 / event' },
      { label: 'Sampling counter', value: '$1,900 / event' },
      { label: 'Experiential build slot', value: '$3,600 / event' },
    ],
    sponsorships: [
      { label: 'Anchor activation zone', value: '$8,500' },
      { label: 'Pop-up demo space', value: '$2,900' },
    ],
  },
];

const FEATURES: { t: string; d: string }[] = [
  {
    t: 'Inventory that quotes itself',
    d: 'Load every room, package, and rentable square foot once. Accurate quotes generate the moment a qualified request arrives.',
  },
  {
    t: 'Automated approvals',
    d: 'Route vendor approvals, holds, and sponsorship deals through a clean approval graph so nothing stalls in an inbox.',
  },
  {
    t: 'Qualified buyer demand',
    d: 'Inbound requests are matched to your space, capacity, and dates, so your calendar fills with events that actually fit.',
  },
  {
    t: 'Sponsorship revenue layer',
    d: 'Turn screens, activation zones, and naming moments into a structured sponsorship catalog buyers can book directly.',
  },
  {
    t: 'Your preferred vendor network',
    d: 'Keep a trusted circle of caterers, production, and floral partners who meet your standard and get first look at every event.',
  },
  {
    t: 'Payments handled cleanly',
    d: 'Deposits, balances, and vendor payouts move securely through the platform with a complete, auditable record.',
  },
];

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export default function ForVenues() {
  const nav = useNavigate();
  const [activeArea, setActiveArea] = useState<string>('ballroom');
  const area = AREAS.find((a) => a.id === activeArea) ?? AREAS[0];

  // Revenue calculator state
  const [eventsPerMonth, setEventsPerMonth] = useState(8);
  const [avgAttendance, setAvgAttendance] = useState(180);
  const [currentSponsorship, setCurrentSponsorship] = useState(40000);

  const calc = useMemo(() => {
    const eventsPerYear = eventsPerMonth * 12;
    // Deterministic model: unlocked value per attendee per event from
    // activation, screens, and sponsorship surfaces the platform exposes.
    const sponsorshipPerAttendee = 22; // unlocked sponsorship value per head
    const newSponsorship = eventsPerYear * avgAttendance * sponsorshipPerAttendee;
    const upliftOnExisting = currentSponsorship * 0.35; // intelligence uplift on current
    const bookingUplift = eventsPerYear * avgAttendance * 9; // tighter inventory + demand
    const total = newSponsorship + upliftOnExisting + bookingUplift;
    return {
      eventsPerYear,
      newSponsorship,
      upliftOnExisting,
      bookingUplift,
      total,
    };
  }, [eventsPerMonth, avgAttendance, currentSponsorship]);

  return (
    <>
      <SiteHeader active="/for-venues" />
      <main className="vnu">
        <style>{`
          .vnu{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}
          .vnu .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
          .vnu section{padding:74px 0;position:relative}
          .vnu .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .vnu h2{font-size:38px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .vnu .sectsub{text-align:center;color:var(--muted);font-size:16.5px;max-width:680px;margin:0 auto 46px;line-height:1.6}

          /* Hero */
          .vnu .vnu-hero{position:relative;overflow:hidden;isolation:isolate;padding:104px 0 90px;text-align:center}
          .vnu .vnu-hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 20% 10%,#1E5D4A 0%,#123c2e 50%,#0c2a20 100%);background-size:200% 200%;animation:vnudrift 24s ease-in-out infinite}
          .vnu .vnu-hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.25),rgba(9,28,22,.55))}
          @keyframes vnudrift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
          .vnu .vnu-eyebrow{display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:var(--champagne);background:rgba(217,204,176,.12);border:1px solid rgba(217,204,176,.36);padding:7px 16px;border-radius:30px;margin-bottom:22px}
          .vnu .vnu-hero h1{font-size:56px;line-height:1.05;letter-spacing:-.5px;max-width:860px;margin:0 auto;color:#fff}
          .vnu .vnu-hero p{font-size:18px;line-height:1.65;color:rgba(255,255,255,.88);max-width:680px;margin:22px auto 30px}
          .vnu .vnu-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
          @media(max-width:640px){.vnu .vnu-hero h1{font-size:38px}}

          /* Feature grid */
          .vnu .vnu-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
          .vnu .vnu-fcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:28px 24px;transition:.2s}
          .vnu .vnu-fcard:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(18,60,46,.4);border-color:var(--champagne)}
          .vnu .vnu-fcard h3{font-size:20px;margin-bottom:9px}
          .vnu .vnu-fcard p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}

          /* Digital twin */
          .vnu .vnu-twin{display:grid;grid-template-columns:1.05fr 1fr;gap:26px;align-items:start}
          .vnu .vnu-floor{background:linear-gradient(160deg,#123c2e,#0c2a20);border-radius:20px;padding:22px;border:1px solid rgba(217,204,176,.18)}
          .vnu .vnu-floor-h{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--champagne);font-weight:700;margin-bottom:14px}
          .vnu .vnu-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
          .vnu .vnu-tile{text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(217,204,176,.22);border-radius:14px;padding:16px 16px;cursor:pointer;color:#fff;transition:.16s;font-family:Inter}
          .vnu .vnu-tile:hover{background:rgba(255,255,255,.1);border-color:rgba(217,204,176,.5);transform:translateY(-2px)}
          .vnu .vnu-tile.on{background:var(--champagne);border-color:var(--champagne);color:var(--emerald-deep)}
          .vnu .vnu-tile .tn{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;line-height:1.1}
          .vnu .vnu-tile .tg{font-size:11.5px;opacity:.78;margin-top:4px;line-height:1.35}
          .vnu .vnu-tile.on .tg{opacity:.85}
          .vnu .vnu-floor-foot{margin-top:14px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.5}

          .vnu .vnu-panel{background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px 26px 28px;box-shadow:0 24px 48px -34px rgba(18,60,46,.4)}
          .vnu .vnu-panel-tag{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700}
          .vnu .vnu-panel h3{font-size:28px;margin:4px 0 2px}
          .vnu .vnu-panel .meas{font-size:13.5px;color:var(--muted);margin-bottom:18px}
          .vnu .vnu-block{margin-top:16px}
          .vnu .vnu-block .bh{font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px}
          .vnu .vnu-pills{display:flex;flex-wrap:wrap;gap:7px}
          .vnu .vnu-pill{font-size:12px;font-weight:600;color:var(--emerald-deep);background:var(--ivory);border:1px solid var(--line);border-radius:20px;padding:5px 11px}
          .vnu .vnu-rev{list-style:none;margin:0;padding:0}
          .vnu .vnu-rev li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px}
          .vnu .vnu-rev li:last-child{border-bottom:none}
          .vnu .vnu-rev .lbl{color:var(--ink)}
          .vnu .vnu-rev .val{font-weight:700;color:var(--emerald-deep);white-space:nowrap}
          .vnu .vnu-rev .val.gold{color:#9a7b2e}
          @media(max-width:880px){.vnu .vnu-twin{grid-template-columns:1fr}}

          /* Calculator */
          .vnu .vnu-calc{display:grid;grid-template-columns:.9fr 1.1fr;gap:26px;align-items:stretch}
          .vnu .vnu-calc-form{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px}
          .vnu .vnu-field{margin-bottom:20px}
          .vnu .vnu-field:last-child{margin-bottom:0}
          .vnu .vnu-field label{display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:9px}
          .vnu .vnu-field label .v{color:var(--emerald);font-weight:700}
          .vnu .vnu-field input[type=range]{width:100%;accent-color:var(--emerald);cursor:pointer}
          .vnu .vnu-calc-out{background:linear-gradient(160deg,#123c2e,#0c2a20);border-radius:20px;padding:30px 28px;color:#fff;display:flex;flex-direction:column;justify-content:center;border:1px solid rgba(217,204,176,.18)}
          .vnu .vnu-calc-out .ol{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--champagne);font-weight:700;text-align:center;margin-bottom:6px}
          .vnu .vnu-calc-out .big{font-family:'Cormorant Garamond',serif;font-size:58px;font-weight:700;line-height:1;text-align:center;color:#fff}
          .vnu .vnu-calc-out .note{font-size:12.5px;color:rgba(255,255,255,.7);text-align:center;margin-top:8px;line-height:1.5}
          .vnu .vnu-calc-out .mk-counter .mk-v{color:#fff}
          .vnu .vnu-calc-wf{margin-top:22px}
          @media(max-width:880px){.vnu .vnu-calc{grid-template-columns:1fr}}

          /* Proof */
          .vnu .vnu-proof{display:grid;grid-template-columns:300px 1fr;gap:30px;align-items:center}
          .vnu .vnu-proof .gaugewrap{display:flex;justify-content:center}
          @media(max-width:880px){.vnu .vnu-proof{grid-template-columns:1fr;gap:24px}}

          /* Emotional statement */
          .vnu .vnu-emote{background:var(--emerald-deep);border-radius:24px;padding:64px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .vnu .vnu-emote:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.2),transparent)}
          .vnu .vnu-emote h2{color:#fff;position:relative;font-size:42px;max-width:780px;margin:0 auto;line-height:1.12}
          .vnu .vnu-emote p{color:rgba(255,255,255,.82);font-size:16.5px;max-width:560px;margin:18px auto 28px;position:relative;line-height:1.6}
          .vnu .vnu-emote p.vnu-emote-accent{color:var(--champagne);font-size:18.5px;font-weight:600;max-width:640px;margin:20px auto 4px}
          .vnu .vnu-emote .vnu-cta{position:relative}

          @media(max-width:880px){.vnu .vnu-grid3{grid-template-columns:1fr 1fr}}
          @media(max-width:560px){.vnu .vnu-grid3{grid-template-columns:1fr}.vnu h2{font-size:30px}.vnu .vnu-emote h2{font-size:30px}.vnu .vnu-tiles{grid-template-columns:1fr}.vnu .vnu-calc-out .big{font-size:44px}}
        `}</style>

        {/* HERO */}
        <section className="vnu-hero">
          <div className="vnu-hero-bg" />
          <div className="vnu-hero-scrim" />
          <div className="wrap">
            <span className="vnu-eyebrow">Event Commerce Infrastructure</span>
            <h1>Turn Your Venue Into a Revenue Engine</h1>
            <p>
              List for free, fill your calendar with qualified bookings, and earn revenue share on
              every booking at your venue. More bookings and more revenue, with far less
              administration.
            </p>
            <div className="vnu-cta">
              <button className="btn gold lg" onClick={() => nav('/register?role=venue')}>
                Get started
              </button>
            </div>
          </div>
        </section>

        {/* FEATURE GRID */}
        <section>
          <div className="wrap">
            <div className="kicker">Why venues choose Divini</div>
            <h2>One platform for inventory, approvals, demand, and revenue</h2>
            <p className="sectsub">
              Every booking, vendor, and sponsorship dollar runs through one intelligent system built
              for premium spaces and the teams that run them.
            </p>
            <div className="vnu-grid3">
              {FEATURES.map((f) => (
                <div className="vnu-fcard" key={f.t}>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* INTERACTIVE VENUE DIGITAL TWIN */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="kicker">Interactive Venue Digital Twin</div>
            <h2>Every square foot, mapped to revenue</h2>
            <p className="sectsub">
              Select an area to see its measurements, restrictions, inventory, revenue opportunities,
              and available sponsorships. This is how Divini turns your space into bookable, priceable
              intelligence.
            </p>
            <div className="vnu-twin">
              <div className="vnu-floor">
                <div className="vnu-floor-h">Venue floorplan</div>
                <div className="vnu-tiles">
                  {AREAS.map((a) => (
                    <button
                      key={a.id}
                      className={'vnu-tile' + (a.id === activeArea ? ' on' : '')}
                      onClick={() => setActiveArea(a.id)}
                      aria-pressed={a.id === activeArea}
                    >
                      <div className="tn">{a.name}</div>
                      <div className="tg">{a.tag}</div>
                    </button>
                  ))}
                </div>
                <div className="vnu-floor-foot">
                  Click any area to inspect its digital twin. Every detail stays in sync with your
                  live inventory and quotes.
                </div>
              </div>

              <div className="vnu-panel">
                <div className="vnu-panel-tag">{area.tag}</div>
                <h3>{area.name}</h3>
                <div className="meas">{area.measurements}</div>

                <div className="vnu-block">
                  <div className="bh">Restrictions</div>
                  <div className="vnu-pills">
                    {area.restrictions.map((r) => (
                      <span className="vnu-pill" key={r}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="vnu-block">
                  <div className="bh">Inventory</div>
                  <div className="vnu-pills">
                    {area.inventory.map((it) => (
                      <span className="vnu-pill" key={it}>
                        {it}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="vnu-block">
                  <div className="bh">Revenue opportunities</div>
                  <ul className="vnu-rev">
                    {area.revenueOps.map((o) => (
                      <li key={o.label}>
                        <span className="lbl">{o.label}</span>
                        <span className="val">{o.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="vnu-block">
                  <div className="bh">Available sponsorships</div>
                  <ul className="vnu-rev">
                    {area.sponsorships.map((s) => (
                      <li key={s.label}>
                        <span className="lbl">{s.label}</span>
                        <span className="val gold">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* REVENUE CALCULATOR */}
        <section>
          <div className="wrap">
            <div className="kicker">Revenue calculator</div>
            <h2>See what your space could unlock</h2>
            <p className="sectsub">
              Adjust your numbers to estimate the annual revenue growth Divini can surface from
              demand, tighter inventory, and a structured sponsorship layer.
            </p>
            <div className="vnu-calc">
              <div className="vnu-calc-form">
                <div className="vnu-field">
                  <label>
                    Events per month <span className="v">{eventsPerMonth}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={eventsPerMonth}
                    onChange={(e) => setEventsPerMonth(Number(e.target.value))}
                  />
                </div>
                <div className="vnu-field">
                  <label>
                    Average attendance <span className="v">{avgAttendance}</span>
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={600}
                    step={10}
                    value={avgAttendance}
                    onChange={(e) => setAvgAttendance(Number(e.target.value))}
                  />
                </div>
                <div className="vnu-field">
                  <label>
                    Current sponsorship revenue <span className="v">{fmtUsd(currentSponsorship)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={500000}
                    step={5000}
                    value={currentSponsorship}
                    onChange={(e) => setCurrentSponsorship(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="vnu-calc-out">
                <div className="ol">Potential annual revenue growth</div>
                <AnimatedCounter value={Math.round(calc.total)} prefix="$" durationMs={1100} />
                <div className="note">
                  Estimated across {calc.eventsPerYear} events per year from new sponsorship surfaces,
                  uplift on existing revenue, and tighter inventory and demand.
                </div>
                <div className="vnu-calc-wf">
                  <RevenueWaterfall
                    title="Where the growth comes from"
                    steps={[
                      { label: 'Booking uplift', value: Math.round(calc.bookingUplift) },
                      { label: 'New sponsorships', value: Math.round(calc.newSponsorship) },
                      { label: 'Existing uplift', value: Math.round(calc.upliftOnExisting) },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROOF: READINESS + SCORECARD */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="kicker">Venue intelligence</div>
            <h2>Know exactly how bookable you are</h2>
            <p className="sectsub">
              Divini scores your readiness the moment a request arrives, so you respond faster, price
              with confidence, and win the events that fit.
            </p>
            <div className="vnu-proof">
              <div className="gaugewrap">
                <ReadinessGauge score={86} label="Venue Readiness" size={220} />
              </div>
              <Scorecard
                title="Venue Scorecard"
                score={92}
                rows={[
                  { label: 'Response time', value: 'Under 2 hrs' },
                  { label: 'Inventory mapped', value: '100%' },
                  { label: 'Sponsorship surfaces live', value: '14' },
                  { label: 'Booking conversion', value: '68%' },
                  { label: 'Verified reviews', value: '4.9 / 5' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* EMOTIONAL STATEMENT */}
        <section>
          <div className="wrap">
            <div className="vnu-emote">
              <h2>Your venue already contains hidden revenue. We help you unlock it.</h2>
              <p className="vnu-emote-accent">
                Every square foot is an opportunity. Turn unused inventory into recurring revenue.
              </p>
              <p>
                Join the founding network of venues defining the standard for intelligent, fully
                booked, beautifully run events.
              </p>
              <div className="vnu-cta">
                <button className="btn gold lg" onClick={() => nav('/register?role=venue')}>
                  Get started
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
