import { useNavigate } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import DeviceShowcase, { ShowScreen } from '../../components/DeviceShowcase';
import FlowDiagram, { FlowStep } from '../../components/FlowDiagram';

const DEMO_SCREENS: ShowScreen[] = [
  {
    title: 'Describe your event',
    caption: 'Tell us about your event in minutes',
    items: [
      { label: 'Event type', meta: 'Wedding reception', status: 'ok' },
      { label: 'Event date', meta: 'Saturday, October 11', status: 'ok' },
      { label: 'Guest count', meta: 'About 140 guests', status: 'gold' },
    ],
  },
  {
    title: 'Browse venues',
    caption: 'Discover and shortlist venues you love',
    items: [
      { label: 'The Emerald Conservatory', meta: 'Garden estate, seats 180', status: 'gold' },
      { label: 'Ivory Hall Ballroom', meta: 'Downtown, seats 160', status: 'ok' },
      { label: 'Champagne Vineyard Terrace', meta: 'Outdoor, seats 120', status: 'ok' },
    ],
  },
  {
    title: 'Compare quotes',
    caption: 'Compare real quotes side by side',
    items: [
      { label: 'Venue and catering', meta: 'Three quotes received', status: 'ok' },
      { label: 'Floral and decor', meta: 'Two quotes received', status: 'warn' },
      { label: 'Photography', meta: 'Four quotes received', status: 'ok' },
    ],
    chart: [54, 72, 61, 88, 70],
  },
  {
    title: 'Guest list and seating',
    caption: 'Manage your guest list and seating chart',
    items: [
      { label: 'RSVPs confirmed', meta: '112 of 140 responded', status: 'ok' },
      { label: 'Tables arranged', meta: '16 of 18 seated', status: 'warn' },
      { label: 'Dietary notes', meta: '9 special requests', status: 'gold' },
    ],
  },
  {
    title: 'Pay securely',
    caption: 'Pay, track invoices, and stay organized',
    big: { value: '$0', label: 'Free to plan' },
    chart: [40, 58, 66, 74, 90],
  },
];

const FLOW_STEPS: FlowStep[] = [
  { icon: '✨', title: 'Create a free profile', desc: 'Set up your client account in minutes, always free to plan.' },
  { icon: '📝', title: 'Describe the event', desc: 'Share the date, guest count, and the feeling you want.' },
  { icon: '🏛️', title: 'Book venue and request vendors', desc: 'Shortlist venues and invite the vendors you need.' },
  { icon: '💰', title: 'Compare and accept quotes', desc: 'Review transparent quotes side by side and approve the best.' },
  { icon: '📋', title: 'Plan the details', desc: 'Build guest lists, seating, and a shared run of show.' },
  { icon: '🎉', title: 'Enjoy the event and review', desc: 'Celebrate the day, then leave verified reviews for your team.' },
];

const BENEFITS: { t: string; d: string }[] = [
  { t: 'One portal for the whole event', d: 'Plan everything from the venue to the last detail in a single, calm workspace instead of a dozen tools.' },
  { t: 'Transparent quotes and secure pay', d: 'See clear pricing up front, then pay deposits and balances securely online with a full record.' },
  { t: 'Guest lists that build themselves', d: 'Create your list, share it, collect RSVPs, and watch your seating chart come together visually.' },
  { t: 'Everyone in one conversation', d: 'Message your venue, planner, and vendors in context, so nothing gets lost between inboxes.' },
  { t: 'A clear itinerary', d: 'Follow a shared run of show so the day unfolds exactly the way you imagined it.' },
  { t: 'Book with confidence', d: 'Verified reviews and a real trust layer mean you always know who you are working with.' },
];

const STEPS: { n: string; t: string; d: string }[] = [
  { n: '1', t: 'Tell us about your event', d: 'Share the date, guest count, budget, and the feeling you want, and your event workspace is created.' },
  { n: '2', t: 'Discover and shortlist', d: 'Browse vetted venues and vendors, save your favorites, and request quotes in a few clicks.' },
  { n: '3', t: 'Book and pay securely', d: 'Confirm your selections, sign off, and pay deposits and balances safely through the platform.' },
  { n: '4', t: 'Plan and enjoy the day', d: 'Build guest lists and seating, follow the itinerary, and let everyone work from the same plan.' },
];

