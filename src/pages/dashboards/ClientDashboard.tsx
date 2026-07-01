import React from 'react';
import DashboardShell, { useMe, NavItem } from './DashboardShell';

// Nav items carry `to` routes so the client/sponsor sidebar reaches the live
// pages (DashboardShell navigates when `to` is set, matching the other
// dashboards). The sponsor role currently maps to this dashboard, so the
// Sponsorships destination is wired here too. Labels with no real route stay
// inert rather than linking to a 404.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'My Events', icon: 'E', to: '/events' },
  { label: 'Marketplace', icon: 'V', to: '/marketplace' },
  { label: 'Recommendations', icon: 'C', to: '/event-recommendations' },
  { label: 'Event Assistant', icon: 'A', to: '/event-assistant' },
  { label: 'Guest Hub', icon: 'G', to: '/guest-hub' },
  { label: 'Post-Event Feedback', icon: 'K', to: '/post-event-feedback' },
  { label: 'Sponsorships', icon: 'H', to: '/sponsorships' },
  { label: 'Opportunities', icon: 'X', to: '/opportunities' },
  { label: 'Founding Member', icon: 'F', to: '/founding-member' },
  { label: 'Profile', icon: 'R', to: '/profile' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

// Next-best-action prompts for clients (blueprint section 25.3).
const PROMPTS = [
  'Create your first event',
  'Find venues that fit your guest count',
  'Request quotes from vendors',
  'Start your guest list',
];

function PromptStrip() {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Plan your event</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt">{p}</button>
        ))}
      </div>
    </section>
  );
}

export default function ClientDashboard() {
  const { me } = useMe();
  const who = me?.name ?? 'there';

  return (
    <DashboardShell title="My Events" navLabel="Client Workspace" items={NAV}>
      <PromptStrip />

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Active events</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">in planning</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Quotes received</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">to review</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Guests</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">on your lists</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Open invoices</div><div className="dpdash-stat-v">$0</div><div className="dpdash-stat-d">due</div></div>
      </div>

      <div className="dpdash-sectiontitle">Your planning</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Your events</h3>
          <p className="dpdash-card-sub">Everything you are planning, in one place.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">E</span>
            <p>You have no events yet, {who}. Create an event to start finding venues and vendors.</p>
            <button type="button" className="dpdash-btn">Create event</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Find venues and vendors</h3>
          <p className="dpdash-card-sub">Browse and shortlist partners for your event.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">V</span>
            <p>Nothing shortlisted yet. Search venues by capacity and date, then request quotes from vendors.</p>
            <button type="button" className="dpdash-btn ghost">Start searching</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Quotes and bids</h3>
          <p className="dpdash-card-sub">Compare proposals side by side and award the work.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">Q</span>
            <p>No quotes yet. Once you request bids, vendor proposals will appear here for easy comparison.</p>
            <button type="button" className="dpdash-btn ghost">View quotes</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Guests and seating</h3>
          <p className="dpdash-card-sub">Manage your guest list and seating charts.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">G</span>
            <p>No guests added. Start a guest list and build seating charts once your venue is confirmed.</p>
            <button type="button" className="dpdash-btn ghost">Start guest list</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
