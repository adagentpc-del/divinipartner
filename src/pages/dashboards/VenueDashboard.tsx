import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';
import { apiGet } from '../../lib/api';

// Wave 5 - venue revenue / marketplace metrics from /api/venue-metrics/summary.
// Read-only analytics over the venue revenue-share ledger; degrades to zeros.
type VenueMetrics = {
  bookings_generated: number;
  revenue_generated_cents: number;
  revenue_share_earned_cents: number;
  pending_revenue_share_cents: number;
  lifetime_revenue_share_cents: number;
};

function usd(cents: number): string {
  const dollars = (Number(cents) || 0) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function VenueMetricTiles() {
  const [m, setM] = React.useState<VenueMetrics | null>(null);
  React.useEffect(() => {
    let on = true;
    apiGet<{ metrics: VenueMetrics }>('/venue-metrics/summary')
      .then((r) => { if (on) setM(r.metrics); })
      .catch(() => { if (on) setM(null); });
    return () => { on = false; };
  }, []);
  return (
    <>
      <div className="dpdash-sectiontitle">Revenue</div>
      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Bookings generated</div><div className="dpdash-stat-v">{m?.bookings_generated ?? 0}</div><div className="dpdash-stat-d">events at your venue</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Revenue generated</div><div className="dpdash-stat-v">{usd(m?.revenue_generated_cents ?? 0)}</div><div className="dpdash-stat-d">GMV at this venue</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Revenue share earned</div><div className="dpdash-stat-v">{usd(m?.revenue_share_earned_cents ?? 0)}</div><div className="dpdash-stat-d">realized</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Pending revenue share</div><div className="dpdash-stat-v">{usd(m?.pending_revenue_share_cents ?? 0)}</div><div className="dpdash-stat-d">accrued and invoiced</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Lifetime revenue share</div><div className="dpdash-stat-v">{usd(m?.lifetime_revenue_share_cents ?? 0)}</div><div className="dpdash-stat-d">all time</div></div>
      </div>
    </>
  );
}

// Nav items carry `to` routes so the venue sidebar reaches the live buyer-side
// pages (DashboardShell navigates when `to` is set, matching SuperAdminDashboard
// and VendorDashboard). Labels with no real route stay inert rather than 404.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'Venue Twin', icon: 'P', to: '/venue-twin' },
  { label: 'Recommendations', icon: 'C', to: '/event-recommendations' },
  { label: 'Preferred Vendors', icon: 'V', to: '/preferred-vendors' },
  { label: 'Revenue Inventory', icon: 'N', to: '/revenue-inventory' },
  { label: 'Sponsorships', icon: 'H', to: '/sponsorships' },
  { label: 'Sponsorship Intel', icon: 'J', to: '/sponsorship-intel' },
  { label: 'Venue Comparison', icon: 'W', to: '/venue-comparison' },
  { label: 'Installations', icon: 'T', to: '/installations' },
  { label: 'Guest Hub', icon: 'S', to: '/guest-hub' },
  { label: 'Event Memory', icon: 'Y', to: '/event-memory' },
  { label: 'Leads', icon: 'Q', to: '/leads' },
  { label: 'Opportunities', icon: 'X', to: '/opportunities' },
  { label: 'Divini Scores', icon: 'Z', to: '/divini-scores' },
  { label: 'War Room', icon: 'W', to: '/event-war-room' },
  { label: 'Revenue Leakage', icon: 'L', to: '/revenue-dashboard' },
  { label: 'Approval Graph', icon: 'P', to: '/approval-graph' },
  { label: 'Attendee Intelligence', icon: 'D', to: '/attendee-intelligence' },
  { label: 'Relationship Graph', icon: 'G', to: '/relationship-graph' },
  { label: 'AI COO', icon: 'A', to: '/coo' },
  { label: 'Command Center', icon: 'M', to: '/command-center' },
  { label: 'Daily Briefing', icon: 'D', to: '/daily-briefing' },
  { label: 'Business Health', icon: 'B', to: '/business-health' },
  { label: 'Revenue Intelligence', icon: 'I', to: '/revenue-intelligence' },
  { label: 'Forecasting', icon: 'F', to: '/forecasting' },
  { label: 'Pricing Intelligence', icon: 'P', to: '/pricing-intelligence' },
  { label: 'Marketplace Intelligence', icon: 'K', to: '/marketplace-intelligence' },
  { label: 'Partnership Matches', icon: 'H', to: '/partnership-matches' },
  { label: 'Founding Member', icon: 'G', to: '/founding-member' },
  { label: 'Events', icon: 'E', to: '/events' },
  { label: 'Profile', icon: 'R', to: '/profile' },
  { label: 'Decks & Programs', icon: 'K', to: '/profile/decks-programs' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

// Next-best-action prompts for venues (blueprint section 25.1).
const PROMPTS = [
  'Complete your venue profile and photos',
  'Set availability and seasonal rates',
  'Upload floorplans for each space',
  'Respond to your newest inquiry',
];

function PromptStrip() {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Fill your calendar</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt">{p}</button>
        ))}
      </div>
    </section>
  );
}

