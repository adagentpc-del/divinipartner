import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import FlowDiagram, { FlowStep } from '../../components/FlowDiagram';

/**
 * HowItWorks - the canonical workflow of the Venue Intelligence and Revenue
 * Infrastructure Platform, told as a seven step journey that lights up as you
 * scroll. Each step is grounded in a real platform capability: the Venue Digital
 * Twin, quote automation, the approval graph, the opportunity feed, and the
 * post event analytics layer. Owned page. Scoped under the .hiw- prefix.
 */

const FLOW_STEPS: FlowStep[] = [
  { icon: '\u{1F4C5}', title: 'Create Event', desc: 'Open the event with date, guest count, and budget.' },
  { icon: '\u{1F3DB}\u{FE0F}', title: 'Select Venue', desc: 'Match against the Venue Digital Twin.' },
  { icon: '\u{2728}', title: 'Receive Recommendations', desc: 'Vendors and sponsors surfaced by intelligence.' },
  { icon: '\u{1F4C4}', title: 'Generate Quote', desc: 'Accurate quotes build themselves.' },
  { icon: '\u{2705}', title: 'Approve', desc: 'Route through the approval graph.' },
  { icon: '\u{1F389}', title: 'Execute', desc: 'Run the day from one shared plan.' },
  { icon: '\u{1F4CA}', title: 'Analyze Results', desc: 'Close the loop with revenue analytics.' },
];

type Step = {
  n: string;
  title: string;
  feature: string;
  desc: string;
};

const STEPS: Step[] = [
  {
    n: '1',
    title: 'Create Event',
    feature: 'Event Workspace',
    desc: 'Every event begins as a single source of truth. Set the date, guest count, budget, and the look and feel, and a private workspace opens for the client, the planner, and every partner who joins. Nothing is rebuilt from scratch, because the platform carries the context forward from the first field you fill in.',
  },
  {
    n: '2',
    title: 'Select Venue',
    feature: 'Venue Digital Twin',
    desc: 'Match your event to the right space through the Venue Digital Twin, a living model of every room, capacity, layout, package, and rental item. Because the venue is already structured as data, the platform knows instantly what fits the date, the headcount, and the budget, and what the space can actually deliver.',
  },
  {
    n: '3',
    title: 'Receive Recommendations',
    feature: 'Opportunity Feed and Intelligence',
    desc: 'The intelligence layer reads the event and surfaces the right partners through the Opportunity Feed. Preferred vendors, sponsors, and upsell packages appear ranked to the brief, so the strongest options come to you instead of you chasing a dozen inboxes.',
  },
  {
    n: '4',
    title: 'Generate Quote',
    feature: 'Quote Automation',
    desc: 'Quotes build themselves. The moment a request lands, the Venue Digital Twin and each vendor catalog price the work automatically, producing clean, comparable quotes in minutes. No version confusion, no manual math, just transparent numbers everyone can trust.',
  },
  {
    n: '5',
    title: 'Approve',
    feature: 'Approval Graph',
    desc: 'Decisions route through the approval graph. Quotes, vendor selections, and contracts move to the right approver in the right order, with a complete record at every step. Sign off once and the whole event advances, deposits cleared and tracked.',
  },
  {
    n: '6',
    title: 'Execute',
    feature: 'Shared Run of Show',
    desc: 'Run the day from one shared plan. Guest lists, floorplans, seating charts, and the run of show stay in sync for the venue, the vendors, the planner, and the client on a single clock, so load in to last dance unfolds exactly as designed.',
  },
  {
    n: '7',
    title: 'Analyze Results',
    feature: 'Revenue Analytics',
    desc: 'Close the loop with analytics. See the revenue the event created across bookings, preferred vendors, sponsorships, and upsell, capture verified reviews, and feed every result back into the intelligence layer so the next event starts smarter than the last.',
  },
];

