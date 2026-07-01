import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import BeforeAfter from '../../components/marketing/BeforeAfter';
import RoiPanel from '../../components/marketing/RoiPanel';

/**
 * ForPlanners - the planner positioning page for Divini Partners, the Venue
 * Intelligence and Revenue Infrastructure Platform. Shared public chrome, a
 * conversion hero, an animated event-journey stepper, an interactive AI Event
 * Assistant demo (deterministic, client-side), and an emotional close.
 */

type JourneyStep = { icon: string; title: string; note: string };

const JOURNEY: JourneyStep[] = [
  { icon: '\u{1F4A1}', title: 'Idea', note: 'Define the vision, budget, and guest count.' },
  { icon: '\u{1F3DB}\u{FE0F}', title: 'Venue', note: 'Match the right space from your network.' },
  { icon: '\u{1F91D}', title: 'Vendors', note: 'Source and compare in one place.' },
  { icon: '\u{1F3AF}', title: 'Sponsors', note: 'Turn the event into a revenue engine.' },
  { icon: '\u{2705}', title: 'Approvals', note: 'Clear contracts, permits, and sign-offs.' },
  { icon: '\u{1F465}', title: 'Guests', note: 'Manage lists, RSVPs, and seating.' },
  { icon: '\u{23F1}\u{FE0F}', title: 'Execution', note: 'Run the day on one shared timeline.' },
  { icon: '\u{2B50}', title: 'Success', note: 'Close out with reviews and reusable plays.' },
];

const VALUE: { t: string; d: string }[] = [
  { t: 'One command center', d: 'Run every event from a single workspace instead of a dozen tabs, inboxes, and spreadsheets.' },
  { t: 'Your network in one place', d: 'Discover venues and vendors, request quotes, and shortlist favorites without leaving the platform.' },
  { t: 'Everyone aligned', d: 'Keep clients, venues, vendors, and sponsors on shared timelines and threaded messaging so nothing slips.' },
  { t: 'Approvals that move', d: 'Track contracts, permits, and sign-offs in one approval flow with a clear, auditable record.' },
  { t: 'Revenue built in', d: 'Surface sponsorship and upsell opportunities on every event so each plan earns more than the last.' },
  { t: 'Your reputation travels', d: 'Carry verified reviews and a real event history that wins you the next client.' },
];

// ----- AI Event Assistant: deterministic generated plan -----
type PlanGroup = { title: string; icon: string; rows: { k: string; v: string }[] };

const ASSISTANT_PLAN: PlanGroup[] = [
  {
    title: 'Vendor recommendations',
    icon: '\u{1F91D}',
    rows: [
      { k: 'Catering', v: 'Maison Catering, passed canapes + 2 stations' },
      { k: 'Bar', v: 'Sterling Pour, 4 bartenders, craft cocktail package' },
      { k: 'AV & lighting', v: 'Lumen Stage, uplighting + wireless mics' },
      { k: 'Furniture', v: 'Atelier Rentals, lounge vignettes x6' },
    ],
  },
  {
    title: 'Budget estimate',
    icon: '\u{1F4B0}',
    rows: [
      { k: 'Venue & rooftop fee', v: '$14,500' },
      { k: 'Catering & bar (300 pax)', v: '$22,800' },
      { k: 'AV, lighting & furniture', v: '$9,400' },
      { k: 'Staffing & coordination', v: '$6,300' },
      { k: 'Projected total', v: '$53,000' },
    ],
  },
  {
    title: 'Suggested timeline',
    icon: '\u{23F1}\u{FE0F}',
    rows: [
      { k: '5:00 PM', v: 'Vendor load-in and final walkthrough' },
      { k: '6:30 PM', v: 'Doors open, welcome reception' },
      { k: '7:45 PM', v: 'Programmed networking + sponsor moment' },
      { k: '9:30 PM', v: 'Last call, wind-down set' },
      { k: '10:30 PM', v: 'Guest egress, load-out begins' },
    ],
  },
  {
    title: 'Sponsorship opportunities',
    icon: '\u{1F3AF}',
    rows: [
      { k: 'Bar sponsor', v: 'Beverage brand, branded cocktail, est. $9,000' },
      { k: 'Lounge sponsor', v: 'Naming + signage on lounge, est. $6,500' },
      { k: 'Welcome gift', v: 'Co-branded gifting partner, est. $4,000' },
    ],
  },
  {
    title: 'Required approvals',
    icon: '\u{2705}',
    rows: [
      { k: 'Rooftop occupancy permit', v: 'Verify cap for 300 with venue' },
      { k: 'Liquor license rider', v: 'Confirm caterer coverage or one-day permit' },
      { k: 'Certificate of insurance', v: 'Collect from each booked vendor' },
    ],
  },
  {
    title: 'Risk alerts',
    icon: '\u{26A0}\u{FE0F}',
    rows: [
      { k: 'Weather contingency', v: 'Rooftop, secure indoor backup or tenting' },
      { k: 'Capacity buffer', v: 'RSVP at 300, plan egress for 330 peak' },
      { k: 'Sound curfew', v: 'Amplified audio likely limited after 10 PM' },
    ],
  },
];

