import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api';

/**
 * Bid board - the role/tier bid marketplace. Lists posted bids with the
 * tier-access window decision visualized per bid (whether the signed-in org may
 * act, and why), plus category / rush filters and a detail panel.
 */
type Bid = {
  id: string;
  event_id: string;
  category: string | null;
  scope: string | null;
  budget_min: string | null;
  budget_max: string | null;
  deadline: string | null;
  tier_access: string | null;
  bid_type: string | null;
  rush: boolean;
  status: string | null;
  posted_at: string | null;
  created_at: string;
  access: { allowed: boolean; reason: string };
};

function budget(b: Bid): string {
  const lo = b.budget_min != null ? `$${Number(b.budget_min).toLocaleString()}` : null;
  const hi = b.budget_max != null ? `$${Number(b.budget_max).toLocaleString()}` : null;
  if (lo && hi) return `${lo} to ${hi}`;
  return lo ?? hi ?? 'Open budget';
}

export default function BidBoard() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Bid[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [rushOnly, setRushOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (rushOnly) params.set('rush', 'true');
      const qs = params.toString();
      const r = await apiGet<{ bids: Bid[] }>(`/bids${qs ? `?${qs}` : ''}`);
      setRows(r.bids);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [category, rushOnly]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((b) => b.category).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const open = rows.find((b) => b.id === openId) ?? null;

  return (
    <div className="bb">
      <style>{BB_CSS}</style>

      <header className="bb-head">
        <div>
          <span className="bb-kicker">Marketplace</span>
          <h1 className="bb-title">Bid Board</h1>
          <p className="bb-sub">Open event requests, gated by tier-access windows.</p>
        </div>
      </header>

      <div className="bb-legend">
        <span><i className="bb-dot premier" /> Premier 0 to 48h</span>
        <span><i className="bb-dot partner" /> Partner adds at 48h</span>
        <span><i className="bb-dot free" /> All tiers after 7 days</span>
        <span><i className="bb-dot private" /> Private invite only</span>
      </div>

      <div className="bb-filters">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="bb-rush"><input type="checkbox" checked={rushOnly} onChange={(e) => setRushOnly(e.target.checked)} /> Rush only</label>
      </div>

      {err ? <p className="bb-error">{err}</p> : null}

      {loading ? (
        <p className="bb-muted">Loading bids...</p>
      ) : rows.length === 0 ? (
        <div className="bb-empty"><p>No open bids match your filters right now.</p></div>
      ) : (
        <div className="bb-grid">
          {rows.map((b) => (
            <div key={b.id} className={`bb-card${b.access.allowed ? '' : ' is-locked'}`}>
              <div className="bb-card-top">
                <span className="bb-cat">{b.category ?? 'General'}</span>
                <span className={`bb-tier tier-${b.tier_access ?? 'public'}`}>{b.tier_access ?? 'public'}</span>
                {b.rush ? <span className="bb-tier rush">Rush</span> : null}
              </div>
              <p className="bb-scope">{b.scope ?? 'No scope provided.'}</p>
              <div className="bb-meta">
                <span>{budget(b)}</span>
                {b.deadline ? <span>Due {new Date(b.deadline).toLocaleDateString()}</span> : null}
              </div>
              <div className={`bb-access${b.access.allowed ? ' ok' : ' no'}`}>
                <span className="bb-access-icon" aria-hidden="true">{b.access.allowed ? '+' : 'x'}</span>
                <span>{b.access.reason}</span>
              </div>
              <div className="bb-actions">
                <button type="button" className="bb-btn ghost" onClick={() => setOpenId(b.id)}>View detail</button>
                <button type="button" className="bb-btn" onClick={() => nav(`/quotes/auto/${b.id}`)}>Generate quote</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="bb-modal" role="dialog" aria-modal="true">
          <div className="bb-modal-card">
            <div className="bb-modal-head">
              <h2>{open.category ?? 'General'} bid</h2>
              <button type="button" className="bb-close" onClick={() => setOpenId(null)}>Close</button>
            </div>
            <div className="bb-modal-tags">
              <span className={`bb-tier tier-${open.tier_access ?? 'public'}`}>{open.tier_access ?? 'public'}</span>
              {open.bid_type ? <span className="bb-tier">{open.bid_type}</span> : null}
              {open.rush ? <span className="bb-tier rush">Rush</span> : null}
              <span className="bb-tier">{open.status}</span>
            </div>
            <p className="bb-modal-scope">{open.scope ?? 'No scope provided.'}</p>
            <dl className="bb-modal-dl">
              <div><dt>Budget</dt><dd>{budget(open)}</dd></div>
              <div><dt>Deadline</dt><dd>{open.deadline ? new Date(open.deadline).toLocaleString() : 'None set'}</dd></div>
              <div><dt>Posted</dt><dd>{new Date(open.posted_at ?? open.created_at).toLocaleString()}</dd></div>
            </dl>
            <div className={`bb-access${open.access.allowed ? ' ok' : ' no'}`}>
              <span className="bb-access-icon" aria-hidden="true">{open.access.allowed ? '+' : 'x'}</span>
              <span>{open.access.reason}</span>
            </div>
            <div className="bb-modal-actions">
              <button type="button" className="bb-btn" onClick={() => nav(`/quotes/auto/${open.id}`)}>Generate quote</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const BB_CSS = `
.bb {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
  background: var(--dp-ivory); min-height: 100vh; padding: 28px 30px 60px; max-width: 1120px; margin: 0 auto;
}
.bb *, .bb *::before, .bb *::after { box-sizing: border-box; }
.bb h1, .bb h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.bb-head { margin-bottom: 16px; }
.bb-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.bb-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.bb-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.bb-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 11.5px; color: var(--dp-muted); margin-bottom: 16px; }
.bb-legend span { display: inline-flex; align-items: center; gap: 6px; }
.bb-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.bb-dot.premier { background: #C9A35B; }
.bb-dot.partner { background: #1E5D4A; }
.bb-dot.free { background: #9aa79f; }
.bb-dot.private { background: #a86b6b; }
.bb-filters { display: flex; gap: 12px; align-items: center; margin-bottom: 18px; }
.bb-filters select { font: inherit; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; }
.bb-rush { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dp-ink); }
.bb-error { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.bb-muted { color: var(--dp-muted); font-size: 13px; }
.bb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.bb-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 17px; display: flex; flex-direction: column; gap: 9px; }
.bb-card.is-locked { opacity: .82; }
.bb-card-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.bb-cat { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: var(--dp-emerald); margin-right: auto; }
.bb-scope { margin: 0; font-size: 13px; color: #4a463e; line-height: 1.5; }
.bb-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--dp-muted); }
.bb-tier { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.bb-tier.tier-premier { background: rgba(201,163,91,.2); color: #8a6d27; border-color: rgba(201,163,91,.5); }
.bb-tier.tier-partner { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.bb-tier.tier-private { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.bb-tier.rush { background: #fbeede; color: #a8631a; border-color: #f0d2ac; }
.bb-access { display: flex; align-items: center; gap: 7px; font-size: 11.5px; border-radius: 8px; padding: 7px 10px; line-height: 1.4; }
.bb-access.ok { background: rgba(30,93,74,.08); color: #1E5D4A; }
.bb-access.no { background: rgba(168,107,107,.1); color: #8a4a4a; }
.bb-access-icon { width: 16px; height: 16px; flex: 0 0 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; color: #fff; }
.bb-access.ok .bb-access-icon { background: #1E5D4A; }
.bb-access.no .bb-access-icon { background: #a86b6b; }
.bb-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 12px; font-weight: 600; padding: 8px 14px; cursor: pointer; align-self: flex-start; }
.bb-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.bb-btn.ghost:hover { border-color: var(--dp-emerald); background: rgba(18,60,46,.04); }
.bb-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.bb-modal-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
.bb-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 40px; background: rgba(247,244,238,.55); text-align: center; }
.bb-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.bb-modal { position: fixed; inset: 0; background: rgba(18,30,24,.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.bb-modal-card { background: #fff; border-radius: 16px; max-width: 480px; width: 100%; padding: 24px; border: 1px solid var(--dp-line); max-height: 90vh; overflow-y: auto; }
.bb-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bb-modal-head h2 { font-size: 24px; color: var(--dp-emerald); }
.bb-close { background: transparent; border: 1px solid var(--dp-line); border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer; color: var(--dp-muted); }
.bb-modal-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.bb-modal-scope { font-size: 13.5px; color: #4a463e; line-height: 1.6; margin: 0 0 14px; }
.bb-modal-dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 14px; }
.bb-modal-dl div { display: flex; flex-direction: column; gap: 2px; }
.bb-modal-dl dt { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.bb-modal-dl dd { margin: 0; font-size: 12.5px; color: var(--dp-ink); }
@media (max-width: 560px) { .bb-modal-dl { grid-template-columns: 1fr; } }
`;
