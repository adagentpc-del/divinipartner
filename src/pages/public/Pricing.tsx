import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SiteHeader, SiteFooter } from './components/PublicChrome';
import RoiPanel from '../../components/marketing/RoiPanel';
import { apiGet } from '../../lib/api';
import { priceLabel, pricePeriod, feeLabel, type Role, type RoleCatalog } from '../../lib/planCatalog';

/**
 * Pricing - the public pricing page for Divini Partners. Real plans for all 7
 * roles (Client, Venue, Vendor, Supplier, Event Planner, Installer, Sponsor),
 * fetched from GET /api/plans -- the same catalog GetStarted.tsx's signup
 * picker reads, so this page can never drift from what a signup actually
 * charges. Free lets you participate; Plus/Pro let you operate, automate,
 * and grow (spec section 3) -- platform fees stay the long-term monetization
 * engine, not the subscription price.
 */

const ROLE_TABS: { key: Role; label: string }[] = [
  { key: 'client', label: 'Client / Event Booker' },
  { key: 'venue', label: 'Venue / Hotel' },
  { key: 'vendor', label: 'Vendor / Service Provider' },
  { key: 'supplier', label: 'Supplier / Rentals' },
  { key: 'planner', label: 'Event Planner' },
  { key: 'installer', label: 'Installer / Support Staff' },
  { key: 'sponsor', label: 'Sponsor / Brand' },
];

type AddOn = { key: string; label: string; priceUsd: number | null; priceNote?: string };

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I have to pay to join?',
    a: 'No. Every role has a real Free plan: enough to participate and complete a basic workflow. Plus and Pro unlock the tools to operate, automate, and grow the business, and lower your platform fee.',
  },
  {
    q: 'How does the platform fee work?',
    a: 'Roles that transact on the marketplace (venues, vendors, suppliers, planners, clients) pay a percentage of each booking, capped at $2,500 per event no matter how large the booking is. Subscribing to Plus or Pro lowers that percentage. Roles like Installer and Sponsor pay no platform fee at all.',
  },
  {
    q: 'What happens when I upgrade?',
    a: 'Your account is created free, then Plus/Pro upgrades go through a secure Stripe checkout. Your plan only changes once that subscription actually confirms, so you always know exactly what you are paying.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancelling a subscription drops you back to the Free plan at your next billing cycle; you keep your account, profile, and history.',
  },
  {
    q: 'Do the numbers ever change without notice?',
    a: 'No surprises: your platform fee is locked to your current plan and capped per event. Any pricing change is announced before it applies to existing subscriptions.',
  },
];

