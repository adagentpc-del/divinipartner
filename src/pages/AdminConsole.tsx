import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatures } from '../lib/features';
import { apiGet } from '../lib/api';

type Counts = {
  companies: number; buyers: number; vendors: number; buildings: number;
  packages: number; open_packages: number; awards: number; bids: number;
};
type Company = { id: string; kind: string; name: string; city?: string; region?: string; created_at: string };
type Pkg = { id: string; category: string; status: string; deadline?: string; building: string; bid_count: number };
type Bid = { id: string; price: number; days: number; status: string; vendor: string; category: string; building: string; created_at: string };
type Overview = { counts: Counts; companies: Company[]; packages: Pkg[]; bids: Bid[] };

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
  ['/admin/features', 'Feature Flags'],
];

export default function AdminConsole() {
  const { isAdmin } = useFeatures();
  const nav = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Overview>('/admin/overview')
      .then(setData)
      .catch((e) => setErr(e.message ?? 'Could not load admin data.'))
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) return <div className="card">Admins only.</div>;

  const c = data?.counts;
  const cards: [string, number | undefined][] = [
    ['Companies', c?.companies],
    ['Clients', c?.buyers],
    ['Vendors', c?.vendors],
    ['Venues', c?.buildings],
    ['Events', c?.packages],
    ['Open Events', c?.open_packages],
    ['Quotes', c?.bids],
    ['Booked', c?.awards],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin Console</h1>
          <div className="sub">Platform-wide view of every company, event, and quote on Divini Partners.</div>
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

      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        {cards.map(([label, n]) => (
          <div className="card" key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{n ?? '-'}</div>
            <div className="note">{label}</div>
          </div>
        ))}
      </div>

      <div className="sectitle">Companies</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Joined</th></tr></thead>
          <tbody>
            {(data?.companies ?? []).map((co) => (
              <tr key={co.id}>
                <td><strong>{co.name}</strong></td>
                <td>{co.kind === 'buyer' ? 'Client' : 'Vendor'}</td>
                <td>{[co.city, co.region].filter(Boolean).join(', ') || '-'}</td>
                <td>{date(co.created_at)}</td>
              </tr>
            ))}
            {!loading && (data?.companies ?? []).length === 0 && (
              <tr><td colSpan={4} className="note">No companies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sectitle">Events</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Venue</th><th>Category</th><th>Status</th><th>Quotes</th><th>Deadline</th></tr></thead>
          <tbody>
            {(data?.packages ?? []).map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/events/${p.id}`)}>
                <td>{p.building}</td>
                <td>{p.category}</td>
                <td><span className="chip">{p.status}</span></td>
                <td>{p.bid_count}</td>
                <td>{date(p.deadline)}</td>
              </tr>
            ))}
            {!loading && (data?.packages ?? []).length === 0 && (
              <tr><td colSpan={5} className="note">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sectitle">Recent Quotes</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Vendor</th><th>Event</th><th>Price</th><th>Days</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {(data?.bids ?? []).map((b) => (
              <tr key={b.id}>
                <td><strong>{b.vendor}</strong></td>
                <td>{b.category} · {b.building}</td>
                <td>{money(b.price)}</td>
                <td>{b.days}</td>
                <td><span className="chip">{b.status}</span></td>
                <td>{date(b.created_at)}</td>
              </tr>
            ))}
            {!loading && (data?.bids ?? []).length === 0 && (
              <tr><td colSpan={6} className="note">No quotes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
