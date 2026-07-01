/**
 * Nonprofit / Charity core - Nonprofit Dashboard (Workstream B).
 *
 * The role dashboard for nonprofit organizations. Uses the shared DashboardShell
 * with a nav whose items carry `to:` routes to the nonprofit builder pages
 * (/fundraising-builder, /sponsorship-packages, /ticket-table) plus reuse links
 * to existing surfaces (guest hub, opportunities, sponsorships, payments,
 * invoices). The main area shows the rollup from /api/nonprofit-dashboard:
 * fundraising goal, revenue collected, sponsorship + ticket revenue, net,
 * fulfillment, guests, and overdue tasks - with graceful loading / error /
 * empty states (this layer is data-dependent, so zeros surface honestly).
 *
 * Default export, no required props. The integration lead routes the nonprofit
 * role to this component in App.tsx's AppHome switch.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';
import { apiGet } from '../../lib/api';

const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'Fundraising Events', icon: 'F', to: '/fundraising-builder' },
  { label: 'Sponsorship Packages', icon: 'S', to: '/sponsorship-packages' },
  { label: 'Ticket and Tables', icon: 'T', to: '/ticket-table' },
  { label: 'Auction', icon: 'A', to: '/auction-manager' },
  { label: 'Volunteers', icon: 'V', to: '/volunteer-manager' },
  { label: 'Donors', icon: 'D', to: '/donor-manager' },
  { label: 'Post-Event Recap', icon: 'C', to: '/post-event-recap' },
  { label: 'Sponsor Matching', icon: 'M', to: '/sponsor-matching' },
  { label: 'Donor Prospecting', icon: 'Y', to: '/donor-prospecting' },
  { label: 'Guest Hub', icon: 'G', to: '/guest-hub' },
  { label: 'Opportunities', icon: 'X', to: '/opportunities' },
  { label: 'Sponsorships', icon: 'H', to: '/sponsorships' },
  { label: 'Payments', icon: 'P', to: '/payments' },
  { label: 'Invoices', icon: 'I', to: '/invoices' },
  { label: 'Events', icon: 'E', to: '/events' },
  { label: 'Profile', icon: 'R', to: '/profile' },
  { label: 'Decks & Programs', icon: 'K', to: '/profile/decks-programs' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

const PROMPTS = [
  'Create your next fundraising event',
  'Build tiered sponsorship packages',
  'Add ticket and table options',
  'Track sponsor fulfillment',
];

type Dashboard = {
  goalAmount: number;
  budget: number;
  sponsorshipRevenue: number;
  ticketRevenue: number;
  committedRevenue: number;
  revenueCollected: number;
  revenueSource: 'payments' | 'committed';
  net: number;
  goalProgressPct: number;
  ticketsSoldSeats: number;
  guestCount: number;
  tasksOverdue: number;
  fulfillment: Record<string, number> | null;
  fulfillmentAvailable: boolean;
  fundraisingEventCount: number;
};

function money(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const neg = n < 0;
  return `${neg ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export default function NonprofitDashboard() {
  const { me } = useMe();
  const nav = useNavigate();
  const org = me?.organization?.name ?? me?.name ?? 'your organization';

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await apiGet<{ dashboard: Dashboard }>('/nonprofit-dashboard');
        if (live) setData(r.dashboard);
      } catch (e) {
        if (live) setErr((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const hasData = !!data && data.fundraisingEventCount > 0;
  const fulfillmentEntries = data?.fulfillment ? Object.entries(data.fulfillment) : [];

  return (
    <DashboardShell title="Nonprofit Dashboard" navLabel="Nonprofit Workspace" items={NAV}>
      <section className="dpdash-nba">
        <div className="dpdash-nba-head">
          <span className="dpdash-nba-kicker">Next best action</span>
          <span className="dpdash-nba-title">Grow your fundraising</span>
        </div>
        <div className="dpdash-nba-prompts">
          {PROMPTS.map((p, i) => (
            <button key={i} type="button" className="dpdash-prompt" onClick={() => nav('/fundraising-builder')}>
              {p}
            </button>
          ))}
        </div>
      </section>

      {err && (
        <div className="dpdash-card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 18 }}>
          <p style={{ margin: 0 }}>Could not load your dashboard: {err}</p>
        </div>
      )}

      <div className="dpdash-stats">
        <div className="dpdash-stat">
          <div className="dpdash-stat-k">Fundraising goal</div>
          <div className="dpdash-stat-v">{loading ? '...' : money(data?.goalAmount ?? 0)}</div>
          <div className="dpdash-stat-d">{hasData ? `across ${data!.fundraisingEventCount} event(s)` : 'set a goal'}</div>
        </div>
        <div className="dpdash-stat">
          <div className="dpdash-stat-k">Revenue {data?.revenueSource === 'payments' ? 'collected' : 'committed'}</div>
          <div className="dpdash-stat-v">{loading ? '...' : money(data?.revenueCollected ?? 0)}</div>
          <div className="dpdash-stat-d">{hasData ? `${data!.goalProgressPct}% of goal` : 'no revenue yet'}</div>
        </div>
        <div className="dpdash-stat">
          <div className="dpdash-stat-k">Net</div>
          <div className="dpdash-stat-v">{loading ? '...' : money(data?.net ?? 0)}</div>
          <div className="dpdash-stat-d">revenue minus budget</div>
        </div>
        <div className="dpdash-stat">
          <div className="dpdash-stat-k">Guests</div>
          <div className="dpdash-stat-v">{loading ? '...' : (data?.guestCount ?? 0).toLocaleString()}</div>
          <div className="dpdash-stat-d">registered / RSVP</div>
        </div>
      </div>

      {!loading && !hasData && !err && (
        <div className="dpdash-card" style={{ marginBottom: 24 }}>
          <h3>Get started</h3>
          <p className="dpdash-card-sub">
            Your dashboard fills in as you add data. Create a fundraising event for {org},
            then build sponsorship and ticket packages around it.
          </p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">F</span>
            <p>No fundraising events yet. Goal, revenue, guests, and fulfillment will appear here once you start.</p>
            <button type="button" className="dpdash-btn" onClick={() => nav('/fundraising-builder')}>Create a fundraising event</button>
          </div>
        </div>
      )}

      <div className="dpdash-sectiontitle">Revenue and fulfillment</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Sponsorship revenue</h3>
          <p className="dpdash-card-sub">From committed tiered sponsorship packages.</p>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, color: 'var(--dp-emerald)' }}>
            {loading ? '...' : money(data?.sponsorshipRevenue ?? 0)}
          </div>
          <button type="button" className="dpdash-btn ghost" onClick={() => nav('/sponsorship-packages')}>Manage packages</button>
        </div>

        <div className="dpdash-card">
          <h3>Ticket and table revenue</h3>
          <p className="dpdash-card-sub">From committed ticket and table packages.</p>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, color: 'var(--dp-emerald)' }}>
            {loading ? '...' : money(data?.ticketRevenue ?? 0)}
          </div>
          <div className="dpdash-card-sub" style={{ marginTop: 4 }}>
            {loading ? '' : `${(data?.ticketsSoldSeats ?? 0).toLocaleString()} seat(s) sold`}
          </div>
          <button type="button" className="dpdash-btn ghost" onClick={() => nav('/ticket-table')}>Manage tickets</button>
        </div>

        <div className="dpdash-card">
          <h3>Sponsor fulfillment</h3>
          <p className="dpdash-card-sub">Delivery status across your sponsor commitments.</p>
          {loading ? (
            <p className="dpdash-card-sub">Loading...</p>
          ) : !data?.fulfillmentAvailable || fulfillmentEntries.length === 0 ? (
            <div className="dpdash-empty">
              <span className="dpdash-empty-glyph" aria-hidden="true">C</span>
              <p>No fulfillment tracking yet. Add a fulfillment checklist to a sponsorship package to track delivery here.</p>
              <button type="button" className="dpdash-btn ghost" onClick={() => nav('/sponsorship-packages')}>Build checklists</button>
            </div>
          ) : (
            <div className="note" style={{ lineHeight: 1.9 }}>
              {fulfillmentEntries.map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ textTransform: 'capitalize' }}>{status.replace(/_/g, ' ')}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dpdash-card">
          <h3>Tasks overdue</h3>
          <p className="dpdash-card-sub">Open event tasks past their due date.</p>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, color: (data?.tasksOverdue ?? 0) > 0 ? '#c0392b' : 'var(--dp-emerald)' }}>
            {loading ? '...' : (data?.tasksOverdue ?? 0)}
          </div>
          <button type="button" className="dpdash-btn ghost" onClick={() => nav('/events')}>View events</button>
        </div>
      </div>
    </DashboardShell>
  );
}
