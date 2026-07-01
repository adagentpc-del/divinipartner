import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

/**
 * VisitorSignals - device fingerprint + IP visitor log viewer. Admin-only.
 *
 * Reads GET /api/signals (newest first) with an optional fingerprint filter for
 * dedupe/fraud drill-down. Shows time, IP, geo (if present, else blank), a short
 * fingerprint, path, and linked user/org. See the Privacy Policy for the
 * disclosure of this collection. Zero em dashes.
 */
type Signal = {
  id: string;
  fingerprint: string | null;
  ip: string | null;
  user_agent: string | null;
  accept_language: string | null;
  path: string | null;
  referrer: string | null;
  utm: Record<string, unknown> | null;
  user_id: string | null;
  organization_id: string | null;
  client_hints: Record<string, unknown> | null;
  geo?: string | null;
  created_at: string;
};

function short(s: string | null, n = 10): string {
  if (!s) return '-';
  return s.length > n ? s.slice(0, n) : s;
}

export default function VisitorSignals() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Signal[]>([]);
  const [fingerprint, setFingerprint] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = fingerprint.trim() ? `?fingerprint=${encodeURIComponent(fingerprint.trim())}` : '';
      const r = await apiGet<{ signals: Signal[] }>(`/signals${qs}`);
      setRows(r.signals);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="vs">
        <style>{VS_CSS}</style>
        <p className="vs-guard">This page is restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="vs">
      <style>{VS_CSS}</style>
      <header className="vs-head">
        <div>
          <span className="vs-kicker">Super Admin</span>
          <h1 className="vs-title">Visitor Signals</h1>
          <p className="vs-sub">
            Device fingerprint, IP, and usage signals for security, fraud prevention, and
            attribution. Newest first.
          </p>
        </div>
        <form
          className="vs-filterform"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            className="vs-filter"
            placeholder="Filter by fingerprint"
            value={fingerprint}
            onChange={(e) => setFingerprint(e.target.value)}
          />
          <button type="submit" className="vs-btn">
            Filter
          </button>
          {fingerprint ? (
            <button
              type="button"
              className="vs-btn ghost"
              onClick={() => {
                setFingerprint('');
                setTimeout(() => void load(), 0);
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
      </header>

      {err ? <p className="vs-err">{err}</p> : null}

      {loading ? (
        <p className="vs-muted">Loading visitor signals...</p>
      ) : rows.length === 0 ? (
        <div className="vs-empty">
          <p>No visitor signals captured yet.</p>
        </div>
      ) : (
        <div className="vs-list">
          <div className="vs-row vs-rowhead">
            <span>Time</span>
            <span>IP</span>
            <span>Geo</span>
            <span>Fingerprint</span>
            <span>Path</span>
            <span>User / Org</span>
          </div>
          {rows.map((s) => (
            <div key={s.id} className="vs-rowwrap">
              <div
                className="vs-row vs-rowbody"
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                <span className="vs-time">{new Date(s.created_at).toLocaleString()}</span>
                <span className="vs-ip">{s.ip ?? '-'}</span>
                <span className="vs-geo">{s.geo ?? ''}</span>
                <span className="vs-fp" title={s.fingerprint ?? ''}>
                  {short(s.fingerprint)}
                </span>
                <span className="vs-path" title={s.path ?? ''}>
                  {s.path ?? '-'}
                </span>
                <span className="vs-user">
                  {s.user_id ? (
                    <span className="vs-linked">
                      {short(s.user_id, 8)}
                      {s.organization_id ? <em>{short(s.organization_id, 8)}</em> : null}
                    </span>
                  ) : (
                    <span className="vs-anon">anonymous</span>
                  )}
                </span>
              </div>
              {openId === s.id ? (
                <div className="vs-detail">
                  <div>
                    <span className="vs-detail-label">User agent</span>
                    <pre>{s.user_agent ?? 'none'}</pre>
                  </div>
                  <div>
                    <span className="vs-detail-label">Accept language</span>
                    <pre>{s.accept_language ?? 'none'}</pre>
                  </div>
                  <div>
                    <span className="vs-detail-label">Referrer</span>
                    <pre>{s.referrer ?? 'none'}</pre>
                  </div>
                  <div>
                    <span className="vs-detail-label">UTM</span>
                    <pre>{s.utm ? JSON.stringify(s.utm, null, 2) : 'none'}</pre>
                  </div>
                  <div>
                    <span className="vs-detail-label">Client hints</span>
                    <pre>{s.client_hints ? JSON.stringify(s.client_hints, null, 2) : 'none'}</pre>
                  </div>
                  <div>
                    <span className="vs-detail-label">Fingerprint</span>
                    <pre>{s.fingerprint ?? 'none'}</pre>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const VS_CSS = `
.vs {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
  padding: 26px 30px 48px; max-width: 1180px; width: 100%; margin: 0 auto;
}
.vs *, .vs *::before, .vs *::after { box-sizing: border-box; }
.vs h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.vs-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.vs-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.vs-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.vs-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); max-width: 560px; }
.vs-filterform { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vs-filter { font: inherit; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; min-width: 220px; }
.vs-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 14px; border: 0; border-radius: 8px; background: var(--dp-emerald); color: #fff; cursor: pointer; }
.vs-btn:hover { background: var(--dp-emerald-2); }
.vs-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.vs-btn.ghost:hover { border-color: var(--dp-emerald); }
.vs-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.vs-muted { color: var(--dp-muted); font-size: 13px; }
.vs-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.vs-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.vs-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.vs-list { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.vs-rowwrap { border-bottom: 1px solid var(--dp-line); }
.vs-rowwrap:last-child { border-bottom: 0; }
.vs-row { display: grid; grid-template-columns: 1.3fr 1fr .8fr 1fr 1.4fr 1.1fr; gap: 10px; align-items: center; padding: 10px 14px; font-size: 12.5px; }
.vs-rowhead { background: rgba(18,60,46,.04); font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.vs-rowbody { cursor: pointer; }
.vs-rowbody:hover { background: rgba(18,60,46,.03); }
.vs-time { color: var(--dp-muted); white-space: nowrap; font-size: 11.5px; }
.vs-ip { color: var(--dp-ink); font-family: 'Inter', monospace; }
.vs-geo { color: var(--dp-muted); }
.vs-fp { color: var(--dp-emerald-2); font-family: 'Inter', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-path { color: var(--dp-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-linked { color: var(--dp-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-linked em { font-style: normal; color: var(--dp-muted); margin-left: 6px; font-size: 11px; }
.vs-anon { color: var(--dp-muted); font-style: italic; }
.vs-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 14px 14px; }
.vs-detail-label { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.vs-detail pre { margin: 4px 0 0; background: rgba(18,60,46,.04); border: 1px solid var(--dp-line); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 220px; color: var(--dp-ink); white-space: pre-wrap; word-break: break-all; }
@media (max-width: 900px) {
  .vs-row { grid-template-columns: 1fr 1fr; }
  .vs-geo, .vs-fp, .vs-path, .vs-user { grid-column: span 2; }
  .vs-detail { grid-template-columns: 1fr; }
}
`;
