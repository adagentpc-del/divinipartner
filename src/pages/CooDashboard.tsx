import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Divini AI COO (V2) - Executive Dashboard.
 *
 * A single executive view assembled live on the server from the existing
 * engines (opportunity, revenue leakage, event war-room, partnership match):
 * today's priorities, revenue opportunities, risks, approvals needed, follow-ups,
 * contracts expiring, sponsorship + partnership opportunities, recommended
 * actions, and a potential-revenue headline. Degrades gracefully to honest empty
 * states before real data accumulates.
 */

type Priority = {
  title: string;
  detail?: string;
  impact: number;
  category: string;
};
type RevenueOpportunity = { title: string; value: number; source: string };
type Risk = { title: string; severity: 'info' | 'warning' | 'critical'; recommendation?: string };
type Approval = { title: string; count: number };
type FollowUp = { title: string; detail?: string };
type ContractExpiring = { title: string; daysUntil: number | null };
type Sponsorship = { title: string; value: number };
type Partnership = { title: string; score: number; reasons: string[] };
type Action = { title: string; actionType: string; impact: number };

type Dashboard = {
  greeting: string;
  priorities: Priority[];
  revenueOpportunities: RevenueOpportunity[];
  risks: Risk[];
  approvalsNeeded: Approval[];
  followUps: FollowUp[];
  contractsExpiring: ContractExpiring[];
  sponsorshipOpportunities: Sponsorship[];
  partnershipOpportunities: Partnership[];
  recommendedActions: Action[];
  potentialRevenue: number;
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '$0';
  return `$${Math.round(v).toLocaleString()}`;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#c0392b',
  warning: '#b8860b',
  info: '#2c7be5',
};

function expiryLabel(d: number | null): string {
  if (d === null) return 'No date';
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return 'Expires today';
  return `In ${d}d`;
}

