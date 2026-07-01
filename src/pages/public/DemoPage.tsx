import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import FlowDiagram, { FlowStep } from '../../components/FlowDiagram';
import ReadinessGauge from '../../components/marketing/ReadinessGauge';
import RevenueWaterfall from '../../components/marketing/RevenueWaterfall';
import BeforeAfter from '../../components/marketing/BeforeAfter';
import OpportunityFeedPreview from '../../components/marketing/OpportunityFeedPreview';
import RoiPanel from '../../components/marketing/RoiPanel';
import NetworkMap from '../../components/marketing/NetworkMap';
import Scorecard from '../../components/marketing/Scorecard';
import EcosystemGraph from '../../components/marketing/EcosystemGraph';

/**
 * DemoPage - the interactive "See Divini Partner In Action" page. Visitors pick
 * their world and a role specific demo loads below: a tailored headline, a few
 * highlight cards grounded in real platform features, and an embedded marketing
 * visual. Everything is client side and deterministic. Scoped under .dmo-.
 */

type RoleKey =
  | 'venue'
  | 'vendor'
  | 'planner'
  | 'sponsor'
  | 'agency'
  | 'developer'
  | 'property'
  | 'hospitality';

type Highlight = { t: string; d: string };

type RoleDemo = {
  label: string;
  registerRole: string; // mapped to a real register role
  eyebrow: string;
  headline: string;
  blurb: string;
  highlights: Highlight[];
  visual: 'venue' | 'vendor' | 'sponsor' | 'planner' | 'agency' | 'developer';
};

const PLANNER_FLOW: FlowStep[] = [
  { icon: '\u{1F4C5}', title: 'Create Event', desc: 'One workspace per client.' },
  { icon: '\u{1F3DB}\u{FE0F}', title: 'Select Venue', desc: 'Match the Venue Digital Twin.' },
  { icon: '\u{2728}', title: 'Recommendations', desc: 'Partners surfaced to the brief.' },
  { icon: '\u{1F4C4}', title: 'Generate Quote', desc: 'Quotes build themselves.' },
  { icon: '\u{2705}', title: 'Approve', desc: 'Route the approval graph.' },
  { icon: '\u{1F4CA}', title: 'Analyze', desc: 'Revenue results, every event.' },
];

