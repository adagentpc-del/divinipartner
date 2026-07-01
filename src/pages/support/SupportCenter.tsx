import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * SupportCenter (blueprint 37) - open and track support tickets. All roles.
 * Reads/writes /api/support. Admins see every ticket and can change any status;
 * regular users see and manage their own.
 */
type Ticket = {
  id: string;
  subject: string | null;
  category: string | null;
  urgency: string | null;
  description: string | null;
  status: string | null;
  resolution: string | null;
  created_at: string;
};
type Meta = {
  statuses: { key: string; label: string }[];
  categories: string[];
  urgencies: string[];
};

export default function SupportCenter() {
  const { isAdmin } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('account');
  const [urgency, setUrgency] = useState('normal');
  const [description, setDescription] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ tickets: Ticket[] }>('/support');
      setRows(r.tickets);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => {
    apiGet<Meta>('/support/meta').then(setMeta).catch(() => {});
    void load();
  }, []);

  async function create() {
    if (!description.trim()) { setErr('Please describe the issue.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/support', { subject, category, urgency, description });
      setSubject(''); setDescription(''); setCreating(false);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      await apiSend('POST', `/support/${id}/status`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="sc">
      <style>{SC_CSS}</style>
      <header className="sc-head">
        <div>
          <span className="sc-kicker">Help Desk</span>
          <h1 className="sc-title">Support Center</h1>
          <p className="sc-sub">{isAdmin ? 'Every ticket across the platform.' : 'Open a ticket and track its progress.'}</p>
        </div>
        <button type="button" className="sc-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New ticket'}
        </button>
      </header>

      {err ? <p className="sc-err">{err}</p> : null}

      {creating ? (
        <div className="sc-form">
          <div className="sc-form-row">
            <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" /></label>
            <label>Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(meta?.categories ?? ['account', 'billing', 'technical', 'other']).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Urgency
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                {(meta?.urgencies ?? ['low', 'normal', 'high', 'urgent']).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <label className="sc-full">Description<textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is happening?" /></label>
          <div className="sc-form-actions">
            <button type="button" className="sc-btn" disabled={busy} onClick={create}>{busy ? 'Submitting...' : 'Submit ticket'}</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="sc-muted">Loading tickets...</p>
      ) : rows.length === 0 ? (
        <div className="sc-empty"><p>No tickets yet. Open one with the New ticket button.</p></div>
      ) : (
        <div className="sc-list">
          {rows.map((t) => (
            <div key={t.id} className="sc-card">
              <div className="sc-card-top">
                <span className="sc-subject">{t.subject || t.category || 'Ticket'}</span>
                <span className={`sc-badge st-${t.status ?? 'open'}`}>{t.status ?? 'open'}</span>
              </div>
              <div className="sc-meta">
                <span className="sc-cap">{t.category ?? 'general'}</span>
                <span className={`sc-urg u-${t.urgency ?? 'normal'}`}>{t.urgency ?? 'normal'}</span>
                <span>{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
              <p className="sc-desc">{t.description}</p>
              {t.resolution ? <p className="sc-res">Resolution: {t.resolution}</p> : null}
              <div className="sc-actions">
                {isAdmin ? (
                  (meta?.statuses ?? []).map((s) => (
                    <button key={s.key} type="button" className={`sc-pill${t.status === s.key ? ' is-active' : ''}`} disabled={busy} onClick={() => setStatus(t.id, s.key)}>{s.label}</button>
                  ))
                ) : (
                  t.status !== 'closed' ? <button type="button" className="sc-pill" disabled={busy} onClick={() => setStatus(t.id, 'closed')}>Close ticket</button> : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SC_CSS = `
.sc {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.sc *, .sc *::before, .sc *::after { box-sizing: border-box; }
.sc h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.sc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.sc-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.sc-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.sc-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.sc-muted { color: var(--dp-muted); font-size: 13px; }
.sc-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.sc-form { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px; margin-bottom: 18px; }
.sc-form-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
.sc label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; letter-spacing: .3px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.sc-full { margin-top: 12px; }
.sc input, .sc select, .sc textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; color: var(--dp-ink); text-transform: none; letter-spacing: normal; font-weight: 400; }
.sc textarea { resize: vertical; }
.sc-form-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.sc-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.sc-btn:hover { background: var(--dp-emerald-2); }
.sc-btn:disabled { opacity: .6; cursor: default; }
.sc-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.sc-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.sc-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.sc-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.sc-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sc-subject { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: var(--dp-emerald); }
.sc-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11.5px; color: var(--dp-muted); align-items: center; }
.sc-cap { text-transform: capitalize; }
.sc-badge { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.sc-badge.st-resolved, .sc-badge.st-closed { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.sc-urg { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: #eef0ee; color: #5a6b62; }
.sc-urg.u-high, .sc-urg.u-urgent { background: #fbeede; color: #a8631a; }
.sc-desc { margin: 0; font-size: 13px; color: #4a463e; line-height: 1.5; }
.sc-res { margin: 0; font-size: 12px; color: #1E5D4A; background: rgba(30,93,74,.07); border-radius: 8px; padding: 8px 10px; }
.sc-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.sc-pill { background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; font: inherit; font-size: 11.5px; padding: 4px 11px; cursor: pointer; color: var(--dp-ink); }
.sc-pill:hover { border-color: var(--dp-gold); }
.sc-pill.is-active { background: var(--dp-emerald); color: #fff; border-color: var(--dp-emerald); }
.sc-pill:disabled { opacity: .6; cursor: default; }
@media (max-width: 600px) { .sc-form-row { grid-template-columns: 1fr; } }
`;
