import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

/**
 * AuditLog (blueprint 42) - the audit trail viewer. Admin-only.
 * Reads GET /api/admin/audit with optional action filter. Shows actor, action,
 * object, summary, and timestamp, with a JSON diff drawer per entry.
 */
type Entry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  summary: string | null;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
};

export default function AuditLog() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = action ? `?action=${encodeURIComponent(action)}` : '';
      const r = await apiGet<{ entries: Entry[] }>(`/admin/audit${qs}`);
      setRows(r.entries);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiGet<{ actions: string[] }>('/admin/audit/actions').then((r) => setActions(r.actions)).catch(() => {});
  }, [isAdmin]);
  useEffect(() => { if (isAdmin) void load(); /* eslint-disable-next-line */ }, [isAdmin, action]);

  if (!isAdmin) {
    return <div className="al"><style>{AL_CSS}</style><p className="al-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="al">
      <style>{AL_CSS}</style>
      <header className="al-head">
        <div>
          <span className="al-kicker">Super Admin</span>
          <h1 className="al-title">Audit Trail</h1>
          <p className="al-sub">Every consequential platform action, newest first.</p>
        </div>
        <select className="al-filter" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </header>

      {err ? <p className="al-err">{err}</p> : null}

      {loading ? (
        <p className="al-muted">Loading audit entries...</p>
      ) : rows.length === 0 ? (
        <div className="al-empty"><p>No audit entries match this filter yet.</p></div>
      ) : (
        <div className="al-list">
          {rows.map((e) => (
            <div key={e.id} className="al-row">
              <div className="al-row-main" onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                <span className="al-action">{e.action}</span>
                <span className="al-obj">{e.object_type ?? '-'}{e.object_id ? <em>{e.object_id.slice(0, 8)}</em> : null}</span>
                <span className="al-summary">{e.summary ?? '-'}</span>
                <span className="al-actor">{e.actor_email ?? e.actor_id?.slice(0, 8) ?? 'system'}</span>
                <span className="al-time">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              {openId === e.id ? (
                <div className="al-diff">
                  <div>
                    <span className="al-diff-label">Previous</span>
                    <pre>{e.previous_value ? JSON.stringify(e.previous_value, null, 2) : 'none'}</pre>
                  </div>
                  <div>
                    <span className="al-diff-label">New</span>
                    <pre>{e.new_value ? JSON.stringify(e.new_value, null, 2) : 'none'}</pre>
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

const AL_CSS = `
.al {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.al *, .al *::before, .al *::after { box-sizing: border-box; }
.al h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.al-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.al-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.al-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.al-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.al-filter { font: inherit; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; max-width: 260px; }
.al-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.al-muted { color: var(--dp-muted); font-size: 13px; }
.al-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.al-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.al-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.al-list { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.al-row { border-bottom: 1px solid var(--dp-line); }
.al-row:last-child { border-bottom: 0; }
.al-row-main { display: grid; grid-template-columns: 1.4fr 1.1fr 1.8fr 1.2fr 1.2fr; gap: 10px; align-items: center; padding: 10px 14px; font-size: 12.5px; cursor: pointer; }
.al-row-main:hover { background: rgba(18,60,46,.03); }
.al-action { font-weight: 600; color: var(--dp-emerald-2); font-family: 'Inter', monospace; }
.al-obj { color: var(--dp-ink); text-transform: capitalize; }
.al-obj em { font-style: normal; color: var(--dp-muted); margin-left: 6px; font-size: 11px; }
.al-summary { color: var(--dp-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.al-actor { color: var(--dp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.al-time { color: var(--dp-muted); white-space: nowrap; font-size: 11.5px; }
.al-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 14px 14px; }
.al-diff-label { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.al-diff pre { margin: 4px 0 0; background: rgba(18,60,46,.04); border: 1px solid var(--dp-line); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 220px; color: var(--dp-ink); }
@media (max-width: 900px) { .al-row-main { grid-template-columns: 1fr 1fr; } .al-summary, .al-time { grid-column: span 2; } .al-diff { grid-template-columns: 1fr; } }
`;
