import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';

// Nav items carry `to` routes so the installer sidebar reaches the live pages
// (DashboardShell navigates when `to` is set, matching the other dashboards).
// Installer-specific surfaces (Skills & Certs, Availability, Tasks, Messages,
// Completion Photos) have no dedicated route yet, so those stay inert rather
// than linking to a 404.
const NAV: NavItem[] = [
  { label: 'Overview', icon: 'O', to: '/app' },
  { label: 'My Profile', icon: 'P', to: '/profile' },
  { label: 'Skills & Certs', icon: 'S' },
  { label: 'Availability', icon: 'A' },
  { label: 'Assigned Jobs', icon: 'J', to: '/installations' },
  { label: 'Installations', icon: 'L', to: '/installations' },
  { label: 'Events', icon: 'E', to: '/events' },
  { label: 'Tasks', icon: 'K' },
  { label: 'Messages', icon: 'M' },
  { label: 'Completion Photos', icon: 'C' },
  { label: 'Invoices', icon: 'I', to: '/invoices' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Preferred Partners', icon: 'P', to: '/preferred-partners' },
  { label: 'Campaigns', icon: 'C', to: '/relationship-campaigns' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

// Next-best-action prompts for installers (blueprint section 25, installer role).
const PROMPTS = [
  'Complete your skills and certifications',
  'Set your availability for the week',
  'Review your next assigned job',
  'Upload completion photos for a job',
];

function PromptStrip({ onPrompt }: { onPrompt: () => void }) {
  return (
    <section className="dpdash-nba">
      <div className="dpdash-nba-head">
        <span className="dpdash-nba-kicker">Next best action</span>
        <span className="dpdash-nba-title">Get job ready</span>
      </div>
      <div className="dpdash-nba-prompts">
        {PROMPTS.map((p, i) => (
          <button key={i} type="button" className="dpdash-prompt" onClick={onPrompt}>{p}</button>
        ))}
      </div>
    </section>
  );
}

export default function InstallerDashboard() {
  const { me } = useMe();
  const nav = useNavigate();
  const who = me?.name ?? 'there';

  return (
    <DashboardShell title="Installer Dashboard" navLabel="Installer Workspace" items={NAV}>
      <PromptStrip onPrompt={() => nav('/installations')} />

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Assigned jobs</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">upcoming</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Open tasks</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">to complete</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Certifications</div><div className="dpdash-stat-v">0</div><div className="dpdash-stat-d">on file</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Invoices</div><div className="dpdash-stat-v">$0</div><div className="dpdash-stat-d">pending</div></div>
      </div>

      <div className="dpdash-sectiontitle">Your work</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Assigned jobs</h3>
          <p className="dpdash-card-sub">Installs and tear-downs scheduled for you.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">J</span>
            <p>No jobs assigned yet, {who}. Set your availability and complete your profile to get scheduled.</p>
            <button type="button" className="dpdash-btn ghost" onClick={() => nav('/installations')}>View jobs</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Skills and certifications</h3>
          <p className="dpdash-card-sub">Show what you are qualified to handle on site.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">S</span>
            <p>No skills or certs added. List your capabilities and upload certifications to qualify for more jobs.</p>
            <button type="button" className="dpdash-btn" disabled title="Skills and certifications management is not built yet.">Add skills (coming soon)</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Availability</h3>
          <p className="dpdash-card-sub">Tell us when you can take jobs.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">A</span>
            <p>No availability set. Add your working days and hours so jobs can be routed to you.</p>
            <button type="button" className="dpdash-btn ghost" disabled title="Availability scheduling is not built yet.">Set availability (coming soon)</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Completion photos</h3>
          <p className="dpdash-card-sub">Document finished work to close out jobs and get paid.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">C</span>
            <p>No photos uploaded. Once you finish a job, add completion photos to confirm and trigger invoicing.</p>
            <button type="button" className="dpdash-btn ghost" disabled title="Completion-photo upload is not built yet.">Upload photos (coming soon)</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
