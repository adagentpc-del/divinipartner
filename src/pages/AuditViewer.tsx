import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiBlob } from '../lib/api';

/**
 * AuditViewer (Module 6) - searchable / filterable audit trail. SUPER-ADMIN.
 * Reads GET /api/audit-log with action / object-type / actor / date-range /
 * free-text filters, paginated. Export button downloads the filtered log as CSV
 * via GET /api/audit-log/export?format=csv. Read-only: audit history is immutable.
 *
 * Route: /admin/audit-log (SuperAdmin).
 */
type Entry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string | null;
  object_type: string | null;
  object_id: string | null;
  summary: string | null;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
};

const PAGE = 50;

export default function AuditViewer() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [objectTypes, setObjectTypes] = useState<string[]>([]);
  const [action, setAction] = useState('');
  const [objectType, setObjectType] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function qs(extra: Record<string, string | number> = {}): string {
    const p = new URLSearchParams();
    if (action) p.set('action', action);
    if (objectType) p.set('objectType', objectType);
    if (search) p.set('q', search);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ entries: Entry[]; total: number }>(
        `/audit-log${qs({ limit: PAGE, offset })}`,
      );
      setRows(r.entries);
      setTotal(r.total);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiGet<{ actions: string[]; object_types: string[] }>('/audit-log/meta')
      .then((r) => { setActions(r.actions); setObjectTypes(r.object_types); })
      .catch(() => {});
  }, [isAdmin]);
  useEffect(() => { setOffset(0); }, [action, objectType, search, from, to]);
  useEffect(() => { if (isAdmin) void load(); /* eslint-disable-next-line */ }, [isAdmin, action, objectType, search, from, to, offset]);

  async function exportCsv() {
    try {
      const blob = await apiBlob(`/audit-log/export${qs({ format: 'csv' })}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr((e as Error).message); }
  }

  if (!isAdmin) {
    return <div className="av"><style>{AV_CSS}</style><p className="av-guard">This page is restricted to platform administrators.</p></div>;
  }

  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="av">
      <style>{AV_CSS}</style>
      <header className="av-head">
        <div>
          <span className="av-kicker">Super Admin</span>
          <h1 className="av-title">Audit Viewer</h1>
          <p className="av-sub">Immutable record of every consequential platform action.</p>
        </div>
        <button type="button" className="av-btn" onClick={exportCsv}>Export CSV</button>
      </header>

      <div className="av-filters">
        <input className="av-input" placeholder="Search action, summary, actor" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="av-input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="av-input" value={objectType} onChange={(e) => setObjectType(e.target.value)}>
          <option value="">All object types</option>
          {objectTypes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="av-date">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="av-date">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {err ? <p className="av-err">{err}</p> : null}

      {loading ? (
        <p className="av-muted">Loading audit entries...</p>
      ) : rows.length === 0 ? (
        <div className="av-empty"><p>No audit entries match these filters.</p></div>
      ) : (
        <>
          <div className="av-list">
            {rows.map((e) => (
              <div key={e.id} className="av-row">
                <div className="av-row-main" onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                  <span className="av-action">{e.action}</span>
                  <span className="av-obj">{e.object_type ?? '-'}{e.object_id ? <em>{e.object_id.slice(0, 8)}</em> : null}</span>
                  <span className="av-summary">{e.summary ?? '-'}</span>
                  <span className="av-actor">{e.actor_email ?? e.actor_id?.slice(0, 8) ?? 'system'}</span>
                  <span className="av-time">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {openId === e.id ? (
                  <div className="av-diff">
                    <div>
                      <span className="av-diff-label">Previous</span>
                      <pre>{e.previous_value ? JSON.stringify(e.previous_value, null, 2) : 'none'}</pre>
                    </div>
                    <div>
                      <span className="av-diff-label">New</span>
                      <pre>{e.new_value ? JSON.stringify(e.new_value, null, 2) : 'none'}</pre>
                    </div>
                    <div className="av-meta">IP: {e.ip_address ?? '-'}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="av-pager">
            <button type="button" className="av-btn ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <span className="av-pageinfo">Page {page} of {pages} ({total} entries)</span>
            <button type="button" className="av-btn ghost" disabled={page >= pages} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}

const AV_CSS = `
.av {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.av *, .av *::before, .av *::after { box-sizing: border-box; }
.av h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.av-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.av-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.av-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.av-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.av-filters { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 16px; }
.av-input { font: inherit; padding: 8px 11px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; font-size: 12.5px; }
.av-date { display: flex; flex-direction: column; font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: var(--dp-muted); gap: 2px; }
.av-date input { font: inherit; padding: 6px 9px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; font-size: 12px; }
.av-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.av-muted { color: var(--dp-muted); font-size: 13px; }
.av-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.av-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.av-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.av-list { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.av-row { border-bottom: 1px solid var(--dp-line); }
.av-row:last-child { border-bottom: 0; }
.av-row-main { display: grid; grid-template-columns: 1.4fr 1.1fr 1.8fr 1.2fr 1.2fr; gap: 10px; align-items: center; padding: 10px 14px; font-size: 12.5px; cursor: pointer; }
.av-row-main:hover { background: rgba(18,60,46,.03); }
.av-action { font-weight: 600; color: var(--dp-emerald-2); }
.av-obj { text-transform: capitalize; }
.av-obj em { font-style: normal; color: var(--dp-muted); margin-left: 6px; font-size: 11px; }
.av-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.av-actor { color: var(--dp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.av-time { color: var(--dp-muted); white-space: nowrap; font-size: 11.5px; }
.av-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 14px 14px; }
.av-diff-label { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.av-diff pre { margin: 4px 0 0; background: rgba(18,60,46,.04); border: 1px solid var(--dp-line); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 220px; }
.av-meta { grid-column: span 2; font-size: 11px; color: var(--dp-muted); }
.av-pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px; }
.av-pageinfo { font-size: 12px; color: var(--dp-muted); }
.av-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 16px; cursor: pointer; }
.av-btn:hover { background: var(--dp-emerald-2); }
.av-btn:disabled { opacity: .5; cursor: default; }
.av-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
@media (max-width: 900px) { .av-row-main { grid-template-columns: 1fr 1fr; } .av-summary, .av-time { grid-column: span 2; } .av-diff { grid-template-columns: 1fr; } }
`;
