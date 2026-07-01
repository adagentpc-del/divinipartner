import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';
import { apiGet, apiSend } from '../../lib/api';

// Wave 5 - vendor marketplace / revenue metrics from /api/vendor-metrics/summary.
// Read-only analytics scoped to the caller's org; degrades to zeros.
type VendorMetrics = {
  leads_received: number;
  quotes_sent: number;
  bookings_won: number;
  revenue_generated_cents: number;
  marketplace_rank: number | null;
  marketplace_total: number | null;
};

function usd(cents: number): string {
  const dollars = (Number(cents) || 0) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function VendorMetricTiles() {
  const [m, setM] = React.useState<VendorMetrics | null>(null);
  React.useEffect(() => {
    let on = true;
    apiGet<{ metrics: VendorMetrics }>('/vendor-metrics/summary')
      .then((r) => { if (on) setM(r.metrics); })
      .catch(() => { if (on) setM(null); });
    return () => { on = false; };
  }, []);
  const rank =
    m && m.marketplace_rank
      ? m.marketplace_total
        ? `#${m.marketplace_rank} / ${m.marketplace_total}`
        : `#${m.marketplace_rank}`
      : 'New';
  return (
    <>
      <div className="dpdash-sectiontitle">Marketplace</div>
      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Leads received</div><div className="dpdash-stat-v">{m?.leads_received ?? 0}</div><div className="dpdash-stat-d">inbound inquiries</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Quotes sent</div><div className="dpdash-stat-v">{m?.quotes_sent ?? 0}</div><div className="dpdash-stat-d">all time</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Bookings won</div><div className="dpdash-stat-v">{m?.bookings_won ?? 0}</div><div className="dpdash-stat-d">accepted quotes</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Revenue generated</div><div className="dpdash-stat-v">{usd(m?.revenue_generated_cents ?? 0)}</div><div className="dpdash-stat-d">realized gross</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Marketplace ranking</div><div className="dpdash-stat-v">{rank}</div><div className="dpdash-stat-d">in your category</div></div>
      </div>
    </>
  );
}

// Nav items carry `to` routes so the sidebar reaches the live pages (the
// DashboardShell navigates when `to` is set, matching SuperAdminDashboard). The
// Venue Intelligence + quote-automation addendum surfaces (Quote Requirements,
// Pricing Rules, Quote Drafts, Readiness Score) are wired here so a vendor can
// reach them from their own dashboard, not only via a deep link.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'Vendor Profile', icon: 'P', to: '/profile' },
  { label: 'Decks & Programs', icon: 'K', to: '/profile/decks-programs' },
  { label: 'Services', icon: 'S', to: '/profile' },
  { label: 'Rental Inventory', icon: 'N', to: '/inventory' },
  { label: 'Pricing Rules', icon: 'C', to: '/vendor-pricing' },
  { label: 'Packages', icon: 'K', to: '/packages' },
  { label: 'Quote Requirements', icon: 'Q', to: '/vendor-requirements' },
  { label: 'Quote Drafts', icon: 'F', to: '/quote-drafts' },
  { label: 'Team', icon: 'T', to: '/vendor/team' },
  { label: 'Account Assignments', icon: 'A', to: '/vendor/accounts' },
  { label: 'Quote Approvals', icon: 'V', to: '/vendor/quote-approvals' },
  { label: 'Readiness Score', icon: 'C', to: '/vendor-readiness-score' },
  { label: 'Vendor Scorecards', icon: 'S', to: '/vendor-scorecards' },
  { label: 'Documents', icon: 'D', to: '/vendor-compliance' },
  { label: 'Discovery', icon: 'V', to: '/recommendations' },
  { label: 'Bid Board', icon: 'B', to: '/bids' },
  { label: 'Search Bids', icon: 'L', to: '/search-bids' },
  { label: 'Invoices', icon: 'I', to: '/invoices' },
  { label: 'Payments', icon: 'Y', to: '/payments' },
  { label: 'Reviews', icon: 'R', to: '/reviews' },
  { label: 'Team Seats', icon: 'T', to: '/account/seats' },
  { label: 'Daily Briefing', icon: 'D', to: '/daily-briefing' },
  { label: 'Pricing Intelligence', icon: 'C', to: '/pricing-intelligence' },
  { label: 'Revenue Intelligence', icon: 'I', to: '/revenue-intelligence' },
  { label: 'Forecasting', icon: 'F', to: '/forecasting' },
  { label: 'AI COO', icon: 'A', to: '/coo' },
  { label: 'Command Center', icon: 'M', to: '/command-center' },
  { label: 'Business Health', icon: 'H', to: '/business-health' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

// Next-best-action prompts for vendors (blueprint section 25.2).
const PROMPTS = [
  'Upload your COI and W-9 documents',
  'List your services and pricing',
  'Browse open bids matched to you',
  'Send a quote on an active request',
];

function PromptStrip() {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Win more work</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt">{p}</button>
        ))}
      </div>
    </section>
  );
}