export default function ForPlanners() {
  const nav = useNavigate();
  const [generated, setGenerated] = useState(false);
  const [thinking, setThinking] = useState(false);

  const generate = () => {
    if (thinking) return;
    setGenerated(false);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setGenerated(true);
    }, 700);
  };

  return (
    <>
      <SiteHeader active="/for-planners" />
      <main className="pub pln">
        <style>{`
          .pln .pln-cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
          .pln section{padding:72px 0;position:relative}
          .pln .pln-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .pln h2{font-size:38px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .pln .pln-sub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 46px;line-height:1.6}

          /* event journey stepper */
          .pln-journey{background:#fff;border:1px solid var(--line);border-radius:20px;padding:34px 26px}
          .pln-jtrack{display:flex;flex-wrap:wrap;justify-content:center;gap:0}
          .pln-jstep{position:relative;flex:1 1 0;min-width:118px;max-width:170px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 6px}
          .pln-jnode{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;background:var(--ivory);border:1px solid var(--line);font-size:22px;position:relative;z-index:2;animation:pln-pop .5s ease both}
          .pln-jstep:nth-child(1) .pln-jnode{animation-delay:.05s}
          .pln-jstep:nth-child(2) .pln-jnode{animation-delay:.13s}
          .pln-jstep:nth-child(3) .pln-jnode{animation-delay:.21s}
          .pln-jstep:nth-child(4) .pln-jnode{animation-delay:.29s}
          .pln-jstep:nth-child(5) .pln-jnode{animation-delay:.37s}
          .pln-jstep:nth-child(6) .pln-jnode{animation-delay:.45s}
          .pln-jstep:nth-child(7) .pln-jnode{animation-delay:.53s}
          .pln-jstep:nth-child(8) .pln-jnode{animation-delay:.61s;background:var(--emerald);border-color:var(--emerald)}
          @keyframes pln-pop{from{opacity:0;transform:translateY(8px) scale(.9)}to{opacity:1;transform:none}}
          .pln-jt{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--emerald-deep);font-weight:700;margin-top:11px;line-height:1.1}
          .pln-jn{font-size:12px;color:var(--muted);line-height:1.45;margin-top:4px}
          .pln-jconn{position:absolute;top:27px;left:calc(50% + 30px);width:calc(100% - 60px);height:2px;background:linear-gradient(90deg,var(--emerald),var(--champagne));z-index:1}
          @media(max-width:820px){.pln-jtrack{flex-direction:column;align-items:stretch}.pln-jstep{flex-direction:row;text-align:left;gap:14px;max-width:none;padding:9px 0}.pln-jnode{margin-top:0}.pln-jt{margin-top:0}.pln-jconn{display:none}}

          /* AI event assistant */
          .pln-ai{background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px;max-width:880px;margin:0 auto}
          .pln-ai-head{display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:14px}
          .pln-ai-dot{width:9px;height:9px;border-radius:50%;background:var(--emerald);box-shadow:0 0 0 4px rgba(30,93,74,.14)}
          .pln-prompt{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:var(--ivory);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
          .pln-prompt input{flex:1;min-width:220px;border:none;background:transparent;font-size:15px;color:var(--ink);padding:6px 2px}
          .pln-prompt input:focus{outline:none}
          .pln-gen{display:inline-flex;align-items:center;gap:8px;background:var(--emerald);color:#fff;border:none;border-radius:11px;padding:11px 20px;font-family:Inter;font-size:14px;font-weight:600;cursor:pointer;transition:.15s}
          .pln-gen:hover{background:var(--emerald-mid)}
          .pln-gen:disabled{opacity:.7;cursor:default}
          .pln-hint{font-size:12.5px;color:var(--muted);margin:12px 2px 0}
          .pln-out{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
          @media(max-width:680px){.pln-out{grid-template-columns:1fr}}
          .pln-pcard{border:1px solid var(--line);border-radius:14px;padding:16px 18px;background:#fff;opacity:0;transform:translateY(10px);animation:pln-rise .5s ease forwards}
          .pln-pcard:nth-child(1){animation-delay:.04s}
          .pln-pcard:nth-child(2){animation-delay:.12s}
          .pln-pcard:nth-child(3){animation-delay:.2s}
          .pln-pcard:nth-child(4){animation-delay:.28s}
          .pln-pcard:nth-child(5){animation-delay:.36s}
          .pln-pcard:nth-child(6){animation-delay:.44s}
          @keyframes pln-rise{to{opacity:1;transform:none}}
          .pln-pc-title{display:flex;align-items:center;gap:8px;font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:700;color:var(--emerald-deep);margin-bottom:10px}
          .pln-pc-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line);font-size:13px}
          .pln-pc-row:first-of-type{border-top:none}
          .pln-pc-k{color:var(--muted);flex-shrink:0;max-width:46%}
          .pln-pc-v{color:var(--ink);font-weight:600;text-align:right}
          .pln-pcard.risk .pln-pc-title{color:#a3382f}
          .pln-typing{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:13.5px;margin-top:22px;padding:14px 16px;border:1px dashed var(--line);border-radius:14px}
          .pln-typing .pln-d{width:7px;height:7px;border-radius:50%;background:var(--emerald);animation:pln-blink 1s infinite}
          .pln-typing .pln-d:nth-child(2){animation-delay:.2s}
          .pln-typing .pln-d:nth-child(3){animation-delay:.4s}
          @keyframes pln-blink{0%,100%{opacity:.3}50%{opacity:1}}

          .pln-emote{background:var(--emerald-deep);border-radius:24px;padding:64px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .pln-emote:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .pln-emote h2{color:#fff;position:relative;font-size:40px;max-width:760px;margin:0 auto}
          .pln-emote p{color:rgba(255,255,255,.82);font-size:16.5px;max-width:560px;margin:18px auto 28px;position:relative;line-height:1.6}

          .pln-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
          .pln-vcard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 24px;transition:.2s}
          .pln-vcard:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(18,60,46,.4);border-color:var(--champagne)}
          .pln-vcard h3{font-size:21px;margin-bottom:9px}
          .pln-vcard p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}
          @media(max-width:880px){.pln-grid3{grid-template-columns:1fr 1fr}}
          @media(max-width:560px){.pln-grid3{grid-template-columns:1fr}.pln h2{font-size:30px}.pln-emote h2{font-size:30px}}
        `}</style>

        {/* HERO */}
        <section className="pub-hero">
          <div className="pub-hero-bg" />
          <div className="pub-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">For planners</span>
            <h1>Plan Exceptional Events Without the Chaos</h1>
            <p>
              One platform for venues, vendors, approvals, contracts, communications, timelines,
              sponsorships, and guest experiences.
            </p>
            <div className="ctas">
              <button className="btn gold lg" onClick={() => nav('/demo')}>
                Book a Demo
              </button>
              <button className="btn ghost lg" onClick={() => nav('/register?role=planner')}>
                Get started
              </button>
            </div>
          </div>
        </section>

        {/* EVENT JOURNEY */}
        <section>
          <div className="wrap">
            <div className="pln-kicker">The event journey</div>
            <h2>From first idea to flawless execution</h2>
            <p className="pln-sub">
              Every event moves through the same path. Divini Partners runs all of it in one place,
              so nothing falls between the cracks.
            </p>
            <div className="pln-journey">
              <div className="pln-jtrack">
                {JOURNEY.map((s, i) => (
                  <div className="pln-jstep" key={s.title}>
                    <div className="pln-jnode">{s.icon}</div>
                    <div className="pln-jt">{s.title}</div>
                    <div className="pln-jn">{s.note}</div>
                    {i < JOURNEY.length - 1 ? <div className="pln-jconn" /> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* AI EVENT ASSISTANT DEMO */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="pln-kicker">AI event assistant</div>
            <h2>Describe the event. Get a plan.</h2>
            <p className="pln-sub">
              Tell the assistant what you are planning and it returns vendor recommendations, a
              working budget, a timeline, sponsorship angles, the approvals you will need, and the
              risks to watch.
            </p>
            <div className="pln-ai">
              <div className="pln-ai-head">
                <span className="pln-ai-dot" /> Divini Event Assistant
              </div>
              <div className="pln-prompt">
                <input
                  defaultValue="300-Person Rooftop Networking Event"
                  aria-label="Describe your event"
                  readOnly
                />
                <button className="pln-gen" onClick={generate} disabled={thinking}>
                  {thinking ? 'Generating' : '✨ Generate'}
                </button>
              </div>
              <div className="pln-hint">
                Built on your network and your standards. Every number is an editable starting point.
              </div>

              {thinking ? (
                <div className="pln-typing">
                  <span className="pln-d" />
                  <span className="pln-d" />
                  <span className="pln-d" />
                  Reading the brief and assembling your plan
                </div>
              ) : null}

              {generated ? (
                <div className="pln-out">
                  {ASSISTANT_PLAN.map((g) => (
                    <div
                      className={'pln-pcard' + (g.title === 'Risk alerts' ? ' risk' : '')}
                      key={g.title}
                    >
                      <div className="pln-pc-title">
                        <span>{g.icon}</span>
                        {g.title}
                      </div>
                      {g.rows.map((r) => (
                        <div className="pln-pc-row" key={r.k}>
                          <span className="pln-pc-k">{r.k}</span>
                          <span className="pln-pc-v">{r.v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* VALUE */}
        <section>
          <div className="wrap">
            <div className="pln-kicker">Why planners choose Divini</div>
            <h2>Every event, fully under control</h2>
            <p className="pln-sub">
              Sourcing, coordination, approvals, payments, and revenue in one workspace built for
              the way you actually run events.
            </p>
            <div className="pln-grid3">
              {VALUE.map((b) => (
                <div className="pln-vcard" key={b.t}>
                  <h3>{b.t}</h3>
                  <p>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEFORE / AFTER + ROI */}
        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="pln-kicker">The difference</div>
            <h2>Stop rebuilding every event from scratch</h2>
            <p className="pln-sub">
              Build the plan once, then reuse the playbook on every event that follows.
            </p>
            <BeforeAfter
              beforeTitle="The old way"
              afterTitle="With Divini Partners"
              before={[
                { label: 'A dozen tabs and inboxes', sub: 'Every event coordinated from scratch' },
                { label: 'Quotes take days to compare', sub: 'Versions scattered across email' },
                { label: 'Approvals stall', sub: 'Contracts and permits lost in threads' },
                { label: 'Revenue left on the table', sub: 'No view of sponsorship or upsell' },
              ]}
              after={[
                { label: 'One command center', sub: 'Every event in a single workspace' },
                { label: 'Quotes side by side', sub: 'Compare against budget in real time' },
                { label: 'Approvals that move', sub: 'One auditable flow for every sign-off' },
                { label: 'Revenue built in', sub: 'Sponsorship and upsell on every event' },
              ]}
            />
            <div style={{ marginTop: 28 }}>
              <RoiPanel
                metrics={[
                  { k: 'Events in flight', v: '12', d: 'One dashboard' },
                  { k: 'Hours saved / event', v: '18', d: 'Less coordination' },
                  { k: 'Quote turnaround', v: 'Same day', d: 'Down from days' },
                  { k: 'Sponsorship captured', v: '+$19K', d: 'Per flagship event' },
                  { k: 'Vendor match rate', v: '94%', d: 'From your network' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* EMOTIONAL CLOSE */}
        <section>
          <div className="wrap">
            <div className="pln-emote">
              <h2>Spend less time coordinating. Spend more time creating unforgettable experiences.</h2>
              <p>Join the founding network of planners running premium events on Divini Partners.</p>
              <div className="pln-cta-row">
                <button className="btn gold lg" onClick={() => nav('/demo')}>
                  Book a Demo
                </button>
                <button className="btn ghost lg" onClick={() => nav('/register?role=planner')}>
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
