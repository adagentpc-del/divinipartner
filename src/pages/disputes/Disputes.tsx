import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Disputes (blueprint 32) - open and track disputes, refunds, cancellations.
 * Reads/writes /api/disputes. Admins resolve; parties open and respond.
 */
type Dispute = {
  id: string;
  kind: string | null;
  category: string | null;
  reason: string | null;
  amount: string | null;
  resolution: string | null;
  resolution_amount: string | null;
  status: string | null;
  created_at: string;
};
type Meta = {
  statuses: { key: string; label: string }[];
  kinds: string[];
  categories: string[];
};

function money(v: string | null): string {
  if (v == null) return '-';
  return `$${Number(v).toLocaleString()}`;
}

export default function Disputes() {
  const { isAdmin } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Dispute[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState('dispute');
  const [category, setCategory] = useState('quality');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ disputes: Dispute[] }>('/disputes');
      setRows(r.disputes);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => {
    apiGet<Meta>('/disputes/meta').then(setMeta).catch(() => {});
    void load();
  }, []);

  async function create() {
    if (!reason.trim()) { setErr('Please describe the reason.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/disputes', { kind, category, amount: amount ? Number(amount) : undefined, reason });
      setReason(''); setAmount(''); setCreating(false);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      await apiSend('POST', `/disputes/${id}/status`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="ds">
      <style>{DS_CSS}</style>
      <header className="ds-head">
        <div>
          <span className="ds-kicker">Resolution</span>
          <h1 className="ds-title">Disputes & Refunds</h1>
          <p className="ds-sub">{isAdmin ? 'Resolve disputes, refunds, and cancellations.' : 'Open a case and track its resolution.'}</p>
        </div>
        <button type="button" className="ds-btn" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Open a case'}</button>
      </header>

      {err ? <p className="ds-err">{err}</p> : null}

      {creating ? (
        <div className="ds-form">
          <div className="ds-form-row">
            <label>Type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {(meta?.kinds ?? ['dispute', 'refund', 'cancellation']).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label>Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(meta?.categories ?? ['quality', 'non_delivery', 'overcharge', 'other']).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Amount<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Optional" /></label>
          </div>
          <label className="ds-full">Reason<textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the issue." /></label>
          <div className="ds-form-actions">
            <button type="button" className="ds-btn" disabled={busy} onClick={create}>{busy ? 'Submitting...' : 'Open case'}</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="ds-muted">Loading cases...</p>
      ) : rows.length === 0 ? (
        <div className="ds-empty"><p>No disputes, refunds, or cancellations on record.</p></div>
      ) : (
        <div className="ds-list">
          {rows.map((d) => (
            <div key={d.id} className="ds-card">
              <div className="ds-card-top">
                <span className={`ds-kind k-${d.kind ?? 'dispute'}`}>{d.kind ?? 'dispute'}</span>
                <span className={`ds-badge st-${d.status ?? 'open'}`}>{d.status ?? 'open'}</span>
              </div>
              <div className="ds-meta">
                <span className="ds-cap">{d.category ?? 'general'}</span>
                <span>Amount {money(d.amount)}</span>
                <span>{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
              <p className="ds-reason">{d.reason}</p>
              {d.resolution ? <p className="ds-res">Resolution: {d.resolution}{d.resolution_amount ? ` (${money(d.resolution_amount)})` : ''}</p> : null}
              {isAdmin ? (
                <div className="ds-actions">
                  {(meta?.statuses ?? []).map((s) => (
                    <button key={s.key} type="button" className={`ds-pill${d.status === s.key ? ' is-active' : ''}`} disabled={busy} onClick={() => setStatus(d.id, s.key)}>{s.label}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DS_CSS = `
.ds {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.ds *, .ds *::before, .ds *::after { box-sizing: border-box; }
.ds h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ds-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.ds-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.ds-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.ds-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.ds-muted { color: var(--dp-muted); font-size: 13px; }
.ds-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.ds-form { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px; margin-bottom: 18px; }
.ds-form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.ds label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; letter-spacing: .3px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.ds-full { margin-top: 12px; }
.ds input, .ds select, .ds textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; color: var(--dp-ink); text-transform: none; letter-spacing: normal; font-weight: 400; }
.ds textarea { resize: vertical; }
.ds-form-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.ds-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.ds-btn:hover { background: var(--dp-emerald-2); }
.ds-btn:disabled { opacity: .6; cursor: default; }
.ds-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.ds-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.ds-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.ds-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.ds-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ds-kind { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: rgba(18,60,46,.08); color: var(--dp-emerald); }
.ds-kind.k-refund { background: rgba(201,163,91,.18); color: #8a6d27; }
.ds-kind.k-cancellation { background: #f3e9e9; color: #8a4a4a; }
.ds-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11.5px; color: var(--dp-muted); }
.ds-cap { text-transform: capitalize; }
.ds-badge { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.ds-badge.st-resolved, .ds-badge.st-refunded, .ds-badge.st-closed { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.ds-badge.st-denied, .ds-badge.st-escalated { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.ds-reason { margin: 0; font-size: 13px; color: #4a463e; line-height: 1.5; }
.ds-res { margin: 0; font-size: 12px; color: #1E5D4A; background: rgba(30,93,74,.07); border-radius: 8px; padding: 8px 10px; }
.ds-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.ds-pill { background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; font: inherit; font-size: 11.5px; padding: 4px 11px; cursor: pointer; color: var(--dp-ink); }
.ds-pill:hover { border-color: var(--dp-gold); }
.ds-pill.is-active { background: var(--dp-emerald); color: #fff; border-color: var(--dp-emerald); }
.ds-pill:disabled { opacity: .6; cursor: default; }
@media (max-width: 600px) { .ds-form-row { grid-template-columns: 1fr; } }
`;