export default function CooDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiGet<{ dashboard: Dashboard }>('/coo/dashboard');
      setData(res.dashboard ?? null);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const empty =
    !!data &&
    data.priorities.length === 0 &&
    data.revenueOpportunities.length === 0 &&
    data.risks.length === 0 &&
    data.approvalsNeeded.length === 0 &&
    data.followUps.length === 0 &&
    data.contractsExpiring.length === 0 &&
    data.sponsorshipOpportunities.length === 0 &&
    data.partnershipOpportunities.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI COO Dashboard</h1>
          <div className="sub">{data?.greeting ?? 'Your executive command center'}</div>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Working...' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
        <div className="card metric">
          <div className="k">Potential revenue</div>
          <div className="v">{loading ? '-' : money(data?.potentialRevenue)}</div>
          <div className="d">identified by the engines</div>
        </div>
        <div className="card metric">
          <div className="k">Open risks</div>
          <div className="v">{loading ? '-' : data?.risks.length ?? 0}</div>
          <div className="d">across your events</div>
        </div>
        <div className="card metric">
          <div className="k">Priorities today</div>
          <div className="v">{loading ? '-' : data?.priorities.length ?? 0}</div>
          <div className="d">ranked by impact</div>
        </div>
      </div>

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading your executive dashboard...</p></div>
      ) : empty ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.6 }}>
            Nothing to surface yet. As your venues, events, quotes, contracts, and
            sponsorships accumulate, the AI COO will surface revenue opportunities,
            risks, approvals, and recommended actions here automatically.
          </p>
        </div>
      ) : (
        <>
          {data && data.priorities.length > 0 && (
            <>
              <div className="sectitle">Today&apos;s priorities</div>
              <div className="grid cards2" style={{ marginBottom: 16 }}>
                {data.priorities.slice(0, 8).map((p, i) => (
                  <div className="card" key={`pri-${i}`}>
                    <div className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                      {p.category.replace(/_/g, ' ')} - impact {p.impact}
                    </div>
                    <h3 style={{ margin: '6px 0 0' }}>{p.title}</h3>
                    {p.detail && <p className="note" style={{ margin: '6px 0 0' }}>{p.detail}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.revenueOpportunities.length > 0 && (
            <>
              <div className="sectitle">Revenue opportunities</div>
              <div className="card" style={{ marginBottom: 16 }}>
                {data.revenueOpportunities.slice(0, 12).map((o, i) => (
                  <div
                    key={`rev-${i}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < data.revenueOpportunities.length - 1 ? '1px solid #eee' : 'none' }}
                  >
                    <span>{o.title}</span>
                    <strong>{money(o.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.risks.length > 0 && (
            <>
              <div className="sectitle">Risks</div>
              <div className="grid cards2" style={{ marginBottom: 16 }}>
                {data.risks.slice(0, 10).map((r, i) => (
                  <div className="card" key={`risk-${i}`} style={{ borderLeft: `4px solid ${SEV_COLOR[r.severity] ?? '#999'}` }}>
                    <div className="note" style={{ textTransform: 'uppercase', fontSize: 11, color: SEV_COLOR[r.severity] }}>{r.severity}</div>
                    <h3 style={{ margin: '6px 0 0' }}>{r.title}</h3>
                    {r.recommendation && <p className="note" style={{ margin: '6px 0 0' }}>{r.recommendation}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {data && (data.approvalsNeeded.length > 0 || data.followUps.length > 0) && (
            <>
              <div className="sectitle">Approvals &amp; follow-ups</div>
              <div className="grid cards2" style={{ marginBottom: 16 }}>
                {data.approvalsNeeded.map((a, i) => (
                  <div className="card" key={`appr-${i}`}>
                    <div className="note" style={{ textTransform: 'uppercase', fontSize: 11 }}>Approval needed</div>
                    <h3 style={{ margin: '6px 0 0' }}>{a.title} ({a.count})</h3>
                  </div>
                ))}
                {data.followUps.map((f, i) => (
                  <div className="card" key={`fu-${i}`}>
                    <div className="note" style={{ textTransform: 'uppercase', fontSize: 11 }}>Follow up</div>
                    <h3 style={{ margin: '6px 0 0' }}>{f.title}</h3>
                    {f.detail && <p className="note" style={{ margin: '6px 0 0' }}>{f.detail}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.contractsExpiring.length > 0 && (
            <>
              <div className="sectitle">Contracts expiring</div>
              <div className="card" style={{ marginBottom: 16 }}>
                {data.contractsExpiring.map((c, i) => (
                  <div
                    key={`con-${i}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < data.contractsExpiring.length - 1 ? '1px solid #eee' : 'none' }}
                  >
                    <span>{c.title}</span>
                    <strong>{expiryLabel(c.daysUntil)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.sponsorshipOpportunities.length > 0 && (
            <>
              <div className="sectitle">Sponsorship opportunities</div>
              <div className="card" style={{ marginBottom: 16 }}>
                {data.sponsorshipOpportunities.slice(0, 12).map((s, i) => (
                  <div
                    key={`spo-${i}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < data.sponsorshipOpportunities.length - 1 ? '1px solid #eee' : 'none' }}
                  >
                    <span>{s.title}</span>
                    <strong>{money(s.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.partnershipOpportunities.length > 0 && (
            <>
              <div className="sectitle">Partnership opportunities</div>
              <div className="grid cards2" style={{ marginBottom: 16 }}>
                {data.partnershipOpportunities.slice(0, 8).map((p, i) => (
                  <div className="card" key={`par-${i}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h3 style={{ margin: 0 }}>{p.title}</h3>
                      <span style={{ fontWeight: 700 }}>{p.score}</span>
                    </div>
                    {p.reasons.length > 0 && (
                      <p className="note" style={{ margin: '6px 0 0' }}>{p.reasons.slice(0, 2).join(' - ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {data && data.recommendedActions.length > 0 && (
            <>
              <div className="sectitle">Recommended actions</div>
              <div className="card">
                {data.recommendedActions.map((a, i) => (
                  <div
                    key={`act-${i}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: i < data.recommendedActions.length - 1 ? '1px solid #eee' : 'none' }}
                  >
                    <span>{a.title}</span>
                    <span className="note" style={{ textTransform: 'uppercase', fontSize: 11 }}>{a.actionType.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