// Compact Vendor Readiness Score widget. Links to the full
// /vendor-readiness-score page (route + nav wired by another agent). The score
// itself is computed and displayed on that page against the live backend, so
// this card stays a deterministic call to action and does not invent a number.
function ReadinessWidget() {
  const nav = useNavigate();
  return (
    <div className="dpdash-card dpdash-readiness">
      <style>{READINESS_CSS}</style>
      <h3>Readiness score</h3>
      <p className="dpdash-card-sub">
        How responsive, complete, compliant, and proven you look to venues and planners.
        A higher score ranks you higher in marketplace search.
      </p>
      <div className="dpdash-readiness-row">
        <div className="dpdash-readiness-ring" aria-hidden="true">R</div>
        <div className="dpdash-readiness-copy">
          <p>
            See your score, the factor breakdown, and concrete steps to climb the
            rankings.
          </p>
          <button
            type="button"
            className="dpdash-btn"
            onClick={() => nav('/vendor-readiness-score')}
          >
            View readiness score
          </button>
        </div>
      </div>
    </div>
  );
}

const READINESS_CSS = `
.dpdash-readiness-row { display: flex; align-items: center; gap: 16px; margin-top: 8px; }
.dpdash-readiness-ring {
  width: 56px; height: 56px; flex: 0 0 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 22px;
  color: var(--dp-emerald, #123c2e);
  background:
    radial-gradient(closest-side, #fff 72%, transparent 73%),
    conic-gradient(var(--dp-gold, #C9A35B) 0 72%, var(--dp-line, #e7e1d6) 72% 100%);
}
.dpdash-readiness-copy { display: flex; flex-direction: column; gap: 9px; }
.dpdash-readiness-copy p { margin: 0; font-size: 12.5px; color: var(--dp-muted, #7d776c); line-height: 1.5; }
`;

// Pricing V2 Featured Vendor upsell. Reads /api/featured for the org's status
// and price (server is the source of truth, including the PRICING_V2 flag). The
// whole card renders only under Pricing V2 (status.pricing_v2). Buying or
// cancelling is record-only on the backend; no real money moves here.
type FeaturedStatus = {
  pricing_v2: boolean;
  featured: boolean;
  price_usd: number;
  status: string | null;
  current_period_end: string | null;
};