export default function Pricing() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [catalog, setCatalog] = useState<RoleCatalog[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const initialRole = (params.get('role') as Role) || 'vendor';
  const [activeRole, setActiveRole] = useState<Role>(
    ROLE_TABS.some((r) => r.key === initialRole) ? initialRole : 'vendor',
  );

  useEffect(() => {
    let alive = true;
    apiGet<{ roles: RoleCatalog[]; add_ons: AddOn[] }>('/plans')
      .then((r) => {
        if (!alive) return;
        setCatalog(r?.roles ?? []);
        setAddOns(r?.add_ons ?? []);
      })
      .catch(() => { /* cards render empty; page still usable */ });
    return () => { alive = false; };
  }, []);

  const join = (role: Role) => nav(`/register?role=${role}`);
  const active = catalog.find((r) => r.role === activeRole);
  const hasFees = (active?.tiers ?? []).some((t) => t.platformFeeRate != null);

  return (
    <>
      <SiteHeader active="/pricing" />
      <main className="pub prc">
        <style>{`
          .prc{background:var(--bg);color:var(--ink)}
          .prc .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
          .prc .wrapn{max-width:820px;margin:0 auto;padding:0 24px}
          .prc section{padding:52px 0;position:relative}

          /* hero */
          .prc .prc-hero{position:relative;overflow:hidden;isolation:isolate;padding:76px 0 44px;text-align:center}
          .prc .prc-hero-bg{position:absolute;inset:0;z-index:-2;background:radial-gradient(120% 120% at 28% 12%,#1E5D4A 0%,#123c2e 52%,#0c2a20 100%);background-size:200% 200%;animation:prc-drift 24s ease-in-out infinite}
          .prc .prc-hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(9,28,22,.28),rgba(9,28,22,.55))}
          @keyframes prc-drift{0%,100%{background-position:0% 0%}50%{background-position:100% 100%}}
          .prc .prc-hero h1{font-size:48px;line-height:1.05;letter-spacing:-.5px;max-width:760px;margin:0 auto;color:#fff}
          .prc .prc-hero p{font-size:17px;line-height:1.6;color:rgba(255,255,255,.88);max-width:620px;margin:16px auto 0}
          @media(max-width:640px){.prc .prc-hero h1{font-size:32px}.prc .prc-hero{padding:48px 0 32px}}

          .prc .kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--emerald);font-weight:700;text-align:center;margin-bottom:11px}
          .prc h2{font-size:34px;text-align:center;margin-bottom:12px;letter-spacing:-.3px}
          .prc .sectsub{text-align:center;color:var(--muted);font-size:15.5px;max-width:640px;margin:0 auto 30px;line-height:1.6}
          @media(max-width:620px){.prc h2{font-size:27px}}

          /* role tabs */
          .prc .roletabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 auto 34px;max-width:960px}
          .prc .roletab{font:inherit;font-size:13px;font-weight:600;color:var(--emerald-deep);background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 16px;cursor:pointer;transition:.15s}
          .prc .roletab:hover{border-color:var(--emerald)}
          .prc .roletab.on{background:var(--emerald-deep);border-color:var(--emerald-deep);color:#fff}
          @media(max-width:640px){.prc .roletabs{gap:6px}.prc .roletab{font-size:12px;padding:7px 12px}}

          /* three plan cards */
          .prc .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:stretch}
          .prc .plan{background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px 24px;display:flex;flex-direction:column;position:relative}
          .prc .plan.hot{background:var(--emerald-deep);border-color:var(--emerald-deep);color:#fff;box-shadow:0 32px 64px -32px rgba(18,60,46,.6)}
          .prc .plan .au{font-size:13px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;color:var(--emerald);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:8px}
          .prc .plan.hot .au{color:var(--champagne)}
          .prc .plan .badge{font-size:10px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;color:var(--emerald-deep);background:var(--champagne);padding:3px 9px;border-radius:999px}
          .prc .plan .pp{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:700;color:var(--emerald-deep);line-height:1}
          .prc .plan.hot .pp{color:#fff}
          .prc .plan .per{font-size:12.5px;color:var(--muted);margin:4px 0 12px}
          .prc .plan.hot .per{color:rgba(255,255,255,.72)}
          .prc .plan .feeline{font-size:12.5px;font-weight:700;color:var(--emerald);background:var(--ivory);border:1px solid var(--line);border-radius:9px;padding:8px 11px;margin-bottom:16px}
          .prc .plan.hot .feeline{background:rgba(255,255,255,.08);border-color:rgba(217,204,176,.3);color:var(--champagne)}
          .prc .plan ul{list-style:none;padding:0;margin:0 0 18px;flex:1}
          .prc .plan li{font-size:13.5px;padding:5px 0;display:flex;gap:8px;align-items:flex-start;line-height:1.45}
          .prc .plan li:before{content:"\\2713";color:var(--emerald);font-weight:700;flex-shrink:0}
          .prc .plan.hot li:before{color:var(--champagne)}
          @media(max-width:920px){.prc .plans{grid-template-columns:1fr}}

          /* add-ons */
          .prc .addons{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:1020px;margin:0 auto}
          .prc .addon{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}
          .prc .addon .an{font-size:13.5px;font-weight:700;color:var(--emerald-deep);margin-bottom:4px}
          .prc .addon .ap{font-size:13px;color:var(--muted)}
          @media(max-width:880px){.prc .addons{grid-template-columns:repeat(2,1fr)}}
          @media(max-width:520px){.prc .addons{grid-template-columns:1fr}}

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
          .prc .qa h3{font-size:18px;margin-bottom:7px}
          .prc .qa p{font-size:14.5px;color:var(--muted);line-height:1.6;margin:0}

          /* closer */
          .prc .closer{background:var(--emerald-deep);border-radius:24px;padding:54px 32px;text-align:center;color:#fff;position:relative;overflow:hidden}
          .prc .closer:before{content:"";position:absolute;inset:0;background:radial-gradient(80% 130% at 50% 0%,rgba(217,204,176,.18),transparent)}
          .prc .closer h2{color:#fff;margin-bottom:12px;position:relative}
          .prc .closer p{color:rgba(255,255,255,.82);font-size:16px;max-width:560px;margin:0 auto 26px;position:relative;line-height:1.6}
          .prc .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
          .prc .enttrig{max-width:820px;margin:14px auto 0;text-align:center;font-size:13px;color:var(--muted)}
        `}</style>

        {/* HERO */}
        <section className="prc-hero">
          <div className="prc-hero-bg" />
          <div className="prc-hero-scrim" />
          <div className="wrap">
            <span className="pub-eyebrow">Event Commerce Infrastructure</span>
            <h1>One plan for every side of the business.</h1>
            <p>
              Free lets you join and complete a real workflow. Plus and Pro let you operate,
              automate, and grow, with a lower platform fee on every booking. Pick your role below.
            </p>
          </div>
        </section>

        {/* ROLE-SPECIFIC PLAN CARDS */}
        <section>
          <div className="wrap">
            <div className="kicker">Choose your role</div>
            <h2>{active?.displayName ?? 'Plans'}</h2>
            <p className="sectsub">
              {hasFees
                ? 'Free is 5% per booking. Plus and Pro subscribe to lower that fee, capped at $2,500/event either way.'
                : 'No platform fee for this role, at any plan.'}
            </p>

            <div className="roletabs">
              {ROLE_TABS.map((r) => (
                <button
                  key={r.key}
                  className={'roletab' + (activeRole === r.key ? ' on' : '')}
                  onClick={() => setActiveRole(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {active && (
              <div className="plans">
                {active.tiers.map((t, i) => (
                  <div className={'plan' + (i === 1 ? ' hot' : '')} key={t.key}>
                    <div className="au">
                      <span>{t.label}</span>
                      {i === 1 && <span className="badge">Most popular</span>}
                    </div>
                    <div className="pp">{priceLabel(t)}</div>
                    <div className="per">{t.monthlyUsd ? pricePeriod(t) : t.priceNote ?? pricePeriod(t)}</div>
                    <div className="feeline">{feeLabel(t)}</div>
                    <ul>
                      {t.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <button
                      className={'btn block' + (i === 1 ? ' gold' : ' primary')}
                      onClick={() => join(activeRole)}
                    >
                      {i === 0 ? `Start free as a ${active.displayName.split(' /')[0]}` : `Get ${t.label}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ADD-ONS */}
        {addOns.length > 0 && (
          <section style={{ background: 'var(--ivory)' }}>
            <div className="wrap">
              <div className="kicker">Grow as you need it</div>
              <h2>Add-ons for every plan</h2>
              <p className="sectsub">Scale a single line item instead of jumping a whole tier.</p>
              <div className="addons">
                {addOns.map((a) => (
                  <div className="addon" key={a.key}>
                    <div className="an">{a.label}</div>
                    <div className="ap">
                      {a.priceUsd != null ? `$${a.priceUsd}${a.priceNote ?? ''}` : a.priceNote}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* HOW THE FEE WORKS */}
        <section>
          <div className="wrap">
            <div className="kicker">How the fee works</div>
            <h2>Free to participate. Plus/Pro to grow.</h2>
            <p className="sectsub">
              Free unlocks a real, complete workflow for every role. Subscribing to Plus or Pro is
              about running the business: automation, reporting, team seats, and a lower platform
              fee on every transaction, never an arbitrary paywall.
            </p>
            <div className="fees">
              <div className="feecard">
                <h3>Capped, always</h3>
                <p>Every platform fee is capped at $2,500 per event, no matter how large the booking. Stripe processing and the transaction-protection fee are separate, uncapped, and shown to the payer before checkout.</p>
              </div>
              <div className="feecard">
                <h3>Lower it by subscribing</h3>
                <p>Free is 5%. Plus drops that to 2.5%. Pro drops it to 1%. The fee rate is set by your plan, applied automatically, every time.</p>
              </div>
              <div className="feecard">
                <h3>Some roles pay none</h3>
                <p>Installer and Sponsor accounts never pay a marketplace transaction fee, on any plan. Their subscription is the entire cost.</p>
              </div>
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
            <div className="faq" style={{ marginTop: 32 }}>
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
              <p>Every role starts free. Upgrade whenever the business is ready to grow.</p>
              <div className="cta">
                <button className="btn gold lg" onClick={() => join(activeRole)}>
                  Get started free
                </button>
              </div>
              <div className="enttrig">
                Outgrowing Pro? 25+ team members, 15+ locations, or 250+ active events unlocks a
                custom Enterprise plan. Contact us anytime to talk through it.
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