export default function ForClients() {
  const nav = useNavigate();

  return (
    <>
      <SiteHeader active="/for-clients" />
      <main className="pub cli">
        <style>{`
          .cli section{padding:72px 0;position:relative}
          .cli .cli-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .cli h2{font-size:38px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .cli .cli-sub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 46px;line-height:1.6}

          .cli .cli-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
          .cli .cli-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:28px 24px;transition:.2s}
          .cli .cli-card:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(18,60,46,.4);border-color:var(--champagne)}
          .cli .cli-card h3{font-size:21px;margin-bottom:9px}
          .cli .cli-card p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}

          .cli .cli-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
          .cli .cli-step{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 22px}
          .cli .cli-step .n{width:38px;height:38px;border-radius:11px;background:var(--ivory);color:var(--emerald);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;margin-bottom:14px;border:1px solid var(--line)}
          .cli .cli-step h3{font-size:19px;margin-bottom:7px}
          .cli .cli-step p{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0}

          .cli .cli-closer{background:var(--emerald-deep);border-radius:24px;padding:58px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .cli .cli-closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .cli .cli-closer h2{color:#fff;position:relative}
          .cli .cli-closer p{color:rgba(255,255,255,.82);font-size:16.5px;max-width:560px;margin:0 auto 28px;position:relative;line-height:1.6}
          .cli .cli-cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

          @media(max-width:880px){.cli .cli-grid3,.cli .cli-steps{grid-template-columns:1fr 1fr}}
          @media(max-width:560px){.cli .cli-grid3,.cli .cli-steps{grid-template-columns:1fr}.cli h2{font-size:30px}}
        `}</style>

        <section className="pub-hero">
          <div className="pub-hero-bg" />
          <div className="pub-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">For clients and event bookers</span>
            <h1>Plan the event you pictured, with nothing left to chance.</h1>
            <p>
              One portal to discover venues and vendors, see clear quotes, and book securely. It is
              free to browse, plan, and book, and every fee is shown plainly before you pay.
            </p>
            <div className="ctas">
              <button className="btn gold lg" onClick={() => nav('/demo')}>
                Book a Demo
              </button>
              <button className="btn ghost lg" onClick={() => nav('/register?role=client')}>
                Get started
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="cli-kicker">Why clients choose Divini</div>
            <h2>Your whole event, beautifully handled</h2>
            <p className="cli-sub">Discovery, quotes, payments, guest lists, and coordination in one elegant place, free for clients.</p>
            <div className="cli-grid3">
              {BENEFITS.map((b) => (
                <div className="cli-card" key={b.t}>
                  <h3>{b.t}</h3>
                  <p>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="cli-kicker">See it in motion</div>
            <h2>Your event, beautifully in motion</h2>
            <p className="cli-sub">Watch the client experience come to life, from describing your event to paying securely, all in one calm portal.</p>
            <DeviceShowcase screens={DEMO_SCREENS} label="A live look at planning" />
          </div>
        </section>

        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <FlowDiagram
              title="How clients plan with Divini Partners"
              intro="A clear path from your first idea to a celebration everyone remembers, with every step in one place."
              steps={FLOW_STEPS}
            />
          </div>
        </section>

        <section style={{ background: 'var(--ivory)' }}>
          <div className="wrap">
            <div className="cli-kicker">How it works for clients</div>
            <h2>From idea to a flawless day</h2>
            <p className="cli-sub">Four simple steps take your event from a vision to a perfectly run celebration.</p>
            <div className="cli-steps">
              {STEPS.map((s) => (
                <div className="cli-step" key={s.n}>
                  <div className="n">{s.n}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="cli-closer">
              <h2>Start planning your event today</h2>
              <p>Clients always plan for free. Open your event workspace and bring your celebration to life.</p>
              <div className="cli-cta-row">
                <button className="btn gold lg" onClick={() => nav('/demo')}>
                  Book a Demo
                </button>
                <button className="btn ghost lg" onClick={() => nav('/register?role=client')}>
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
