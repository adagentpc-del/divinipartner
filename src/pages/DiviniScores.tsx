import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';
import { useAuth } from '../lib/auth';
import DiviniScoreBadge, { type DiviniEntityType } from './components/DiviniScoreBadge';

/**
 * Intelligence Moat - Feature 12 Divini Score overview page.
 *
 * The proprietary per-entity Divini Score, surfaced in one place. Two modes:
 *
 *   1. Lookup: pick an entity type (venue | vendor | planner | sponsor | client)
 *      and paste an entity id; the page fetches /api/divini-score/:type/:id and
 *      renders the full DiviniScoreBadge with its factor breakdown, plus a
 *      "Recompute" action (POST /:type/:id/recompute).
 *   2. Leaderboard (admins): the cached top scores from /api/divini-score, with a
 *      badge per row. Non-admins see only the lookup tool.
 *
 * The entity id is read from the URL (?type=&id=) and remembered there so a
 * refresh / shared link keeps the same view. All reads/writes go through the
 * org-scoped, IDOR-safe /divini-score API.
 */

const ENTITY_TYPES: DiviniEntityType[] = ['venue', 'vendor', 'planner', 'sponsor', 'client'];

type DiviniFactor = { key: string; label: string; weight: number; earned: number };
type DiviniComponents = { entity_type?: string; factors?: DiviniFactor[] };

type ScoreView = {
  entity_type: DiviniEntityType;
  entity_id: string;
  score: number | null;
  components: DiviniComponents | null;
  updated_at: string | null;
};

type LeaderRow = {
  id: string;
  entity_type: DiviniEntityType;
  entity_id: string;
  score: number;
  components: DiviniComponents | null;
  updated_at: string | null;
};

