import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Super Admin Claim Engine dashboard. Admin-only.
 *
 * Metrics: discovered / created / pending / claimed / conversion / emails /
 * bounces / unsubscribes / removals / duplicates / review queue / top
 * categories + cities.
 *
 * Actions: discover (ingest rows), approve / edit / archive / merge /
 * do-not-contact, send-email, pause, market scheduler controls, suppression.
 *
 * ZERO em dashes anywhere (hard rule). Self-contained styles, Divini brand.
 */

type Metrics = {
  discovered: number;
  created: number;
  pending: number;
  claimed: number;
  verified: number;
  conversionRate: number;
  emailsSent: number;
  bounces: number;
  unsubscribes: number;
  removals: number;
  duplicates: number;
  reviewQueue: number;
  openCount: number;
  clickCount: number;
  openRate: number;
  clickRate: number;
  topCategories: { category: string; count: number }[];
  topCities: { city: string; count: number }[];
};

type Business = {
  id: string;
  business_name: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
  website_url: string | null;
  public_email: string | null;
  confidence_score: string | null;
  confidence_band: string | null;
  discovery_status: string | null;
  duplicate_of: string | null;
};

type Market = {
  id: string;
  market_name: string | null;
  state: string | null;
  region: string | null;
  status: string | null;
  max_profiles: number | null;
  profiles_discovered: number | null;
  priority: number | null;
};

type Plan = {
  current: Market | null;
  next: { marketName: string; state: string; region: string } | null;
  rollout: { marketName: string; state: string; region: string }[];
  action: string;
  reason: string;
};

type Suppression = { id: string; email: string | null; domain: string | null; reason: string | null; created_at: string };

const STYLES = `
.cea{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--gold:#C9A35B;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;--bg:#f3efe6;background:var(--ivory);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.cea .wrap{max-width:1180px;margin:0 auto;padding:26px 28px 60px}
.cea h1,.cea h2,.cea h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.cea .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
.cea .top h1{font-size:28px}
.cea .top .by{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.cea .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:20px 0 26px}
.cea .stat{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 15px}
.cea .stat .k{font-size:10.5px;color:var(--muted);letter-spacing:.3px;text-transform:uppercase;font-weight:600}
.cea .stat .v{font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--emerald-deep);line-height:1.05;margin-top:3px}
.cea .sectitle{font-size:12px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:26px 0 12px}
.cea .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.cea .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cea table{width:100%;border-collapse:collapse}
.cea th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}
.cea td{padding:10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.cea .band{font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:20px}
.cea .band.high{background:#e6f3ec;color:#1a5d42}
.cea .band.review{background:#f6f1e6;color:#8a6a1f}
.cea .band.low,.cea .band.reject{background:#fbeeee;color:#7a3030}
.cea .status{font-size:11px;color:var(--muted)}
.cea .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;margin:0 4px 4px 0}
.cea .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.cea .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.cea .btn.primary:hover{background:var(--emerald-mid)}
.cea .btn.warn{color:#7a3030}
.cea label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.cea input,.cea textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13.5px;background:#fff;color:var(--ink);box-sizing:border-box}
.cea input:focus,.cea textarea:focus{outline:none;border-color:var(--emerald)}
.cea .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.cea .chips{display:flex;flex-wrap:wrap;gap:7px}
.cea .chip{font-size:12px;font-weight:600;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:20px;padding:5px 11px}
.cea .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-top:10px}
.cea .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.cea .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.cea .plan{display:flex;flex-wrap:wrap;align-items:center;gap:14px;background:linear-gradient(120deg,var(--emerald-deep),var(--emerald));color:#fff;border-radius:13px;padding:16px 20px;margin-bottom:14px}
.cea .plan b{color:var(--champagne)}
.cea .gate{max-width:460px;margin:80px auto;text-align:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
.cea .pre{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:11.5px;background:var(--ivory);border:1px solid var(--line);border-radius:9px;padding:12px;max-height:240px;overflow:auto;margin-top:10px}
@media(max-width:1024px){.cea .stats{grid-template-columns:repeat(3,1fr)}.cea .grid2{grid-template-columns:1fr}.cea .row3{grid-template-columns:1fr}}
`;

