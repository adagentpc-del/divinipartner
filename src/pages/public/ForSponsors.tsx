import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from './components/PublicChrome';
import RoleValue from '../../components/marketing/RoleValue';
import NetworkMap from '../../components/marketing/NetworkMap';
import RoiPanel from '../../components/marketing/RoiPanel';
import OpportunityFeedPreview from '../../components/marketing/OpportunityFeedPreview';
import AnimatedCounter from '../../components/marketing/AnimatedCounter';

/**
 * ForSponsors - public marketing page for sponsors and brands. Conversion-aware
 * page for The Venue Intelligence and Revenue Infrastructure Platform. An
 * interactive opportunity map lets a brand pick a venue category and reveals
 * deterministic, client-side sample sponsorship opportunities with audience
 * size, placement type, and projected reach. An ROI dashboard and proof band
 * close the case. All page styling is scoped under .spo- in a single style block.
 */

type Opp = {
  name: string;
  placement: string;
  audience: string;
  reach: string;
};

type Category = {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  opps: Opp[];
};

const CATEGORIES: Category[] = [
  {
    key: 'hotels',
    label: 'Hotels',
    icon: '🏨',
    blurb: 'Luxury and lifestyle properties with high-intent, high-dwell-time guests.',
    opps: [
      { name: 'Rooftop arrival lounge takeover', placement: 'Branded environment', audience: '14,000 guests / quarter', reach: '210K impressions' },
      { name: 'In-room welcome experience', placement: 'Product placement', audience: '9,200 stays / quarter', reach: '138K impressions' },
      { name: 'Lobby tasting activation', placement: 'Sampling and demo', audience: '6,500 guests / month', reach: '96K impressions' },
    ],
  },
  {
    key: 'venues',
    label: 'Venues',
    icon: '🏛️',
    blurb: 'Premium event venues hosting galas, weddings, and corporate functions.',
    opps: [
      { name: 'Gala title sponsorship', placement: 'Naming and stage', audience: '1,800 guests / event', reach: '340K impressions' },
      { name: 'Hospitality suite presence', placement: 'Branded environment', audience: '420 VIPs / event', reach: '64K impressions' },
      { name: 'Welcome reception bar', placement: 'Sampling and demo', audience: '1,200 guests / event', reach: '88K impressions' },
    ],
  },
  {
    key: 'festivals',
    label: 'Festivals',
    icon: '🎪',
    blurb: 'Multi-day festivals with massive footfall and deep social amplification.',
    opps: [
      { name: 'Main stage presenting partner', placement: 'Naming and stage', audience: '48,000 attendees / weekend', reach: '4.2M impressions' },
      { name: 'Branded chill-out zone', placement: 'Branded environment', audience: '22,000 visits / day', reach: '1.6M impressions' },
      { name: 'Sampling and activation alley', placement: 'Sampling and demo', audience: '31,000 touchpoints / weekend', reach: '2.1M impressions' },
    ],
  },
  {
    key: 'sporting',
    label: 'Sporting Events',
    icon: '🏟️',
    blurb: 'High-energy crowds and broadcast moments that carry your brand far past the gate.',
    opps: [
      { name: 'Stadium concourse activation', placement: 'Branded environment', audience: '34,000 fans / match', reach: '3.1M impressions' },
      { name: 'Fan zone presenting partner', placement: 'Naming and stage', audience: '12,000 fans / match', reach: '980K impressions' },
      { name: 'Concession co-branding', placement: 'Product placement', audience: '18,000 transactions / match', reach: '540K impressions' },
    ],
  },
  {
    key: 'conferences',
    label: 'Conferences',
    icon: '🎤',
    blurb: 'Targeted professional audiences with strong lead-capture potential.',
    opps: [
      { name: 'Keynote stage sponsorship', placement: 'Naming and stage', audience: '4,500 delegates / event', reach: '720K impressions' },
      { name: 'Networking lounge host', placement: 'Branded environment', audience: '2,800 delegates / day', reach: '210K impressions' },
      { name: 'Demo pavilion booth', placement: 'Sampling and demo', audience: '1,900 qualified visits / event', reach: '64K impressions' },
    ],
  },
  {
    key: 'rooftops',
    label: 'Rooftops',
    icon: '🌆',
    blurb: 'Sunset crowds and social-first venues built for premium, shareable moments.',
    opps: [
      { name: 'Sunset series presenting partner', placement: 'Naming and stage', audience: '900 guests / night', reach: '180K impressions' },
      { name: 'Signature cocktail program', placement: 'Product placement', audience: '5,400 guests / month', reach: '120K impressions' },
      { name: 'Photo moment installation', placement: 'Branded environment', audience: '3,200 shares / month', reach: '410K impressions' },
    ],
  },
];