function FeaturedUpsell() {
  const [st, setSt] = React.useState<FeaturedStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    apiGet<FeaturedStatus>('/featured')
      .then((r) => setSt(r))
      .catch(() => setSt(null));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function buy() {
    setBusy(true); setErr(null);
    try { const r = await apiSend<{ status: FeaturedStatus }>('POST', '/featured/buy', {}); setSt(r.status); }
    catch (e) { setErr((e as Error)?.message ?? 'Could not start Featured Vendor.'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setErr(null);
    try { const r = await apiSend<{ status: FeaturedStatus }>('POST', '/featured/cancel', {}); setSt(r.status); }
    catch (e) { setErr((e as Error)?.message ?? 'Could not cancel Featured Vendor.'); }
    finally { setBusy(false); }
  }

  // Hidden entirely when Pricing V2 is off (legacy behavior untouched).
  if (!st || !st.pricing_v2) return null;
  const price = `$${Math.round(Number(st.price_usd) || 49)}/mo`;

  return (
    <div className="dpdash-featured">
      <style>{FEATURED_CSS}</style>
      <div className="dpdash-featured-body">
        <span className="dpdash-featured-kicker">Advertising upgrade</span>
        <h3>{st.featured ? 'You are a Featured Vendor' : `Get Featured - ${price}`}</h3>
        <p>
          {st.featured
            ? 'Your listing gets top search placement, a Featured badge, homepage placement, and preferred matching.'
            : 'Rise to the top of marketplace search, earn a Featured badge on your card, land homepage placement, and get a preferred-matching boost. This is advertising, not a membership: your platform fee, bid access, and seats do not change.'}
        </p>
        {err ? <div className="dpdash-featured-err">{err}</div> : null}
      </div>
      <div className="dpdash-featured-cta">
        {st.featured ? (
          <button type="button" className="dpdash-btn ghost" disabled={busy} onClick={cancel}>
            {busy ? 'Working...' : 'Cancel featuring'}
          </button>
        ) : (
          <button type="button" className="dpdash-btn" disabled={busy} onClick={buy}>
            {busy ? 'Working...' : `Get Featured - ${price}`}
          </button>
        )}
      </div>
    </div>
  );
}

const FEATURED_CSS = `
.dpdash-featured { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap;
  background: linear-gradient(100deg, rgba(201,163,91,.16), rgba(247,244,238,.6)); border: 1px solid rgba(201,163,91,.55);
  border-radius: 16px; padding: 18px 20px; margin: 14px 0 4px; }
.dpdash-featured-body { min-width: 260px; flex: 1 1 340px; }
.dpdash-featured-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 700; color: #8a6d27; }
.dpdash-featured h3 { margin: 4px 0 6px; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 22px; color: var(--dp-emerald, #123c2e); }
.dpdash-featured p { margin: 0; font-size: 12.8px; color: var(--dp-muted, #7d776c); line-height: 1.55; max-width: 560px; }
.dpdash-featured-err { margin-top: 8px; font-size: 12px; color: #b3261e; }
.dpdash-featured-cta { flex: 0 0 auto; }
`;

export default function VendorDashboard() {
  const { me } = useMe();
  const vendor = me?.organization?.name ?? me?.name ?? 'your business';

  return (
    <DashboardShell title="Vendor Dashboard" navLabel="Vendor Workspace" items={NAV}>
      <PromptStrip />
      <FeaturedUpsell />

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Bids matched</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">open to you</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Quotes sent</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">awaiting decision</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Awarded jobs</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">confirmed</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Documents</div><div className="dpdash-stat-v">0/2</div><div className="dpdash-stat-d">COI and W-9</div></div>
      </div>

      <VendorMetricTiles />

      <div className="dpdash-sectiontitle">Pipeline</div>
      <div className="dpdash-grid">
        <ReadinessWidget />

        <div className="dpdash-card">
          <h3>Bid board</h3>
          <p className="dpdash-card-sub">Open requests matched to {vendor}.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">B</span>
            <p>No matched bids yet. Add your services so we can route relevant event requests to you.</p>
            <button type="button" className="dpdash-btn">Browse bids</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>My quotes</h3>
          <p className="dpdash-card-sub">Proposals you have sent to clients and planners.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">Q</span>
            <p>No quotes sent. Respond to a bid with pricing and packages to start winning work.</p>
            <button type="button" className="dpdash-btn ghost">View quotes</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Documents</h3>
          <p className="dpdash-card-sub">Keep your COI and W-9 current to stay eligible to bid.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">D</span>
            <p>No documents uploaded. Add your certificate of insurance and W-9 to unlock awarded jobs.</p>
            <button type="button" className="dpdash-btn">Upload documents</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Services and pricing</h3>
          <p className="dpdash-card-sub">Define what you offer and how you price it.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">S</span>
            <p>No services listed. Add services, rental inventory, and packages so clients can find and book you.</p>
            <button type="button" className="dpdash-btn ghost">Add services</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