export default function ClaimEngineAdmin() {
  const { isAdmin, loading, session } = useAuth();
  const nav = useNavigate();

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [queue, setQueue] = useState<Business[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [suppression, setSuppression] = useState<Suppression[]>([]);
  const [discoverJson, setDiscoverJson] = useState(
    '[\n  {\n    "businessName": "",\n    "website": "",\n    "city": "",\n    "category": "",\n    "publicEmail": ""\n  }\n]',
  );
  const [supEmail, setSupEmail] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [discoverOut, setDiscoverOut] = useState<string>('');

  async function refresh() {
    try {
      const [m, q, mk, pl, sup] = await Promise.all([
        apiGet<{ metrics: Metrics }>('/claim/admin/metrics'),
        apiGet<{ businesses: Business[] }>('/claim/admin/queue'),
        apiGet<{ markets: Market[] }>('/claim/admin/markets'),
        apiGet<{ plan: Plan }>('/claim/admin/markets/plan'),
        apiGet<{ suppression: Suppression[] }>('/claim/admin/suppression'),
      ]);
      setMetrics(m.metrics);
      setQueue(q.businesses);
      setMarkets(mk.markets);
      setPlan(pl.plan);
      setSuppression(sup.suppression);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load claim engine data.' });
    }
  }

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin]);

  async function runDiscover() {
    setMsg(null);
    setDiscoverOut('');
    let rows: unknown;
    try {
      rows = JSON.parse(discoverJson);
    } catch {
      setMsg({ kind: 'err', text: 'The rows JSON is not valid. Please fix it and try again.' });
      return;
    }
    const list = Array.isArray(rows) ? rows : [rows];
    const mapped = (list as Record<string, unknown>[]).map((r) => ({
      businessName: r.businessName ?? r.name,
      websiteUrl: r.websiteUrl ?? r.website,
      city: r.city,
      state: r.state,
      region: r.region,
      category: r.category,
      publicEmail: r.publicEmail ?? r.email,
      publicPhone: r.publicPhone ?? r.phone,
    }));
    try {
      const out = await apiSend<{ summary: Record<string, number>; outcomes: unknown[] }>(
        'POST',
        '/claim/admin/discover',
        { rows: mapped },
      );
      setDiscoverOut(JSON.stringify(out, null, 2));
      setMsg({ kind: 'ok', text: `Ingest complete. Created ${out.summary.created ?? 0}, duplicates ${out.summary.duplicate ?? 0}.` });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Discovery failed.' });
    }
  }

  async function act(path: string, body?: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    setMsg(null);
    try {
      await apiSend(method, path, body);
      setMsg({ kind: 'ok', text: 'Done.' });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Action failed.' });
    }
  }

  async function addSuppression() {
    if (!supEmail.trim()) return;
    await act('/claim/admin/suppression', { email: supEmail.trim(), reason: 'manual' });
    setSupEmail('');
  }

  if (loading) {
    return (
      <div className="cea"><style>{STYLES}</style><div className="wrap"><p style={{ padding: 60 }}>Loading...</p></div></div>
    );
  }

  if (!session?.user) {
    return (
      <div className="cea">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Sign in required</h1>
          <p>The Claim Engine console is available to platform administrators.</p>
          <button className="btn primary" onClick={() => nav('/login')}>Sign in</button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="cea">
        <style>{STYLES}</style>
        <div className="gate">
          <h1>Administrators only</h1>
          <p>You do not have access to the Claim Engine console.</p>
          <button className="btn" onClick={() => nav('/app')}>Back to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cea">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="top">
          <div>
            <h1>Claim Engine</h1>
            <div className="by">Divini Partners by Divini Group</div>
          </div>
          <button className="btn" onClick={() => void refresh()}>Refresh</button>
        </div>

        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

        <div className="stats">
          <Stat k="Discovered" v={metrics?.discovered ?? 0} />
          <Stat k="Profiles created" v={metrics?.created ?? 0} />
          <Stat k="Claim pending" v={metrics?.pending ?? 0} />
          <Stat k="Claimed" v={metrics?.claimed ?? 0} />
          <Stat k="Conversion" v={`${metrics?.conversionRate ?? 0}%`} />
          <Stat k="Verified" v={metrics?.verified ?? 0} />
          <Stat k="Emails sent" v={metrics?.emailsSent ?? 0} />
          <Stat k="Bounces" v={metrics?.bounces ?? 0} />
          <Stat k="Unsubscribes" v={metrics?.unsubscribes ?? 0} />
          <Stat k="Removals" v={metrics?.removals ?? 0} />
          <Stat k="Duplicates" v={metrics?.duplicates ?? 0} />
          <Stat k="Review queue" v={metrics?.reviewQueue ?? 0} />
          <Stat k="Opens" v={`${metrics?.openCount ?? 0} (${metrics?.openRate ?? 0}%)`} />
          <Stat k="Clicks" v={`${metrics?.clickCount ?? 0} (${metrics?.clickRate ?? 0}%)`} />
        </div>

        <div className="grid2">
          <div className="card">
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>Top categories</h3>
            <div className="chips">
              {(metrics?.topCategories ?? []).map((c) => (
                <span className="chip" key={c.category}>{c.category} ({c.count})</span>
              ))}
              {!metrics?.topCategories?.length && <span className="status">None yet.</span>}
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>Top cities</h3>
            <div className="chips">
              {(metrics?.topCities ?? []).map((c) => (
                <span className="chip" key={c.city}>{c.city} ({c.count})</span>
              ))}
              {!metrics?.topCities?.length && <span className="status">None yet.</span>}
            </div>
          </div>
        </div>

        <div className="sectitle">Discover and enrich</div>
        <div className="card">
          <label>Admin-provided business rows (JSON, from publicly available information)</label>
          <textarea rows={8} value={discoverJson} onChange={(e) => setDiscoverJson(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={runDiscover}>Score, de-dupe, and create</button>
          </div>
          {discoverOut && <div className="pre">{discoverOut}</div>}
        </div>

        <div className="sectitle">Review queue</div>
        <div className="card">
          <table>
            <thead>
              <tr><th>Business</th><th>Category</th><th>Location</th><th>Score</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {queue.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.business_name}</div>
                    <div className="status">{b.public_email ?? b.website_url ?? ''}</div>
                  </td>
                  <td>{b.category ?? '-'}</td>
                  <td>{[b.city, b.region].filter(Boolean).join(', ') || '-'}</td>
                  <td>
                    {b.confidence_score ? Math.round(Number(b.confidence_score)) : '-'}
                    {b.confidence_band && <span className={`band ${b.confidence_band}`} style={{ marginLeft: 6 }}>{b.confidence_band}</span>}
                  </td>
                  <td><span className="status">{b.discovery_status}</span></td>
                  <td>
                    <button className="btn" onClick={() => act(`/claim/admin/businesses/${b.id}/status`, { status: 'unclaimed' })}>Approve</button>
                    <button className="btn warn" onClick={() => act(`/claim/admin/businesses/${b.id}/do-not-contact`)}>Do not contact</button>
                    <button className="btn warn" onClick={() => act(`/claim/admin/businesses/${b.id}/status`, { status: 'archived' })}>Archive</button>
                  </td>
                </tr>
              ))}
              {!queue.length && <tr><td colSpan={6} className="status">The review queue is empty.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="sectitle">Geographic expansion</div>
        <div className="card">
          {plan && (
            <div className="plan">
              <div style={{ flex: '1 1 280px' }}>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--champagne)' }}>Next action: {plan.action}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{plan.reason}</div>
                {plan.next && <div style={{ fontSize: 13, marginTop: 4 }}>Next market: <b>{plan.next.marketName}</b></div>}
              </div>
              <button className="btn primary" onClick={() => act('/claim/admin/markets/advance', { maxProfiles: 100 })}>Open next market</button>
            </div>
          )}
          <table>
            <thead><tr><th>Market</th><th>Region</th><th>Status</th><th>Discovered</th><th>Actions</th></tr></thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.market_name}</td>
                  <td>{[m.state, m.region].filter(Boolean).join(' / ')}</td>
                  <td><span className="status">{m.status}</span></td>
                  <td>{m.profiles_discovered ?? 0}{m.max_profiles ? ` / ${m.max_profiles}` : ''}</td>
                  <td>
                    <button className="btn" onClick={() => act(`/claim/admin/markets/${m.id}/status`, { status: 'active' })}>Activate</button>
                    <button className="btn" onClick={() => act(`/claim/admin/markets/${m.id}/status`, { status: 'paused' })}>Pause</button>
                    <button className="btn" onClick={() => act(`/claim/admin/markets/${m.id}/status`, { status: 'complete' })}>Complete</button>
                  </td>
                </tr>
              ))}
              {!markets.length && <tr><td colSpan={5} className="status">No markets opened yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="sectitle">Suppression list</div>
        <div className="card">
          <div className="row3">
            <div style={{ gridColumn: 'span 2' }}>
              <label>Add email or domain to suppression</label>
              <input value={supEmail} onChange={(e) => setSupEmail(e.target.value)} placeholder="email@business.com" />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button className="btn primary" onClick={addSuppression}>Add</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Email</th><th>Domain</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {suppression.map((s) => (
                <tr key={s.id}>
                  <td>{s.email ?? '-'}</td>
                  <td>{s.domain ?? '-'}</td>
                  <td><span className="status">{s.reason}</span></td>
                  <td><button className="btn warn" onClick={() => act(`/claim/admin/suppression/${s.id}`, undefined, 'DELETE')}>Remove</button></td>
                </tr>
              ))}
              {!suppression.length && <tr><td colSpan={4} className="status">No suppressed contacts.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
