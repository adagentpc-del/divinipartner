import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

/**
 * AdminIntelligence (blueprint 44) - the Super Admin metrics dashboard.
 * Admin-only: reads GET /api/admin/metrics. Renders money, marketplace, account
 * health, attention queues, and demand / leader boards. All numbers are real
 * aggregates returned by the backend.
 */
type Metrics = {
  generated_at: string;
  money: { gmv: number; platform_fee_revenue: number; mrr: number; paid_invoices: number };
  marketplace: { bid_volume: number; quotes_submitted: number; quotes_accepted: number; quote_conversion_rate: number };
  accounts: {
    total: number;
    by_tier: { tier: string; count: number }[];
    incomplete_onboarding: number;
    churn_risk: number;
    upgrade_opportunities: number;
    white_label_candidates: number;
  };
  attention: { open_disputes: number; open_tickets: number; pending_verification: number };
  top_vendors: { organization_id: string; name: string; quotes: number; volume: number }[];
  top_venues: { venue_id: string; name: string; events: number }[];
  category_demand: { category: string; bids: number }[];
  geo_demand: { region: string; events: number }[];
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function AdminIntelligence() {
  const { isAdmin } = useAuth();
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiGet<{ metrics: Metrics }>('/admin/metrics')
      .then((r) => setM(r.metrics))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="ai"><style>{AI_CSS}</style><p className="ai-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="ai">
      <style>{AI_CSS}</style>
      <header className="ai-head">
        <span className="ai-kicker">Super Admin</span>
        <h1 className="ai-title">Platform Intelligence</h1>
        <p className="ai-sub">Live marketplace health, money, and the actions that need attention.</p>
      </header>

      {loading ? <p className="ai-muted">Loading metrics...</p> : null}
      {err ? <p className="ai-err">{err}</p> : null}

      {m ? (
        <>
          <div className="ai-stats">
            <Stat k="Gross merchandise value" v={money(m.money.gmv)} d="across all invoices" />
            <Stat k="Platform fee revenue" v={money(m.money.platform_fee_revenue)} d="earned in fees" />
            <Stat k="MRR" v={money(m.money.mrr)} d="recurring subscription value" />
            <Stat k="Paid invoices" v={String(m.money.paid_invoices)} d="settled on platform" />
          </div>

          <div className="ai-stats">
            <Stat k="Bid volume" v={String(m.marketplace.bid_volume)} d="bids posted" />
            <Stat k="Quote conversion" v={`${m.marketplace.quote_conversion_rate}%`} d={`${m.marketplace.quotes_accepted} of ${m.marketplace.quotes_submitted} accepted`} />
            <Stat k="Total accounts" v={String(m.accounts.total)} d="organizations" />
            <Stat k="White-label candidates" v={String(m.accounts.white_label_candidates)} d="high-fit partners" />
          </div>

          <div className="ai-sectiontitle">Needs attention</div>
          <div className="ai-stats">
            <Stat k="Open disputes" v={String(m.attention.open_disputes)} d="unresolved" alert={m.attention.open_disputes > 0} />
            <Stat k="Open tickets" v={String(m.attention.open_tickets)} d="awaiting support" alert={m.attention.open_tickets > 0} />
            <Stat k="Pending verification" v={String(m.attention.pending_verification)} d="accounts in queue" alert={m.attention.pending_verification > 0} />
            <Stat k="Incomplete onboarding" v={String(m.accounts.incomplete_onboarding)} d="users / draft orgs" />
          </div>

          <div className="ai-stats">
            <Stat k="Churn risk" v={String(m.accounts.churn_risk)} d="paid orgs idle 90 days" alert={m.accounts.churn_risk > 0} />
            <Stat k="Upgrade opportunities" v={String(m.accounts.upgrade_opportunities)} d="engaged free partners" />
          </div>

          <div className="ai-grid">
            <Board title="Top vendors" rows={m.top_vendors.map((v) => ({ label: v.name, meta: `${v.quotes} quotes`, value: money(v.volume) }))} empty="No vendor activity yet." />
            <Board title="Top venues" rows={m.top_venues.map((v) => ({ label: v.name, meta: '', value: `${v.events} events` }))} empty="No venue activity yet." />
            <Board title="Category demand" rows={m.category_demand.map((c) => ({ label: c.category, meta: '', value: `${c.bids} bids` }))} empty="No demand signals yet." />
            <Board title="Geographic demand" rows={m.geo_demand.map((g) => ({ label: g.region, meta: '', value: `${g.events} events` }))} empty="No regional data yet." />
          </div>

          <div className="ai-tierline">
            <span className="ai-tierhead">Accounts by tier</span>
            {m.accounts.by_tier.map((t) => (
              <span key={t.tier} className="ai-pill">{t.tier}<b>{t.count}</b></span>
            ))}
          </div>

          <p className="ai-muted ai-gen">Generated {new Date(m.generated_at).toLocaleString()}</p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ k, v, d, alert }: { k: string; v: string; d: string; alert?: boolean }) {
  return (
    <div className={`ai-stat${alert ? ' is-alert' : ''}`}>
      <div className="ai-stat-k">{k}</div>
      <div className="ai-stat-v">{v}</div>
      <div className="ai-stat-d">{d}</div>
    </div>
  );
}

function Board({ title, rows, empty }: { title: string; rows: { label: string; meta: string; value: string }[]; empty: string }) {
  return (
    <div className="ai-board">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="ai-board-empty">{empty}</p>
      ) : (
        <ul className="ai-board-list">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="ai-board-rank">{i + 1}</span>
              <span className="ai-board-label">{r.label || 'Unnamed'}{r.meta ? <em>{r.meta}</em> : null}</span>
              <span className="ai-board-value">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AI_CSS = `
.ai {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.ai *, .ai *::before, .ai *::after { box-sizing: border-box; }
.ai h1, .ai h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ai-head { margin-bottom: 20px; }
.ai-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.ai-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.ai-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.ai-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.ai-muted { color: var(--dp-muted); font-size: 13px; }
.ai-gen { margin-top: 18px; }
.ai-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.ai-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.ai-stat { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px; }
.ai-stat.is-alert { border-color: rgba(168,107,107,.5); background: rgba(168,107,107,.06); }
.ai-stat-k { font-size: 11.5px; color: var(--dp-muted); letter-spacing: .3px; }
.ai-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; color: var(--dp-emerald); line-height: 1.05; margin: 4px 0 2px; }
.ai-stat.is-alert .ai-stat-v { color: #8a4a4a; }
.ai-stat-d { font-size: 11px; color: var(--dp-muted); }
.ai-sectiontitle { font-size: 15px; letter-spacing: .8px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; margin: 14px 0 10px; }
.ai-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 8px; }
.ai-board { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; }
.ai-board h3 { font-size: 19px; color: var(--dp-emerald); margin-bottom: 10px; }
.ai-board-empty { font-size: 12.5px; color: var(--dp-muted); margin: 0; }
.ai-board-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.ai-board-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.ai-board-rank { width: 20px; height: 20px; flex: 0 0 20px; border-radius: 6px; background: rgba(201,163,91,.18); color: var(--dp-emerald); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.ai-board-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-board-label em { color: var(--dp-muted); font-style: normal; font-size: 11.5px; margin-left: 6px; }
.ai-board-value { font-weight: 600; color: var(--dp-emerald-2); white-space: nowrap; }
.ai-tierline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; }
.ai-tierhead { font-size: 12px; color: var(--dp-muted); margin-right: 4px; }
.ai-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; text-transform: capitalize; color: var(--dp-emerald); background: rgba(18,60,46,.06); border: 1px solid var(--dp-line); border-radius: 999px; padding: 4px 11px; }
.ai-pill b { color: var(--dp-emerald-2); }
@media (max-width: 1024px) { .ai-stats { grid-template-columns: repeat(2, 1fr); } .ai-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .ai-stats { grid-template-columns: 1fr; } }
`;
