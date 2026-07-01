import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useFeatures } from '../lib/features';

const NAV: Record<string, [string, string, string][]> = {
  buyer: [
    ['/app', 'Dashboard', '▦'],
    ['/coo', 'AI COO', '◆'],
    ['/command-center', 'Command Center', '◇'],
    ['/business-health', 'Business Health', '❤'],
    ['/revenue-intelligence', 'Revenue Intelligence', '◑'],
    ['/forecasting', 'Forecasting', '◴'],
    ['/projects', 'Projects', '▣'],
    ['/event-recommendations', 'Recommendations', '✧'],
    ['/venue-twin', 'Venue Twin', '◳'],
    ['/preferred-vendors', 'Preferred Vendors', '★'],
    ['/revenue-inventory', 'Revenue Inventory', '$'],
    ['/sponsorships', 'Sponsorships', '◈'],
    ['/sponsorship-intel', 'Sponsorship Intel', '◉'],
    ['/venue-comparison', 'Venue Comparison', '⊞'],
    ['/leads', 'Leads', '✉'],
    ['/event-assistant', 'Event Assistant', '✶'],
    ['/opportunities', 'Opportunities', '◎'],
    ['/revenue-dashboard', 'Revenue Dashboard', '▥'],
    ['/relationship-graph', 'Relationship Graph', '⁂'],
    ['/partnership-matches', 'Partnership Matches', '⇄'],
    ['/divini-scores', 'Divini Scores', '✷'],
    ['/founding-member', 'Founding Member', '♛'],
    ['/profile', 'Company', '⚙'],
  ],
  vendor: [
    ['/app', 'Dashboard', '▦'],
    ['/coo', 'AI COO', '◆'],
    ['/command-center', 'Command Center', '◇'],
    ['/business-health', 'Business Health', '❤'],
    ['/search-bids', 'Search Bids', '⌕'],
    ['/bids', 'My Bids', '◧'],
    ['/vendor-requirements', 'Quote Requirements', '▤'],
    ['/vendor-pricing', 'Pricing Rules', '⌗'],
    ['/quote-drafts', 'Quote Drafts', '✎'],
    ['/vendor-readiness-score', 'Readiness Score', '◔'],
    ['/vendor-compliance', 'Compliance', '✓'],
    ['/opportunities', 'Opportunities', '◎'],
    ['/divini-scores', 'Divini Scores', '✷'],
    ['/founding-member', 'Founding Member', '♛'],
    ['/profile', 'Profile', '☺'],
  ],
};

export default function Shell({ children }: { children: ReactNode }) {
  const { company, signOut } = useAuth();
  const { isAdmin } = useFeatures();
  const nav = useNavigate();
  const loc = useLocation();
  const role = company?.kind ?? 'buyer';
  const items: [string, string, string][] = [];
  if (isAdmin) items.push(['/admin', 'Admin Console', '◆']);
  if (company) items.push(...NAV[role]);
  if (isAdmin) items.push(['/admin/features', 'Features', '✦']);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/mark-ivory.png" alt="Divini Partners" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">Event Partnership</div>
          </div>
        </div>
        <div className="nav-label">{isAdmin && !company ? 'Admin' : role === 'vendor' ? 'Vendor' : 'Buyer Workspace'}</div>
        <nav className="nav">
          {items.map(([path, label, icon]) => (
            <a key={path} className={loc.pathname === path ? 'active' : ''} onClick={() => nav(path)}>
              <span>{icon}</span> {label}
            </a>
          ))}
        </nav>
        <div className="foot">
          <a onClick={signOut} style={{ cursor: 'pointer' }}>Sign out</a>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="sp" />
          <div className="note">{company?.name}</div>
        </div>
        <div className="mtop">
          <span className="nm">Divini Partners</span>
          <a onClick={signOut} style={{ color: '#fff', cursor: 'pointer', fontSize: 13 }}>Sign out</a>
        </div>
        <div className="content">{children}</div>
        <nav className="mbottom">
          {items.map(([path, label, icon]) => (
            <a key={path} className={loc.pathname === path ? 'active' : ''} onClick={() => nav(path)}>
              <span style={{ fontSize: 18 }}>{icon}</span>{label.split(' ')[0]}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