function StepRow({ step, index }: { step: Step; index: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLit(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={'hiw-item' + (lit ? ' lit' : '')}
      ref={ref}
      style={{ transitionDelay: `${(index % 2) * 0.08}s` }}
    >
      <div className="hiw-n">{step.n}</div>
      <div className="hiw-body">
        <div className="hiw-feature">{step.feature}</div>
        <h3>{step.title}</h3>
        <p>{step.desc}</p>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const nav = useNavigate();

  return (
    <div className="pub">
      <style>{`
        .hiw-main{background:var(--bg);color:var(--ink)}
        .hiw-sec{padding:72px 0;position:relative}
        .hiw-sec.ivory{background:var(--ivory)}
        .hiw-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
        .hiw-main h2{font-size:38px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
        .hiw-sub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 46px;line-height:1.6}

        .hiw-flow{position:relative;max-width:340px;margin:0 auto}
        .hiw-flow:before{content:"";position:absolute;left:26px;top:18px;bottom:18px;width:2px;background:var(--line)}
        .hiw-item{position:relative;display:flex;gap:0;padding:0 0 34px 74px;opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
        .hiw-item.lit{opacity:1;transform:translateY(0)}
        .hiw-item:last-child{padding-bottom:0}
        .hiw-n{position:absolute;left:0;top:0;width:54px;height:54px;border-radius:15px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;z-index:1;box-shadow:0 14px 28px -16px rgba(18,60,46,.6)}
        .hiw-item.lit .hiw-n{background:var(--emerald)}
        .hiw-feature{font-size:11px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:var(--emerald);margin-bottom:5px}
        .hiw-body h3{font-size:26px;margin-bottom:9px}
        .hiw-body p{font-size:15px;color:var(--muted);line-height:1.65;margin:0;max-width:680px}

        .hiw-stack{max-width:760px;margin:0 auto}

        .hiw-pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:1020px;margin:0 auto}
        .hiw-pillar{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 24px;transition:.2s}
        .hiw-pillar:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(18,60,46,.4);border-color:var(--champagne)}
        .hiw-pillar h3{font-size:20px;margin-bottom:8px}
        .hiw-pillar p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}

        .hiw-closer{background:var(--emerald-deep);border-radius:24px;padding:58px 32px;text-align:center;color:#fff;position:relative;overflow:hidden;max-width:1020px;margin:0 auto}
        .hiw-closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
        .hiw-closer h2{color:#fff;position:relative;margin-bottom:12px}
        .hiw-closer p{color:rgba(255,255,255,.82);font-size:16.5px;max-width:560px;margin:0 auto 28px;position:relative;line-height:1.6}
        .hiw-closer .ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative}

        @media(max-width:880px){.hiw-pillars{grid-template-columns:1fr}}
        @media(max-width:560px){.hiw-main h2{font-size:30px}.hiw-item{padding-left:64px}.hiw-flow:before{left:22px}.hiw-n{width:46px;height:46px;font-size:22px}.hiw-body h3{font-size:22px}}
      `}</style>

      <SiteHeader active="/how-it-works" />

      <main className="hiw-main">
        <section className="pub-hero">
          <div className="pub-hero-bg" />
          <div className="pub-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">How it works</span>
            <h1>From first idea to final results, in one intelligent flow</h1>
            <p>
              Divini Partners is the event commerce infrastructure that carries every event through
              one workflow. Seven steps take you from a spark to measurable results, with the venue,
              vendors, planner, and client all working from the same plan and the same transparent
              transactions.
            </p>
            <div className="ctas">
              <button className="btn gold lg" onClick={() => nav('/demo')}>
                Book a Demo
              </button>
              <button className="btn ghost lg" onClick={() => nav('/register')}>
                Get started
              </button>
            </div>
          </div>
        </section>

        <section className="hiw-sec">
          <div className="wrap">
            <div className="hiw-kicker">The workflow</div>
            <h2>One canonical flow</h2>
            <p className="hiw-sub">
              Watch the path light up. The same seven steps move every event from creation to results,
              each one powered by the platform underneath.
            </p>
            <FlowDiagram steps={FLOW_STEPS} />
          </div>
        </section>

        <section className="hiw-sec ivory">
          <div className="wrap">
            <div className="hiw-kicker">Step by step</div>
            <h2>The seven steps, grounded in the platform</h2>
            <p className="hiw-sub">
              Every step rests on real infrastructure: the Venue Digital Twin, quote automation, the
              approval graph, the opportunity feed, and the analytics that close the loop.
            </p>
            <div className="hiw-stack">
              <div className="hiw-flow">
                {STEPS.map((s, i) => (
                  <StepRow key={s.n} step={s} index={i} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="hiw-sec">
          <div className="wrap">
            <div className="hiw-kicker">The intelligence underneath</div>
            <h2>Why the flow works</h2>
            <p className="hiw-sub">
              The workflow is the surface. Underneath sits the infrastructure that makes each step fast,
              accurate, and compounding.
            </p>
            <div className="hiw-pillars">
              <div className="hiw-pillar">
                <h3>Venue Digital Twin</h3>
                <p>
                  Every room, capacity, layout, package, and rental item modeled as living data, so the
                  right space and the right quote are known the moment an event takes shape.
                </p>
              </div>
              <div className="hiw-pillar">
                <h3>Quote Automation</h3>
                <p>
                  Inventory and vendor catalogs price the work themselves. Clean, comparable quotes
                  generate in minutes and route straight into the approval graph.
                </p>
              </div>
              <div className="hiw-pillar">
                <h3>Revenue Analytics</h3>
                <p>
                  Every event reports the revenue it created across bookings, vendors, sponsorships, and
                  upsell, then feeds the intelligence layer so the next event starts smarter.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="hiw-sec ivory" style={{ paddingTop: 0, background: 'var(--bg)' }}>
          <div className="wrap">
            <div className="hiw-closer">
              <h2>Ready to run the whole flow?</h2>
              <p>
                See the seven steps move a real event end to end, then start building your own on the
                platform built for venue intelligence and revenue.
              </p>
              <div className="ctas">
                <button className="btn gold lg" onClick={() => nav('/demo')}>
                  Book a Demo
                </button>
                <button className="btn ghost lg" onClick={() => nav('/register')}>
                  Get started
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
