import React from 'react';
import DashboardShell, { useMe, NavItem } from './DashboardShell';

// Nav items carry `to` routes so the planner sidebar reaches the live pages
// (DashboardShell navigates when `to` is set, matching the other dashboards).
// Labels with no real route stay inert rather than linking to a 404.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'Events', icon: 'E', to: '/events' },
  { label: 'Recommendations', icon: 'C', to: '/event-recommendations' },
  { label: 'Event Assistant', icon: 'A', to: '/event-assistant' },
  { label: 'Venue Comparison', icon: 'V', to: '/venue-comparison' },
  { label: 'Preferred Vendors', icon: 'D', to: '/preferred-vendors' },
  { label: 'Guest Hub', icon: 'S', to: '/guest-hub' },
  { label: 'Change Orders', icon: 'O', to: '/change-orders' },
  { label: 'Event Memory', icon: 'Y', to: '/event-memory' },
  { label: 'Post-Event Feedback', icon: 'K', to: '/post-event-feedback' },
  { label: 'Opportunities', icon: 'X', to: '/opportunities' },
  { label: 'Playbooks', icon: 'B', to: '/playbooks' },
  { label: 'Relationship Graph', icon: 'G', to: '/relationship-graph' },
  { label: 'Partnership Matches', icon: 'H', to: '/partnership-matches' },
  { label: 'War Room', icon: 'W', to: '/event-war-room' },
  { label: 'Approval Graph', icon: 'P', to: '/approval-graph' },
  { label: 'Divini Scores', icon: 'Z', to: '/divini-scores' },
  { label: 'AI COO', icon: 'U', to: '/coo' },
  { label: 'Command Center', icon: 'M', to: '/command-center' },
  { label: 'Daily Briefing', icon: 'D', to: '/daily-briefing' },
  { label: 'Marketplace Intelligence', icon: 'K', to: '/marketplace-intelligence' },
  { label: 'Business Health', icon: 'B', to: '/business-health' },
  { label: 'Profile', icon: 'R', to: '/profile' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

// Next-best-action prompts for planners (blueprint section 25, planner role).
const PROMPTS = [
  'Set up your next client event',
  'Source venues and vendors for an event',
  'Build the run-of-show timeline',
  'Track the budget against quotes',
];

function PromptStrip() {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Run every event</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt">{p}</button>
        ))}
      </div>
    </section>
  );
}

export default function PlannerDashboard() {
  const { me } = useMe();
  const who = me?.organization?.name ?? me?.name ?? 'your studio';

  return (
    <DashboardShell title="Planner Studio" navLabel="Planner Workspace" items={NAV}>
      <PromptStrip />

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Active events</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">in production</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Open tasks</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">across events</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Quotes in review</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">awaiting decision</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Budget tracked</div><div className="dpdash-stat-v">$0</div><div className="dpdash-stat-d">committed</div></div>
      </div>

      <div className="dpdash-sectiontitle">Production</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Events</h3>
          <p className="dpdash-card-sub">All events {who} is managing for clients.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">E</span>
            <p>No events yet. Create an event to start sourcing venues, vendors, and building timelines.</p>
            <button type="button" className="dpdash-btn">Create event</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Timelines and tasks</h3>
          <p className="dpdash-card-sub">Run-of-show, milestones, and assignments.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">L</span>
            <p>No timelines built. Add an event to lay out the run-of-show and assign tasks to your team.</p>
            <button type="button" className="dpdash-btn ghost">Open timelines</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Bids and quotes</h3>
          <p className="dpdash-card-sub">Compare vendor proposals across each event.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">Q</span>
            <p>No quotes yet. Request bids from venues and vendors to compare and award the work.</p>
            <button type="button" className="dpdash-btn ghost">View quotes</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Budgets</h3>
          <p className="dpdash-card-sub">Keep committed and estimated spend in line.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">U</span>
            <p>No budgets set. Add an event budget to track quotes, invoices, and remaining spend in real time.</p>
            <button type="button" className="dpdash-btn ghost">Set up budget</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
