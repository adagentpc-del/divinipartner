import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

// Phase 7 - Reusable next-best-action widget (blueprint 25). Fetches
// /api/intelligence/next-best-action and renders ranked action cards. The role
// dashboards embed this with no required props. Self-contained styles in the
// Divini Partners palette.

type Action = {
  key: string;
  title: string;
  cta: string;
  link: string;
  weight: number;
  reason: string;
};

type NbaResponse = { role: string; actions: Action[] };

export default function NextBestActions({
  limit = 4,
  title = 'Next best actions',
}: {
  limit?: number;
  title?: string;
}) {
  const nav = useNavigate();
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    apiGet<NbaResponse>('/intelligence/next-best-action')
      .then((r) => {
        if (!on) return;
        setActions(r.actions || []);
        setError(null);
      })
      .catch((e) => {
        if (on) setError((e as Error).message);
      })
      .finally(() => {
        if (on) setLoading(false);
      });
    return () => {
      on = false;
    };
  }, []);

  const shown = actions.slice(0, limit);

  return (
    <section className="nba">
      <style>{CSS}</style>
      <div className="nba-head">
        <span className="nba-kicker">Recommended for you</span>
        <span className="nba-title">{title}</span>
      </div>

      {loading ? (
        <div className="nba-skeleton">Reading your account.</div>
      ) : error ? (
        <div className="nba-empty">Could not load actions right now.</div>
      ) : shown.length === 0 ? (
        <div className="nba-empty">You are all caught up. Nothing needs attention.</div>
      ) : (
        <div className="nba-cards">
          {shown.map((a) => (
            <button key={a.key} type="button" className="nba-card" onClick={() => nav(a.link)}>
              <span className="nba-card-title">{a.title}</span>
              <span className="nba-card-reason">{a.reason}</span>
              <span className="nba-card-cta">{a.cta} &rarr;</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const CSS = `
.nba { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE;
  background:linear-gradient(120deg,var(--e),var(--e2)); color:var(--iv);
  border:1px solid rgba(201,163,91,.35); border-radius:16px; padding:18px 22px; margin-bottom:24px;
  font-family:'Inter',system-ui,sans-serif; }
.nba *,.nba *::before,.nba *::after { box-sizing:border-box; }
.nba-head { display:flex; flex-direction:column; gap:2px; margin-bottom:14px; }
.nba-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.nba-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:21px; }
.nba-skeleton,.nba-empty { font-size:13px; color:rgba(247,244,238,.8); padding:6px 0; }
.nba-cards { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.nba-card { display:flex; flex-direction:column; gap:5px; text-align:left; cursor:pointer;
  background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16); border-radius:12px;
  padding:13px 15px; color:var(--iv); font:inherit; transition:background .15s ease, border-color .15s ease; }
.nba-card:hover { background:rgba(201,163,91,.2); border-color:var(--g); }
.nba-card-title { font-size:13.5px; font-weight:600; line-height:1.3; }
.nba-card-reason { font-size:11.5px; color:rgba(247,244,238,.72); line-height:1.45; }
.nba-card-cta { font-size:11.5px; font-weight:600; color:var(--g); margin-top:2px; }
@media (max-width:760px){ .nba-cards { grid-template-columns:1fr; } }
`;