const ROI_METRICS = [
  { k: 'Impressions', v: '3.1M', d: '+42% vs prior activation' },
  { k: 'Engagement', v: '12.4%', d: '+3.1 pts' },
  { k: 'Leads', v: '2,260', d: '+780 new' },
  { k: 'Conversions', v: '8.6%', d: '+1.9 pts' },
  { k: 'Revenue Impact', v: '$612K', d: '+$184K' },
];

const STEPS = [
  { n: '1', t: 'Tell us your audience', d: 'Share the people you want to reach, the moments that matter, and your activation goals.' },
  { n: '2', t: 'Discover matched opportunities', d: 'Browse sponsorship inventory across premium venues, events, and activations, ranked to your brief.' },
  { n: '3', t: 'Activate with confidence', d: 'Lock placements, brief the venue, and run the activation from one shared timeline.' },
  { n: '4', t: 'Prove the return', d: 'Track impressions, engagement, leads, and revenue impact against your goals in one dashboard.' },
];

export default function ForSponsors() {
  const nav = useNavigate();
  const [active, setActive] = useState<string>('festivals');
  const current = CATEGORIES.find((c) => c.key === active) ?? CATEGORIES[0];

  return (
    <PublicLayout active="/for-sponsors">
      <style>{`
        .spo-sec{padding:72px 0;position:relative}
        .spo-sec.alt{background:var(--ivory)}
        .spo-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
        .spo-h2{font-family:'Cormorant Garamond',serif;font-size:38px;text-align:center;margin:0 0 12px;letter-spacing:-.3px;color:var(--emerald-deep)}
        .spo-sub{text-align:center;color:var(--muted);font-size:16.5px;max-width:660px;margin:0 auto 44px;line-height:1.6}

        .spo-tiles{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:34px}
        .spo-tile{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;transition:.16s}
        .spo-tile:hover{border-color:var(--champagne);transform:translateY(-2px)}
        .spo-tile.on{background:var(--emerald);border-color:var(--emerald);color:#fff}
        .spo-tile .ico{font-size:17px;line-height:1}

        .spo-map{display:grid;grid-template-columns:1.05fr 1fr;gap:28px;align-items:start}
        .spo-mapviz{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px}
        .spo-detail{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px}
        .spo-detail .dh{display:flex;align-items:center;gap:11px;margin-bottom:6px}
        .spo-detail .dh .ico{font-size:26px;line-height:1}
        .spo-detail .dh h3{font-family:'Cormorant Garamond',serif;font-size:26px;margin:0;color:var(--emerald-deep)}
        .spo-detail .dblurb{font-size:14px;color:var(--muted);line-height:1.55;margin:0 0 18px}
        .spo-opp{border:1px solid var(--line);border-radius:13px;padding:16px;margin-bottom:12px;transition:.16s}
        .spo-opp:hover{border-color:var(--champagne);background:var(--ivory)}
        .spo-opp .on{font-size:15.5px;font-weight:700;color:var(--emerald-deep);margin-bottom:9px}
        .spo-opp .meta{display:flex;flex-wrap:wrap;gap:8px}
        .spo-pill{font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--muted)}
        .spo-pill.place{border-color:rgba(30,93,74,.3);color:var(--emerald)}
        .spo-pill.reach{background:var(--champagne);border-color:var(--champagne);color:var(--emerald-deep)}

        .spo-counters{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:760px;margin:0 auto}

        .spo-roiwrap{max-width:920px;margin:0 auto}
        .spo-feedwrap{max-width:560px;margin:30px auto 0}

        .spo-emote{position:relative;overflow:hidden;isolation:isolate;border-radius:24px;padding:64px 32px;text-align:center;color:#fff;background:radial-gradient(120% 130% at 50% 0%,var(--emerald) 0%,var(--emerald-deep) 60%,#0c2a20 100%)}
        .spo-emote:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(70% 120% at 50% 0%,rgba(217,204,176,.2),transparent)}
        .spo-emote h2{font-family:'Cormorant Garamond',serif;font-size:40px;line-height:1.12;max-width:760px;margin:0 auto;color:#fff;letter-spacing:-.3px}
        .spo-emote p{font-size:16.5px;color:rgba(255,255,255,.86);max-width:560px;margin:18px auto 28px;line-height:1.6}
        .spo-emote .ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

        .spo-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
        .spo-step{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px 22px}
        .spo-step .n{width:38px;height:38px;border-radius:11px;background:var(--ivory);color:var(--emerald);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;margin-bottom:14px;border:1px solid var(--line)}
        .spo-step h3{font-family:'Cormorant Garamond',serif;font-size:19px;margin:0 0 7px;color:var(--emerald-deep)}
        .spo-step p{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0}

        @media(max-width:920px){.spo-map{grid-template-columns:1fr}.spo-steps{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.spo-counters,.spo-steps{grid-template-columns:1fr}.spo-h2{font-size:30px}.spo-emote h2{font-size:30px}}
      `}</style>

      <section className="pub-hero">
        <div className="pub-hero-bg" />
        <div className="pub-hero-scrim" />
        <div className="wrap">
          <span className="pub-eyebrow">For sponsors and brands</span>
          <h1>Reach Audiences Where Experiences Happen</h1>
          <p>
            Discover sponsorship opportunities across premium venues, events, and activations. Find
            the right audiences, secure the right placements, and prove the return, all on the Venue
            Intelligence and Revenue Infrastructure Platform.
          </p>
          <div className="ctas">
            <button className="btn gold lg" onClick={() => nav('/register')}>
              Get Started Today
            </button>
            <button className="btn ghost lg" onClick={() => nav('/register?role=sponsor')}>
              Get started
            </button>
          </div>
        </div>
      </section>

      <section className="spo-sec">
        <div className="wrap">
          <div className="spo-kicker">The opportunity map</div>
          <h2 className="spo-h2">Find your audience by experience</h2>
          <p className="spo-sub">
            Pick a category to reveal sample sponsorship opportunities, each with its audience size,
            placement type, and projected reach.
          </p>

          <div className="spo-tiles">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={'spo-tile' + (c.key === active ? ' on' : '')}
                onClick={() => setActive(c.key)}
                aria-pressed={c.key === active}
              >
                <span className="ico">{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>

          <div className="spo-map">
            <div className="spo-mapviz">
              <NetworkMap
                center={current.label}
                title="Where your brand can show up"
                nodes={current.opps.map((o) => ({ label: o.name, tag: o.placement }))}
              />
            </div>
            <div className="spo-detail">
              <div className="dh">
                <span className="ico">{current.icon}</span>
                <h3>{current.label}</h3>
              </div>
              <p className="dblurb">{current.blurb}</p>
              {current.opps.map((o) => (
                <div className="spo-opp" key={o.name}>
                  <div className="on">{o.name}</div>
                  <div className="meta">
                    <span className="spo-pill place">{o.placement}</span>
                    <span className="spo-pill">{o.audience}</span>
                    <span className="spo-pill reach">{o.reach}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="spo-sec alt">
        <div className="wrap">
          <div className="spo-kicker">Scale of the network</div>
          <h2 className="spo-h2">Premium reach, in one place</h2>
          <p className="spo-sub">
            Discover sponsorship inventory across hotels, venues, festivals, sporting events,
            conferences, and rooftops.
          </p>
          <div className="spo-counters">
            <AnimatedCounter value={6} suffix=" categories" label="Experience types to sponsor" />
            <AnimatedCounter value={18} suffix=" placement types" label="Ways to show up" />
            <AnimatedCounter value={9} prefix="" suffix="M+" label="Annual audience reach" />
          </div>
          <div className="spo-feedwrap">
            <OpportunityFeedPreview
              title="Sample sponsorship opportunities"
              items={[
                { label: 'Main stage presenting partner', meta: 'Festivals, summer series', value: '4.2M reach' },
                { label: 'Stadium concourse activation', meta: 'Sporting events, home season', value: '3.1M reach' },
                { label: 'Gala title sponsorship', meta: 'Premium venues, autumn', value: '340K reach' },
                { label: 'Keynote stage sponsorship', meta: 'Conferences, Q3', value: '720K reach' },
                { label: 'Rooftop sunset series', meta: 'Rooftops, weekend nights', value: '180K reach' },
                { label: 'Lobby tasting activation', meta: 'Hotels, lifestyle properties', value: '96K reach' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="spo-sec">
        <div className="wrap">
          <div className="spo-kicker">Prove the return</div>
          <h2 className="spo-h2">Your sponsorship ROI dashboard</h2>
          <p className="spo-sub">
            Stop guessing what your spend delivered. Track impressions, engagement, leads,
            conversions, and revenue impact against your goals in one place.
          </p>
          <div className="spo-roiwrap">
            <RoiPanel metrics={ROI_METRICS} />
          </div>
        </div>
      </section>

      <section className="spo-sec alt">
        <div className="wrap">
          <div className="spo-kicker">How it works for sponsors</div>
          <h2 className="spo-h2">From brief to proven impact</h2>
          <p className="spo-sub">
            Four steps take you from your audience goals to a measured, repeatable activation program.
          </p>
          <div className="spo-steps">
            {STEPS.map((s) => (
              <div className="spo-step" key={s.n}>
                <div className="n">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="spo-sec">
        <div className="wrap">
          <div className="spo-emote">
            <h2>Stop buying exposure. Start creating meaningful audience experiences.</h2>
            <p>
              Put your brand inside the moments people remember, with the intelligence to find the
              right audiences and the infrastructure to prove the return.
            </p>
            <div className="ctas">
              <button className="btn gold lg" onClick={() => nav('/register?role=sponsor')}>
                Get started
              </button>
              <button className="btn ghost lg" onClick={() => nav('/register')}>
                Get Started Today
              </button>
            </div>
          </div>
        </div>
      </section>
      <RoleValue role="sponsor" />
    </PublicLayout>
  );
}
