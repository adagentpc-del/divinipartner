import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell, { useMe, NavItem } from './DashboardShell';
import { apiGet } from '../../lib/api';

/**
 * Workstream C - Sponsor Dashboard. Replaces ClientDashboard for the sponsor role
 * (the integration lead wires AppHome to render this for role 'sponsor').
 *
 * Nav items carry `to` routes so the sidebar reaches live pages (DashboardShell
 * navigates when `to` is set). The Sponsor Portal is the sponsor's home; the rest
 * reuse existing surfaces. The main area summarizes the sponsor's purchases,
 * fulfillment status, and spend, all sourced from /sponsor-purchases.
 *
 * Zero em dashes.
 */
const NAV: NavItem[] = [
  { label: 'Sponsor Portal', icon: 'P', to: '/sponsor-portal' },
  { label: 'Sponsor Matching', icon: 'M', to: '/sponsor-matching' },
  { label: 'Sponsorships', icon: 'H', to: '/sponsorships' },
  { label: 'Opportunities', icon: 'X', to: '/opportunities' },
  { label: 'Guest Hub', icon: 'G', to: '/guest-hub' },
  { label: 'Payments', icon: 'Y', to: '/payments' },
  { label: 'Invoices', icon: 'I', to: '/invoices' },
  { label: 'Profile', icon: 'R', to: '/profile' },
  { label: 'Decks & Programs', icon: 'K', to: '/profile/decks-programs' },
  { label: 'Referrals', icon: 'r', to: '/referral-dashboard' },
  { label: 'Payout Bank', icon: '@', to: '/connect-payouts/settings' },
  { label: 'My Payouts', icon: '$', to: '/connect-payouts/mine' },
];

const PROMPTS = [
  'Browse available sponsorships',
  'Sign your sponsorship agreement',
  'Upload your logo and ad artwork',
  'Add your guest names',
];

type Purchase = {
  id: string;
  status: string;
  amount?: string | number | null;
};

const ACTIVE = new Set(['interested', 'agreed', 'paid']);

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function SponsorDashboard() {
  const { me } = useMe();
  const nav = useNavigate();
  const who = me?.name ?? 'there';

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    apiGet<{ purchases: Purchase[] }>('/sponsor-purchases')
      .then((r) => { if (live) setPurchases(r.purchases ?? []); })
      .catch(() => { if (live) setPurchases([]); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const active = purchases.filter((p) => ACTIVE.has(p.status)).length;
  const fulfilled = purchases.filter((p) => p.status === 'fulfilled').length;
  const awaitingAgreement = purchases.filter((p) => p.status === 'interested').length;
  const spend = purchases
    .filter((p) => p.status === 'paid' || p.status === 'fulfilled')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <DashboardShell title="Sponsor Workspace" navLabel="Sponsor" items={NAV}>
      <section className="dpdash-nba">
        <div className="dpdash-nba-head">
          <span className="dpdash-nba-kicker">Next best action</span>
          <span className="dpdash-nba-title">Grow your impact</span>
        </div>
        <div className="dpdash-nba-prompts">
          {PROMPTS.map((p, i) => (
            <button key={i} type="button" className="dpdash-prompt" onClick={() => nav('/sponsor-portal')}>{p}</button>
          ))}
        </div>
      </section>

      <div className="dpdash-stats">
        <div className="dpdash-stat"><div className="dpdash-stat-k">Active sponsorships</div><div className="dpdash-stat-v">{loaded ? active : '-'}</div><div className="dpdash-stat-d">in progress</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Awaiting agreement</div><div className="dpdash-stat-v">{loaded ? awaitingAgreement : '-'}</div><div className="dpdash-stat-d">to sign</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Fulfilled</div><div className="dpdash-stat-v">{loaded ? fulfilled : '-'}</div><div className="dpdash-stat-d">delivered</div></div>
        <div className="dpdash-stat"><div className="dpdash-stat-k">Total spend</div><div className="dpdash-stat-v">{loaded ? money(spend) : '-'}</div><div className="dpdash-stat-d">committed</div></div>
      </div>

      <div className="dpdash-sectiontitle">Your sponsorships</div>
      <div className="dpdash-grid">
        <div className="dpdash-card">
          <h3>Sponsor Portal</h3>
          <p className="dpdash-card-sub">Browse packages, sign agreements, upload assets, and add guests.</p>
          {loaded && purchases.length === 0 ? (
            <div className="dpdash-empty">
              <span className="dpdash-empty-glyph" aria-hidden="true">P</span>
              <p>You have no sponsorships yet, {who}. Browse available packages and express your interest.</p>
              <button type="button" className="dpdash-btn" onClick={() => nav('/sponsor-portal')}>Open the portal</button>
            </div>
          ) : (
            <div className="dpdash-empty">
              <span className="dpdash-empty-glyph" aria-hidden="true">P</span>
              <p>{loaded ? `You have ${purchases.length} sponsorship${purchases.length === 1 ? '' : 's'}. Manage each one in the portal.` : 'Loading your sponsorships.'}</p>
              <button type="button" className="dpdash-btn" onClick={() => nav('/sponsor-portal')}>Manage sponsorships</button>
            </div>
          )}
        </div>

        <div className="dpdash-card">
          <h3>Fulfillment</h3>
          <p className="dpdash-card-sub">Track the deliverables the organizer is preparing for you.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">F</span>
            <p>Fulfillment progress for each sponsorship lives inside the portal. Open a sponsorship to see its tasks.</p>
            <button type="button" className="dpdash-btn ghost" onClick={() => nav('/sponsor-portal')}>View fulfillment</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Guests and seats</h3>
          <p className="dpdash-card-sub">Use your included seats and submit guest names.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">G</span>
            <p>Add guest names against your sponsorship allotment, then manage attendance in the Guest Hub.</p>
            <button type="button" className="dpdash-btn ghost" onClick={() => nav('/guest-hub')}>Open Guest Hub</button>
          </div>
        </div>

        <div className="dpdash-card">
          <h3>Payments and invoices</h3>
          <p className="dpdash-card-sub">Review your sponsorship payments and invoices.</p>
          <div className="dpdash-empty">
            <span className="dpdash-empty-glyph" aria-hidden="true">Y</span>
            <p>Your committed spend is {loaded ? money(spend) : 'loading'}. See the full record on your payments page.</p>
            <button type="button" className="dpdash-btn ghost" onClick={() => nav('/payments')}>View payments</button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
