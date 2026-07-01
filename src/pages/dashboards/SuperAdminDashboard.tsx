import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';
import { apiGet } from '../../lib/api';

// Wave 5 - platform revenue / marketplace rollup from
// /api/platform-revenue/admin-dashboard (admin only). Read-only over the fee +
// venue-share ledgers; degrades to zeros + available false.
type TopVenue = { venue_org_id: string; organization_name: string | null; share_cents: number };
type TopVendor = { organization_id: string; organization_name: string | null; revenue_cents: number };
type AdminMetrics = {
  gross_marketplace_volume_cents: number;
  platform_fees_collected_cents: number;
  venue_revenue_share_paid_cents: number;
  net_platform_revenue_cents: number;
  top_venues: TopVenue[];
  top_vendors: TopVendor[];
};

function usd(cents: number): string {
  const dollars = (Number(cents) || 0) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function AdminMetricTiles() {
  const [m, setM] = React.useState<AdminMetrics | null>(null);
  React.useEffect(() => {
    let on = true;
    apiGet<{ metrics: AdminMetrics; available: boolean }>('/platform-revenue/admin-dashboard')
      .then((r) => { if (on) setM(r.metrics); })
      .catch(() => { if (on) setM(null); });
    return () => { on = false; };
  }, []);
  return (
    <>
      <div className="dpdash-sectiontitle">Platform revenue</div>
      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Gross marketplace volume</div><div className="dpdash-stat-v">{usd(m?.gross_marketplace_volume_cents ?? 0)}</div><div className="dpdash-stat-d">all time</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Platform fees collected</div><div className="dpdash-stat-v">{usd(m?.platform_fees_collected_cents ?? 0)}</div><div className="dpdash-stat-d">realized</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Venue revenue share paid</div><div className="dpdash-stat-v">{usd(m?.venue_revenue_share_paid_cents ?? 0)}</div><div className="dpdash-stat-d">to venues</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Net platform revenue</div><div className="dpdash-stat-v">{usd(m?.net_platform_revenue_cents ?? 0)}</div><div className="dpdash-stat-d">net of share and processing</div></div>
      </div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Top venues</h3>
          <p className="dpdash-card-sub">By revenue share earned.</p>
          {m && m.top_venues.length > 0 ? (
            <ul className="dpdash-leaderboard">
              {m.top_venues.map((v) => (
                <li key={v.venue_org_id}>
                  <span>{v.organization_name ?? 'Unnamed venue'}</span>
                  <strong>{usd(v.share_cents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dpdash-empty">
              <span className="dpdash-empty-glyph" aria-hidden="true">V</span>
              <p>No venue revenue share earned yet. Bookings at host venues will rank here.</p>
            </div>
          )}
        </div>
        <div className="dpdash-card">
          <h3>Top vendors</h3>
          <p className="dpdash-card-sub">By revenue generated.</p>
          {m && m.top_vendors.length > 0 ? (
            <ul className="dpdash-leaderboard">
              {m.top_vendors.map((v) => (
                <li key={v.organization_id}>
                  <span>{v.organization_name ?? 'Unnamed vendor'}</span>
                  <strong>{usd(v.revenue_cents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dpdash-empty">
              <span className="dpdash-empty-glyph" aria-hidden="true">D</span>
              <p>No vendor revenue yet. Paid bookings will rank vendors here.</p>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .dpdash-leaderboard{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
        .dpdash-leaderboard li{display:flex;align-items:center;justify-content:space-between;gap:12px;
          padding:9px 12px;border:1px solid var(--dp-line,#e7e1d6);border-radius:10px;background:#fff}
        .dpdash-leaderboard span{font-size:13px;color:var(--dp-emerald,#123c2e)}
        .dpdash-leaderboard strong{font-size:13px;color:var(--dp-emerald,#123c2e)}
      `}</style>
    </>
  );
}

// Each item carries its real `to` route so the admin surfaces are reachable from
// the sidebar (DashboardShell navigates when `to` is set). Overview opens the
// AdminConsole, whose tab bar in turn reaches every admin section. Labels with
// no dedicated route (role browsers, Quotes, Feedback, Settings) stay inert
// rather than linking to a 404.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/admin' },
  { label: 'Accounts', icon: 'A', to: '/admin/accounts' },
  { label: 'Venues', icon: 'V', to: '/admin/venues' },
  { label: 'Vendors', icon: 'D', to: '/admin/vendors' },
  { label: 'Planners', icon: 'P', to: '/admin/accounts' },
  { label: 'Clients', icon: 'C', to: '/admin/clients' },
  { label: 'Events', icon: 'E', to: '/admin/events' },
  { label: 'Bids', icon: 'B', to: '/bids' },
  { label: 'Quotes', icon: 'Q' },
  { label: 'Invoices', icon: 'I', to: '/invoices' },
  { label: 'Payments', icon: 'Y', to: '/payments' },
  { label: 'Disputes', icon: 'S', to: '/disputes' },
  { label: 'Support', icon: 'T', to: '/support' },
  { label: 'Reviews', icon: 'R', to: '/reviews' },
  { label: 'Feedback', icon: 'F' },
  { label: 'Claim Profiles', icon: 'C', to: '/admin/claim-profiles' },
  { label: 'Campaigns', icon: 'M', to: '/admin/campaigns' },
  { label: 'Agreements', icon: '%', to: '/admin/agreements' },
  { label: 'Exclusive Partners', icon: 'E', to: '/admin/exclusive-partners' },
  { label: 'Claim Engine', icon: 'K', to: '/admin/claim-engine' },
  { label: 'White Label', icon: 'W', to: '/admin/white-label' },
  { label: 'Intelligence', icon: 'N', to: '/admin/intelligence' },
  { label: 'Visitor Signals', icon: 'L', to: '/admin/signals' },
  // Partner revenue share, payouts, referrals/credits, audit, compliance, revenue center
  { label: 'Partners', icon: 'P', to: '/admin/partners' },
  { label: 'Partner Portal', icon: 'p', to: '/partner-portal' },
  { label: 'Payouts', icon: '$', to: '/admin/payouts' },
  { label: 'Connect Payouts', icon: '@', to: '/admin/connect-payouts' },
  { label: 'Revenue Center', icon: '#', to: '/admin/revenue-center' },
  { label: 'Audit Log', icon: 'L', to: '/admin/audit-log' },
  { label: 'Compliance', icon: 'C', to: '/admin/compliance' },
  { label: 'Circumvention', icon: 'X', to: '/admin/circumvention' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Settings', icon: 'G' },
];

// Next-best-action prompts for platform operators (blueprint section 44.2).
const PROMPTS = [
  'Review accounts pending verification today',
  'Flag disputes older than 48 hours',
  'Approve claimed venue and vendor profiles',
  'Surface payments stuck in escrow',
];

function PromptStrip() {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Run the platform</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt">{p}</button>
        ))}
      </div>
    </section>
  );
}

export default function SuperAdminDashboard() {
  const { me } = useMe();
  const nav = useNavigate();
  const who = me?.name ?? 'Operator';

  return (
    <DashboardShell title="Platform Console" navLabel="Administration" items={NAV}>
      <PromptStrip />

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Total accounts</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">venues, vendors, clients</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Pending verification</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">awaiting review</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Open disputes</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">needs attention</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Gross volume</div><div className="dpdash-stat-v">$0</div><div className="dpdash-stat-d">this period</div></div>
      </div>

      <AdminMetricTiles />

      <div className="dpdash-sectiontitle">Operations</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Verification queue</h3>
          <p className="dpdash-card-sub">Approve or reject claimed and newly created profiles.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">A</span>
            <p>No accounts are waiting for review. New sign-ups and claim requests will appear here for {who} to action.</p>
            <button type="button" className="dpdash-btn ghost">Open queue</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Disputes and support</h3>
          <p className="dpdash-card-sub">Track escalations across events, payments, and reviews.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">S</span>
            <p>No open cases. Disputes, refund requests, and flagged reviews will surface here in priority order.</p>
            <button type="button" className="dpdash-btn ghost">View case board</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Claim Engine</h3>
          <p className="dpdash-card-sub">Monitor outreach, claim links, and profile conversions.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">K</span>
            <p>No active claim campaigns yet. Seed unclaimed venue and vendor profiles to start converting listings.</p>
            <button type="button" className="dpdash-btn">Configure engine</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Intelligence</h3>
          <p className="dpdash-card-sub">Marketplace health, supply gaps, and demand signals.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">N</span>
            <p>Insights populate once events, bids, and payments start flowing through the platform.</p>
            <button type="button" className="dpdash-btn" onClick={() => nav('/admin/win-loss')}>Win / Loss scorecard</button>
            <button type="button" className="dpdash-btn ghost">Open reports</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