const ROLES: { key: RoleKey; demo: RoleDemo }[] = [
  {
    key: 'venue',
    demo: {
      label: 'Venue',
      registerRole: 'venue',
      eyebrow: 'For venues and hotels',
      headline: 'Turn your space into living, revenue generating intelligence.',
      blurb:
        'Your rooms become a Venue Digital Twin, quotes generate the moment a request lands, and every event reports the revenue it created.',
      highlights: [
        { t: 'Venue Digital Twin', d: 'Rooms, capacities, layouts, and packages modeled as data that quotes itself.' },
        { t: 'Quote Automation', d: 'Accurate, comparable quotes generated in minutes from your own inventory.' },
        { t: 'Event Readiness', d: 'A live readiness score tracks how prepared each booking is, end to end.' },
        { t: 'Revenue Infrastructure', d: 'Bookings, preferred vendors, sponsorships, and upsell captured by default.' },
      ],
      visual: 'venue',
    },
  },
  {
    key: 'vendor',
    demo: {
      label: 'Vendor',
      registerRole: 'vendor',
      eyebrow: 'For vendors and suppliers',
      headline: 'Win more of the work you want, with less chasing.',
      blurb:
        'Stop rebuilding quotes from scratch and digging through inboxes. Matched opportunities come to you and a reusable catalog quotes the work.',
      highlights: [
        { t: 'Opportunity Feed', d: 'Matched events surface to you, ranked to your category and capacity.' },
        { t: 'Quote Automation', d: 'Build accurate quotes in minutes from a reusable catalog and bid to win.' },
        { t: 'Verified Reviews', d: 'Real event reviews compound into more of the work you actually want.' },
        { t: 'Clean Payouts', d: 'Tracked payouts with automatic invoicing at every step of the event.' },
      ],
      visual: 'vendor',
    },
  },
  {
    key: 'planner',
    demo: {
      label: 'Planner',
      registerRole: 'planner',
      eyebrow: 'For planners and agencies',
      headline: 'Run every client and every event from one canonical flow.',
      blurb:
        'The same seven step workflow carries each event from creation to results, and keeps venues, vendors, and clients aligned without chasing across inboxes.',
      highlights: [
        { t: 'One Workspace per Client', d: 'Spin up events for every client and manage them all from one place.' },
        { t: 'Recommendations', d: 'The right venues and vendors surface to the brief instead of you sourcing blind.' },
        { t: 'Approval Graph', d: 'Quotes, selections, and contracts route to the right approver in order.' },
        { t: 'Shared Run of Show', d: 'Everyone works from one plan and one clock, so nothing gets missed.' },
      ],
      visual: 'planner',
    },
  },
  {
    key: 'sponsor',
    demo: {
      label: 'Sponsor',
      registerRole: 'sponsor',
      eyebrow: 'For sponsors and brands',
      headline: 'Find the right rooms and prove the return.',
      blurb:
        'Discover sponsorship opportunities matched to your audience, activate across a real network of venues and events, and measure the impact that follows.',
      highlights: [
        { t: 'Sponsorship Opportunities', d: 'Matched events and audiences surfaced through the opportunity feed.' },
        { t: 'Network Activation', d: 'Reach a real network of premium venues, vendors, and planners in one place.' },
        { t: 'ROI Measurement', d: 'Impressions, engagement, leads, and revenue impact tracked per activation.' },
        { t: 'Relationship Graph', d: 'See how every partner connects, so the right introductions come faster.' },
      ],
      visual: 'sponsor',
    },
  },
  {
    key: 'agency',
    demo: {
      label: 'Agency',
      registerRole: 'planner',
      eyebrow: 'For event and creative agencies',
      headline: 'Scale every account on one intelligent operating layer.',
      blurb:
        'Run a portfolio of clients through the same canonical workflow, with recommendations, quote automation, and approvals built in so your team builds once and scales forever.',
      highlights: [
        { t: 'Portfolio Workspaces', d: 'Every client and event in one place, no rebuilding from scratch.' },
        { t: 'Recommendations', d: 'Venues, vendors, and sponsors surfaced to each brief automatically.' },
        { t: 'Approval Graph', d: 'Internal and client sign off routes cleanly with a complete record.' },
        { t: 'Revenue Analytics', d: 'Prove results to every client with revenue and ROI reporting.' },
      ],
      visual: 'agency',
    },
  },
  {
    key: 'developer',
    demo: {
      label: 'Developer',
      registerRole: 'venue',
      eyebrow: 'For developers and mixed use projects',
      headline: 'Make event space a measurable revenue line.',
      blurb:
        'Model every bookable space across your project as a Venue Digital Twin, automate quoting, and report the revenue your spaces generate across the whole portfolio.',
      highlights: [
        { t: 'Venue Digital Twin', d: 'Every bookable space across the project modeled as living, quotable data.' },
        { t: 'Quote Automation', d: 'Inbound demand priced automatically against each space and package.' },
        { t: 'Portfolio Revenue', d: 'Bookings, vendors, and sponsorships rolled up across every space you own.' },
        { t: 'Revenue Analytics', d: 'See which spaces perform and where new revenue is waiting to be captured.' },
      ],
      visual: 'developer',
    },
  },
  {
    key: 'property',
    demo: {
      label: 'Property Group',
      registerRole: 'venue',
      eyebrow: 'For property groups and portfolios',
      headline: 'Turn a portfolio of spaces into one revenue engine.',
      blurb:
        'Every property becomes a Venue Digital Twin with automated quoting and shared intelligence, so a portfolio of venues runs on one standard and one revenue layer.',
      highlights: [
        { t: 'Venue Digital Twin', d: 'Each property modeled once, then quoting and matching run automatically.' },
        { t: 'One Standard', d: 'A consistent partner network and run of show across every space you manage.' },
        { t: 'Portfolio Revenue', d: 'Bookings, preferred vendors, and sponsorships captured across the group.' },
        { t: 'Revenue Analytics', d: 'Compare performance across properties and find the next revenue opportunity.' },
      ],
      visual: 'developer',
    },
  },
  {
    key: 'hospitality',
    demo: {
      label: 'Hospitality Group',
      registerRole: 'venue',
      eyebrow: 'For hospitality groups and hotels',
      headline: 'Fill the calendar and run a flawless room, at scale.',
      blurb:
        'Bring inbound demand, your preferred vendor network, quote automation, and event readiness into one workspace across every property in the group.',
      highlights: [
        { t: 'Venue Digital Twin', d: 'Rooms, packages, and rental inventory modeled for instant, accurate quotes.' },
        { t: 'Preferred Network', d: 'A trusted circle of vendors held to your standard across every property.' },
        { t: 'Event Readiness', d: 'A live readiness score keeps every booking on track from hold to handoff.' },
        { t: 'Revenue Infrastructure', d: 'Sponsorship and upsell revenue captured by default, group wide.' },
      ],
      visual: 'venue',
    },
  },
];

