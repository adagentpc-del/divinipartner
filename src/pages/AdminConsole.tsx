import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/api';

/**
 * Overview previously called GET /admin/overview, which was never a real
 * route -- it was written against an abandoned companies/buildings/packages
 * data model the app moved away from. Rebuilt against the two real, already-
 * working admin endpoints instead: GET /admin/metrics (server/src/db/admin.ts
 * getMetrics(), the same aggregate AdminIntelligence.tsx already renders in
 * full depth) for top-line numbers, and GET /admin/accounts for a recently-
 * joined companies list. No new backend surface, no duplicated query logic.
 */
type Metrics = {
  generated_at: string;
  money: { gmv: number; platform_fee_revenue: number; mrr: number; paid_invoices: number };
  marketplace: { bid_volume: number; quotes_submitted: number; quotes_accepted: number; quote_conversion_rate: number };
  accounts: { total: number; incomplete_onboarding: number; churn_risk: number };
  attention: { open_disputes: number; open_tickets: number; pending_verification: number };
};
type Account = {
  id: string; name: string; type: string | null; tier: string | null;
  verification_status: string | null; created_at: string;
};

const money = (n?: number) => (n == null ? '-' : '$' + Number(n).toLocaleString());
const date = (s?: string) => (s ? new Date(s).toLocaleDateString() : '-');

// Every admin section, reachable as a clickable tab from the console.
const ADMIN_TABS: [string, string][] = [
  ['/admin', 'Overview'],
  ['/admin/accounts', 'Accounts'],
  ['/admin/intelligence', 'Intelligence'],
  ['/admin/win-loss', 'Win / Loss'],
  ['/admin/signals', 'Visitor Signals'],
  ['/admin/claim-engine', 'Claim Engine'],
  ['/admin/audit', 'Audit Log'],
  ['/admin/white-label', 'White Label'],
];

export default function AdminConsole() {
  // useAuth() directly, not useFeatures() -- FeaturesProvider is never
  // mounted anywhere in App.tsx, so useFeatures() always reads its context's
  // default {} and isAdmin was always undefined here regardless of real
  // admin status. useAuth() is the same source every other working admin
  // page (AdminAccounts.tsx, AdminIntelligence.tsx) already uses correctly.
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<{ metrics: Metrics }>('/admin/metrics'),
      apiGet<{ accounts: Account[] }>('/admin/accounts'),
    ])
      .then(([m, a]) => {
        setMetrics(m.metrics);
        setAccounts(a.accounts.slice(0, 10));
      })
      .catch((e) => setErr(e.message ?? 'Could not load admin data.'))
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) return <div className="card">Admins only.</div>;

  const cards: [string, string | number | undefined][] = [
    ['GMV', metrics ? money(metrics.money.gmv) : undefined],
    ['Platform fee revenue', metrics ? money(metrics.money.platform_fee_revenue) : undefined],
    ['MRR', metrics ? money(metrics.money.mrr) : undefined],
    ['Total accounts', metrics?.accounts.total],
    ['Bid volume', metrics?.marketplace.bid_volume],
    ['Quote conversion', metrics ? `${metrics.marketplace.quote_conversion_rate}%` : undefined],
  ];
  const attention = metrics
    ? [
        ['Open disputes', metrics.attention.open_disputes],
        ['Open support tickets', metrics.attention.open_tickets],
        ['Pending verification', metrics.attention.pending_verification],
      ] as const
    : [];
  const needsAttention = attention.some(([, n]) => n > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin Console</h1>
          <div className="sub">Platform-wide view of accounts, marketplace activity, and revenue on Divini Partners.</div>
        </div>
      </div>

      <div
        className="admin-tabs"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}
      >
        {ADMIN_TABS.map(([path, label]) => {
          const active = path === '/admin';
          return (
            <button
              key={path}
              className={`btn ${active ? 'primary' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => nav(path)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {err && <div className="err">{err}</div>}
      {loading && <div className="note">Loading…</div>}

      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        {cards.map(([label, n]) => (
          <div className="card" key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{n ?? '-'}</div>
            <div className="note">{label}</div>
          </div>
        ))}
      </div>

      {!loading && metrics && (
        <>
          <div className="sectitle">Needs attention</div>
          <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {attention.map(([label, n]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: n > 0 ? '#9a3a28' : undefined }}>{n}</span>
                <span className="note">{label}</span>
              </div>
            ))}
            {!needsAttention && <span className="note">Nothing outstanding right now.</span>}
          </div>
        </>
      )}

      <div className="sectitle">Recently joined</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Tier</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav('/admin/accounts')}>
                <td><strong>{a.name}</strong></td>
                <td>{a.type ?? '-'}</td>
                <td>{a.tier ?? '-'}</td>
                <td><span className="chip">{a.verification_status ?? 'draft'}</span></td>
                <td>{date(a.created_at)}</td>
              </tr>
            ))}
            {!loading && accounts.length === 0 && (
              <tr><td colSpan={5} className="note">No accounts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