export default function DiviniScores() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();

  const urlType = (params.get('type') as DiviniEntityType) || 'venue';
  const urlId = params.get('id') || '';

  const [type, setType] = useState<DiviniEntityType>(
    ENTITY_TYPES.includes(urlType) ? urlType : 'venue',
  );
  const [id, setId] = useState(urlId);
  const [view, setView] = useState<ScoreView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [leaderType, setLeaderType] = useState<string>('');

  // Fetch a single entity's score from the URL params.
  useEffect(() => {
    if (!urlId) {
      setView(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<ScoreView>(`/divini-score/${urlType}/${urlId}`)
      .then((res) => {
        if (alive) setView(res);
      })
      .catch((e) => {
        if (alive) {
          setError((e as Error).message);
          setView(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [urlType, urlId]);

  // Admin leaderboard.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const qs = leaderType ? `?entityType=${leaderType}&limit=50` : '?limit=50';
    apiGet<{ scores: LeaderRow[] }>(`/divini-score${qs}`)
      .then((res) => {
        if (alive) setLeaders(res.scores || []);
      })
      .catch(() => {
        if (alive) setLeaders([]);
      });
    return () => {
      alive = false;
    };
  }, [isAdmin, leaderType, busy]);

  function lookup() {
    const next = new URLSearchParams(params);
    next.set('type', type);
    if (id.trim()) next.set('id', id.trim());
    else next.delete('id');
    setParams(next, { replace: true });
  }

  async function recompute() {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<ScoreView>(
        'POST',
        `/divini-score/${view.entity_type}/${view.entity_id}/recompute`,
      );
      setView(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openLeader(row: LeaderRow) {
    const next = new URLSearchParams();
    next.set('type', row.entity_type);
    next.set('id', row.entity_id);
    setParams(next, { replace: true });
    setType(row.entity_type);
    setId(row.entity_id);
  }

  return (
    <div className="dscores">
      <style>{CSS}</style>

      <header className="dscores-head">
        <h1>Divini Score</h1>
        <p className="dscores-sub">
          The proprietary trust and performance score for every venue, vendor,
          planner, sponsor, and client. Aggregated from readiness, compliance,
          reviews, revenue, on-time delivery, and more.
        </p>
      </header>

      <section className="dscores-card">
        <h2>Look up a score</h2>
        <div className="dscores-form">
          <label>
            <span>Entity type</span>
            <select value={type} onChange={(e) => setType(e.target.value as DiviniEntityType)}>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="dscores-grow">
            <span>Entity id</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="UUID of the venue / vendor / planner / sponsor / client"
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
            />
          </label>
          <button className="dscores-btn" onClick={lookup} disabled={!id.trim()}>
            Look up
          </button>
        </div>

        {loading && <p className="dscores-muted">Loading score.</p>}
        {error && <p className="dscores-error">{error}</p>}

        {view && view.score != null && (
          <div className="dscores-result">
            <DiviniScoreBadge
              entityType={view.entity_type}
              score={view.score}
              components={view.components}
              showBreakdown
              label={`Divini Score (${view.entity_type})`}
            />
            <div className="dscores-meta">
              <span className="dscores-muted">
                {view.updated_at
                  ? `Cached ${new Date(view.updated_at).toLocaleString()}`
                  : 'Not yet cached (computed live)'}
              </span>
              <button className="dscores-btn dscores-btn-ghost" onClick={recompute} disabled={busy}>
                {busy ? 'Recomputing.' : 'Recompute'}
              </button>
            </div>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="dscores-card">
          <div className="dscores-leader-head">
            <h2>Leaderboard</h2>
            <select value={leaderType} onChange={(e) => setLeaderType(e.target.value)}>
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {leaders.length === 0 ? (
            <p className="dscores-muted">No cached scores yet. Recompute an entity to populate.</p>
          ) : (
            <table className="dscores-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity id</th>
                  <th>Score</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((row) => (
                  <tr key={row.id}>
                    <td className="dscores-type">{row.entity_type}</td>
                    <td className="dscores-mono">{row.entity_id}</td>
                    <td>
                      <DiviniScoreBadge score={row.score} compact label="" />
                    </td>
                    <td className="dscores-muted">
                      {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <button className="dscores-link" onClick={() => openLeader(row)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

const CSS = `
.dscores { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; margin:0 auto;
  padding:24px 20px 56px; }
.dscores *,.dscores *::before,.dscores *::after { box-sizing:border-box; }
.dscores-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.dscores-sub { font-size:14px; color:var(--mut); margin:0 0 8px; max-width:660px; line-height:1.5; }
.dscores-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px;
  margin-top:18px; }
.dscores-card h2 { font-size:15px; margin:0 0 14px; color:var(--e); font-weight:700; }
.dscores-form { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.dscores-form label { display:flex; flex-direction:column; gap:4px; font-size:11px;
  letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.dscores-grow { flex:1; min-width:260px; }
.dscores-form select, .dscores-form input { font-size:14px; padding:9px 11px; border:1px solid var(--ln);
  border-radius:9px; background:var(--bg); color:var(--ink); font-family:inherit; }
.dscores-form input { width:100%; }
.dscores-btn { font-size:13px; font-weight:700; padding:10px 18px; border-radius:9px; border:none;
  background:var(--e2); color:#fff; cursor:pointer; }
.dscores-btn:disabled { opacity:.5; cursor:not-allowed; }
.dscores-btn-ghost { background:transparent; color:var(--e2); border:1px solid var(--e2); }
.dscores-result { margin-top:18px; padding-top:16px; border-top:1px dashed var(--ln); }
.dscores-meta { display:flex; align-items:center; gap:14px; margin-top:14px; flex-wrap:wrap; }
.dscores-muted { font-size:12px; color:var(--mut); }
.dscores-error { font-size:13px; color:#9a3a28; margin-top:10px; }
.dscores-leader-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.dscores-leader-head select { font-size:13px; padding:7px 10px; border:1px solid var(--ln);
  border-radius:8px; background:var(--bg); color:var(--ink); font-family:inherit; }
.dscores-table { width:100%; border-collapse:collapse; margin-top:14px; font-size:13px; }
.dscores-table th { text-align:left; font-size:10px; letter-spacing:.6px; text-transform:uppercase;
  color:var(--mut); padding:6px 10px; border-bottom:1px solid var(--ln); }
.dscores-table td { padding:9px 10px; border-bottom:1px solid #f1ece2; vertical-align:middle; }
.dscores-type { text-transform:capitalize; font-weight:600; }
.dscores-mono { font-family:ui-monospace,monospace; font-size:11.5px; color:var(--mut); }
.dscores-link { background:none; border:none; color:var(--e2); font-weight:700; cursor:pointer;
  font-size:13px; padding:0; }
`;