function RoleVisual({ visual }: { visual: RoleDemo['visual'] }) {
  if (visual === 'venue') {
    return (
      <div className="dmo-visual-grid">
        <div className="dmo-visual-card center">
          <ReadinessGauge score={84} label="Event Readiness" />
        </div>
        <div className="dmo-visual-card">
          <RevenueWaterfall title="Revenue this event" />
        </div>
      </div>
    );
  }
  if (visual === 'vendor') {
    return (
      <div className="dmo-visual-grid">
        <div className="dmo-visual-card">
          <OpportunityFeedPreview title="Matched opportunities" />
        </div>
        <div className="dmo-visual-card">
          <BeforeAfter
            beforeTitle="The old way"
            afterTitle="With Divini"
            before={[
              { label: 'Rebuilding quotes from scratch', sub: 'Manual pricing, version confusion' },
              { label: 'Chasing inboxes for leads', sub: 'No matched pipeline' },
              { label: 'Payouts you have to track', sub: 'Invoicing by hand' },
            ]}
            after={[
              { label: 'Quotes from a reusable catalog', sub: 'Accurate in minutes' },
              { label: 'Matched opportunities come to you', sub: 'Ranked to your category' },
              { label: 'Clean, tracked payouts', sub: 'Automatic invoicing' },
            ]}
          />
        </div>
      </div>
    );
  }
  if (visual === 'sponsor') {
    return (
      <div className="dmo-visual-grid">
        <div className="dmo-visual-card">
          <RoiPanel />
        </div>
        <div className="dmo-visual-card">
          <NetworkMap center="Your Brand" title="Activation network" />
        </div>
      </div>
    );
  }
  if (visual === 'planner') {
    return (
      <div className="dmo-visual-card wide">
        <FlowDiagram
          title="The canonical flow you run for every client"
          steps={PLANNER_FLOW}
        />
      </div>
    );
  }
  if (visual === 'agency') {
    return (
      <div className="dmo-visual-grid">
        <div className="dmo-visual-card">
          <FlowDiagram title="One flow per client" steps={PLANNER_FLOW} />
        </div>
        <div className="dmo-visual-card center">
          <Scorecard
            title="Account Scorecard"
            score={91}
            rows={[
              { label: 'Active clients', value: '14' },
              { label: 'Events in flight', value: '38' },
              { label: 'Quote turnaround', value: 'Under 1 day' },
              { label: 'Client satisfaction', value: '4.9 / 5' },
            ]}
          />
        </div>
      </div>
    );
  }
  // developer / property group
  return (
    <div className="dmo-visual-grid">
      <div className="dmo-visual-card">
        <RevenueWaterfall
          title="Portfolio revenue"
          steps={[
            { label: 'Bookings', value: 186000 },
            { label: 'Preferred vendors', value: 64000 },
            { label: 'Sponsorships', value: 92000 },
            { label: 'Upsell packages', value: 38000 },
          ]}
        />
      </div>
      <div className="dmo-visual-card center">
        <EcosystemGraph showCounters={false} title="Spaces working as one" />
      </div>
    </div>
  );
}

