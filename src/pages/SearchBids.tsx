import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

/**
 * Search Bids: a search-box + category-chip view over the real Bid Board
 * data (server/src/db/bids.ts's listBoardBids(), Phase 3 -- deterministic
 * SQL, zero AI/LLM calls). Distinct from /bids (BidBoard.tsx, a
 * dropdown-filtered card grid with a detail modal): this page is a fast,
 * text-searchable table for scanning many open bids at once.
 *
 * Previously called two endpoints with no live backend at all (GET
 * /vendor-profiles/:id, GET /packages/open -- the latter fell through to the
 * org-scoped GET /packages/:id handler and 500'd trying to look up a package
 * literally named "open") and its row click navigated to /package/:id, which
 * was never a registered route either. Found during a full-app QA pass
 * (2026-08-03) and rebuilt against the real, already-shipping Bid Board
 * query instead of the abandoned buildings/packages data model it was
 * originally written against.
 */

type Bid = {
  id: string;
  category: string | null;
  scope: string | null;
  budget_min: string | null;
  budget_max: string | null;
  deadline: string | null;
  tier_access: string | null;
  rush: boolean;
  status: string | null;
  posted_at: string | null;
  created_at: string;
  access: { allowed: boolean; reason: string };
};

function budgetLabel(b: Bid): string {
  const lo = b.budget_min != null ? `$${Number(b.budget_min).toLocaleString()}` : null;
  const hi = b.budget_max != null ? `$${Number(b.budget_max).toLocaleString()}` : null;
  if (lo && hi) return `${lo} to ${hi}`;
  return lo ?? hi ?? 'Open budget';
}

export default function SearchBids() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<{ bids: Bid[] }>('/bids')
      .then((res) => { if (alive) { setRows(res.bids); setError(null); } })
      .catch((e) => { if (alive) { setError((e as Error).message); setRows([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean) as string[])).sort(),
    [rows],
  );

  function toggle(c: string) {
    setActive((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));
  }

  const filtered = rows.filter((r) => {
    if (active.length > 0 && !(r.category && active.includes(r.category))) return false;
    if (!q) return true;
    const hay = `${r.category ?? ''} ${r.scope ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="page-head"><div><h1>Search Bids</h1><div className="sub">Open bids matched to your services, gated by tier-access window</div></div></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Category, scope..." />
        </div>
        <div>{categories.map((c) => (
          <span key={c} className={'chip' + (active.includes(c) ? ' on' : '')} onClick={() => toggle(c)}>{c}</span>
        ))}</div>
      </div>
      {error && <p className="note" style={{ color: '#c0392b' }}>{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Category</th><th>Scope</th><th>Budget</th><th>Deadline</th><th>Access</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="note">Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={5} className="note">No open bids match yet. Buyers post bids here.</td></tr>
              : filtered.map((r) => (
                <tr
                  key={r.id}
                  className="row-click"
                  onClick={() => nav(r.access.allowed ? `/quotes/auto/${r.id}` : '/bids')}
                >
                  <td><strong>{r.category ?? 'General'}</strong></td>
                  <td>{r.scope ?? '-'}</td>
                  <td>{budgetLabel(r)}</td>
                  <td>{r.deadline ? new Date(r.deadline).toLocaleDateString() : '-'}</td>
                  <td>{r.access.allowed ? 'Open' : r.access.reason}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 8 }}>{filtered.length} matching bid{filtered.length !== 1 ? 's' : ''}.</div>
    </>
  );
}