export default function VenueDashboard() {
  const { me } = useMe();
  const nav = useNavigate();
  const venue = me?.organization?.name ?? me?.name ?? 'your venue';

  return (
    <DashboardShell title="Venue Dashboard" navLabel="Venue Workspace" items={NAV}>
      <style>{`
        .vd-network{display:flex;flex-wrap:wrap;align-items:center;gap:14px;justify-content:space-between;
          background:#fff;border:1px solid #C9A35B;border-radius:14px;padding:16px 20px;margin-bottom:22px;
          box-shadow:0 0 0 1px rgba(201,163,91,.18)}
        .vd-network-txt{min-width:240px}
        .vd-network-txt b{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#123c2e;display:block}
        .vd-network-txt span{font-size:12.5px;color:#7d776c;line-height:1.5}
        .vd-network-btn{background:#1E5D4A;color:#fff;border:0;border-radius:10px;font:inherit;font-size:13px;
          font-weight:600;padding:11px 18px;cursor:pointer;white-space:nowrap}
        .vd-network-btn:hover{background:#123c2e}
      `}</style>

      <PromptStrip />

      <section className="vd-network">
        <div className="vd-network-txt">
          <b>Your vendor network</b>
          <span>Add the vendors you already work with and invite vendors and clients to create their profile free.</span>
        </div>
        <button type="button" className="vd-network-btn" onClick={() => nav('/network')}>
          Invite vendors and clients
        </button>
      </section>

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">New inquiries</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">awaiting reply</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Booked events</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">upcoming</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Spaces listed</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">bookable</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Profile strength</div><div className="dpdash-stat-v">New</div><div className="dpdash-stat-d">finish setup</div></div>
      </div>

      <VenueMetricTiles />

      <div className="dpdash-sectiontitle">Get bookable</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Inquiries</h3>
          <p className="dpdash-card-sub">Client and planner requests for {venue}.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">Q</span>
            <p>No inquiries yet. Once your profile is live, requests for dates and walkthroughs will land here.</p>
            <button type="button" className="dpdash-btn ghost">View inquiries</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Spaces and capacity</h3>
          <p className="dpdash-card-sub">List each bookable space with seated and standing counts.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">S</span>
            <p>No spaces added. Add a ballroom, garden, or suite so clients can match their guest count.</p>
            <button type="button" className="dpdash-btn">Add a space</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Availability and rates</h3>
          <p className="dpdash-card-sub">Open dates and pricing tiers across the year.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">A</span>
            <p>No availability set. Publish open dates and seasonal rates to start receiving qualified inquiries.</p>
            <button type="button" className="dpdash-btn ghost">Set availability</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Preferred vendors</h3>
          <p className="dpdash-card-sub">Curate the partners you recommend to clients.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">V</span>
            <p>No preferred vendors yet. Build your shortlist so clients can book trusted partners faster.</p>
            <button type="button" className="dpdash-btn ghost" onClick={() => nav('/network')}>Add vendors</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