export default function DemoPage() {
  const nav = useNavigate();
  const [active, setActive] = useState<RoleKey>('venue');
  const current = ROLES.find((r) => r.key === active)!.demo;

  return (
    <div className="pub">
      <style>{`
        .dmo-main{background:var(--bg);color:var(--ink)}
        .dmo-sec{padding:64px 0;position:relative}
        .dmo-sec.ivory{background:var(--ivory)}
        .dmo-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
        .dmo-main h2{font-size:34px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
        .dmo-sub{text-align:center;color:var(--muted);font-size:16px;max-width:640px;margin:0 auto 34px;line-height:1.6}

        .dmo-tabs{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:880px;margin:0 auto}
        .dmo-tab{border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:600;padding:10px 18px;border-radius:30px;cursor:pointer;transition:.15s}
        .dmo-tab:hover{border-color:var(--emerald);background:var(--ivory)}
        .dmo-tab.on{background:var(--emerald);border-color:var(--emerald);color:#fff;box-shadow:0 12px 24px -16px rgba(18,60,46,.6)}

        .dmo-panel{max-width:1080px;margin:38px auto 0}
        .dmo-feature-eyebrow{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:10px}
        .dmo-headline{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);font-size:34px;line-height:1.1;text-align:center;max-width:780px;margin:0 auto 12px}
        .dmo-blurb{text-align:center;color:var(--muted);font-size:16px;line-height:1.6;max-width:640px;margin:0 auto 32px}

        .dmo-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:840px;margin:0 auto 40px}
        .dmo-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 22px;transition:.2s}
        .dmo-card:hover{border-color:var(--champagne);box-shadow:0 20px 40px -28px rgba(18,60,46,.4)}
        .dmo-card h3{font-size:18px;margin-bottom:7px}
        .dmo-card p{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0}

        .dmo-visual-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch}
        .dmo-visual-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;display:flex;flex-direction:column;justify-content:center}
        .dmo-visual-card.center{align-items:center}
        .dmo-visual-card.wide{max-width:920px;margin:0 auto}

        .dmo-rolectas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:34px}

        .dmo-closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden;max-width:1020px;margin:0 auto}
        .dmo-closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
        .dmo-closer h2{color:#fff;position:relative;margin-bottom:12px}
        .dmo-closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:540px;margin:0 auto 26px;position:relative;line-height:1.6}
        .dmo-closer .ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative}

        @media(max-width:820px){.dmo-cards,.dmo-visual-grid{grid-template-columns:1fr}}
        @media(max-width:560px){.dmo-main h2{font-size:28px}.dmo-headline{font-size:27px}}
      `}</style>

      <SiteHeader active="/demo" />

      <main className="dmo-main">
        <section className="pub-hero">
          <div className="pub-hero-bg" />
          <div className="pub-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">See it live</span>
            <h1>See Divini Partner In Action</h1>
            <p>
              Walk through the Venue Intelligence and Revenue Infrastructure Platform from your point of
              view. Pick your world below and watch quotes generate themselves, your network run in one
              place, and new revenue surface.
            </p>
            <div className="ctas">
              <button className="btn gold lg" onClick={() => nav('/register')}>
                Get started
              </button>
              <button className="btn ghost lg" onClick={() => nav('/marketplace')}>
                Explore Opportunities
              </button>
            </div>
          </div>
        </section>

        <section className="dmo-sec ivory">
          <div className="wrap">
            <div className="dmo-kicker">Choose your world</div>
            <h2>A demo built for how you work</h2>
            <p className="dmo-sub">
              Select your role to load a tailored walkthrough, grounded in the real features you would
              use every day.
            </p>
            <div className="dmo-tabs" role="tablist">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  role="tab"
                  aria-selected={active === r.key}
                  className={'dmo-tab' + (active === r.key ? ' on' : '')}
                  onClick={() => setActive(r.key)}
                >
                  {r.demo.label}
                </button>
              ))}
            </div>

            <div className="dmo-panel" key={active}>
              <div className="dmo-feature-eyebrow">{current.eyebrow}</div>
              <div className="dmo-headline">{current.headline}</div>
              <p className="dmo-blurb">{current.blurb}</p>

              <div className="dmo-cards">
                {current.highlights.map((h) => (
                  <div className="dmo-card" key={h.t}>
                    <h3>{h.t}</h3>
                    <p>{h.d}</p>
                  </div>
                ))}
              </div>

              <RoleVisual visual={current.visual} />

              <div className="dmo-rolectas">
                <button
                  className="btn primary lg"
                  onClick={() => nav(`/register?role=${current.registerRole}`)}
                >
                  Get started
                </button>
                <button className="btn lg" onClick={() => nav('/demo')}>
                  Book a Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="dmo-sec">
          <div className="wrap">
            <div className="dmo-closer">
              <h2>Prefer a guided walkthrough?</h2>
              <p>
                Book time with our team and we will run your exact use case end to end on the platform
                built for venue intelligence and revenue.
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
