import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

/**
 * AdminPartners (Module 1) - super-admin management of revenue-share partners.
 * Create partners, edit ALL revenue-share settings (commission type, toggles,
 * subscription mode, custom %, dates, duration), and view per-partner referral
 * attribution and the profit-based commission ledger. Admin-only.
 */
type Partner = {
  id: string;
  name: string | null;
  company: string | null;
  partner_type: string | null;
  referral_code: string | null;
  referral_link: string | null;
  revenue_share_pct: number | string | null;
  commission_type: string | null;
  flat_fee_cents: number | string | null;
  applies_subscriptions: boolean | null;
  applies_transaction_fees: boolean | null;
  applies_setup_fees: boolean | null;
  applies_enterprise: boolean | null;
  subscription_mode: string | null;
  subscription_months: number | null;
  subscription_share_pct: number | string | null;
  effective_date: string | null;
  expiration_date: string | null;
  duration_kind: string | null;
  status: string | null;
  notes: string | null;
};
type Meta = {
  partner_types: string[];
  commission_types: string[];
  subscription_modes: string[];
  duration_kinds: string[];
  statuses: string[];
};
type ReferredRow = { org_name: string | null; org_type: string | null; attribution: string; referred_at: string };
type Commission = {
  id: string; source: string; net_profit_cents: number; share_pct: number;
  commission_cents: number; status: string; excluded: boolean; created_at: string;
};
type Totals = { pending_cents: number; approved_cents: number; paid_cents: number; earned_cents: number; count: number };
type Detail = { partner: Partner; referrals: ReferredRow[]; commissions: Commission[]; totals: Totals };

const money = (cents: number | string | null | undefined) =>
  `$${(Number(cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptySettings = (): Partial<Partner> => ({
  name: '', company: '', partner_type: 'strategic', revenue_share_pct: 0,
  commission_type: 'percentage', flat_fee_cents: 0,
  applies_subscriptions: true, applies_transaction_fees: true,
  applies_setup_fees: false, applies_enterprise: false,
  subscription_mode: 'include', subscription_months: null, subscription_share_pct: null,
  effective_date: null, expiration_date: null, duration_kind: 'lifetime', status: 'active', notes: '',
});

export default function AdminPartners() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Partner[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Partial<Partner> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [pl, m] = await Promise.all([
        apiGet<{ partners: Partner[] }>('/partners'),
        apiGet<Meta>('/partners/meta'),
      ]);
      setRows(pl.partners); setMeta(m);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { if (isAdmin) void load(); else setLoading(false); /* eslint-disable-next-line */ }, [isAdmin]);

  async function openDetail(id: string) {
    setErr(null);
    try { setDetail(await apiGet<Detail>(`/partners/${id}`)); }
    catch (e) { setErr((e as Error).message); }
  }

  function startCreate() { setEditingId(null); setForm(emptySettings()); setDetail(null); }
  function startEdit(p: Partner) { setEditingId(p.id); setForm({ ...p }); setDetail(null); }

  async function save() {
    if (!form) return;
    setBusy(true); setErr(null);
    try {
      if (editingId) await apiSend('PATCH', `/partners/${editingId}`, form);
      else await apiSend('POST', '/partners', form);
      setForm(null); setEditingId(null);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function set<K extends keyof Partner>(k: K, v: Partner[K]) { setForm((f) => ({ ...(f ?? {}), [k]: v })); }

  if (!isAdmin) {
    return <div className="ap"><style>{AP_CSS}</style><p className="ap-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="ap">
      <style>{AP_CSS}</style>
      <header className="ap-head">
        <div>
          <span className="ap-kicker">Super Admin</span>
          <h1 className="ap-title">Partners</h1>
          <p className="ap-sub">Revenue-share partners, referral attribution, and profit-based commissions.</p>
        </div>
        <button type="button" className="ap-btn" onClick={startCreate}>New partner</button>
      </header>

      {err ? <p className="ap-err">{err}</p> : null}

      {loading ? (
        <p className="ap-muted">Loading partners...</p>
      ) : rows.length === 0 ? (
        <div className="ap-empty"><p>No partners yet. Create your first revenue-share partner.</p></div>
      ) : (
        <div className="ap-table">
          <div className="ap-tr ap-th">
            <span>Partner</span><span>Type</span><span>Code</span><span>Share</span><span>Status</span><span>Actions</span>
          </div>
          {rows.map((p) => (
            <div key={p.id} className="ap-tr">
              <span className="ap-name">{p.name || p.company || '(unnamed)'}<em className="ap-co">{p.company && p.name ? p.company : ''}</em></span>
              <span className="ap-cap">{(p.partner_type || '-').replace(/_/g, ' ')}</span>
              <span className="ap-code">{p.referral_code || '-'}</span>
              <span>{p.commission_type === 'flat' ? money(p.flat_fee_cents) : `${Number(p.revenue_share_pct ?? 0)}%`}</span>
              <span><span className={`ap-badge st-${p.status ?? 'active'}`}>{p.status ?? 'active'}</span></span>
              <span className="ap-actions">
                <button type="button" className="ap-btn sm" onClick={() => openDetail(p.id)}>View</button>
                <button type="button" className="ap-btn sm ghost" onClick={() => startEdit(p)}>Edit</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {form && meta ? (
        <div className="ap-card">
          <h2 className="ap-h2">{editingId ? 'Edit revenue-share settings' : 'New partner'}</h2>
          <div className="ap-grid">
            <label className="ap-field"><span>Name</span>
              <input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} /></label>
            <label className="ap-field"><span>Company</span>
              <input value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} /></label>
            <label className="ap-field"><span>Partner type</span>
              <select value={form.partner_type ?? ''} onChange={(e) => set('partner_type', e.target.value)}>
                {meta.partner_types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select></label>
            <label className="ap-field"><span>Commission type</span>
              <select value={form.commission_type ?? ''} onChange={(e) => set('commission_type', e.target.value)}>
                {meta.commission_types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select></label>
            <label className="ap-field"><span>Revenue share % (of profit)</span>
              <input type="number" step="0.01" value={Number(form.revenue_share_pct ?? 0)} onChange={(e) => set('revenue_share_pct', e.target.value as never)} /></label>
            <label className="ap-field"><span>Flat fee (cents)</span>
              <input type="number" value={Number(form.flat_fee_cents ?? 0)} onChange={(e) => set('flat_fee_cents', e.target.value as never)} /></label>
            <label className="ap-field"><span>Subscription mode</span>
              <select value={form.subscription_mode ?? 'include'} onChange={(e) => set('subscription_mode', e.target.value)}>
                {meta.subscription_modes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select></label>
            <label className="ap-field"><span>Subscription months (for first X)</span>
              <input type="number" value={form.subscription_months ?? ''} onChange={(e) => set('subscription_months', (e.target.value === '' ? null : Number(e.target.value)) as never)} /></label>
            <label className="ap-field"><span>Subscription share % (override)</span>
              <input type="number" step="0.01" value={form.subscription_share_pct == null ? '' : Number(form.subscription_share_pct)} onChange={(e) => set('subscription_share_pct', (e.target.value === '' ? null : Number(e.target.value)) as never)} /></label>
            <label className="ap-field"><span>Duration</span>
              <select value={form.duration_kind ?? 'lifetime'} onChange={(e) => set('duration_kind', e.target.value)}>
                {meta.duration_kinds.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></label>
            <label className="ap-field"><span>Effective date</span>
              <input type="date" value={(form.effective_date ?? '').slice(0, 10)} onChange={(e) => set('effective_date', (e.target.value || null) as never)} /></label>
            <label className="ap-field"><span>Expiration date</span>
              <input type="date" value={(form.expiration_date ?? '').slice(0, 10)} onChange={(e) => set('expiration_date', (e.target.value || null) as never)} /></label>
            <label className="ap-field"><span>Status</span>
              <select value={form.status ?? 'active'} onChange={(e) => set('status', e.target.value)}>
                {meta.statuses.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></label>
          </div>

          <div className="ap-toggles">
            {([
              ['applies_subscriptions', 'Applies to subscriptions'],
              ['applies_transaction_fees', 'Applies to transaction fees'],
              ['applies_setup_fees', 'Applies to setup fees'],
              ['applies_enterprise', 'Applies to enterprise'],
            ] as const).map(([k, label]) => (
              <label key={k} className="ap-toggle">
                <input type="checkbox" checked={!!form[k]} onChange={(e) => set(k, e.target.checked as never)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <label className="ap-field ap-wide"><span>Notes</span>
            <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>

          <div className="ap-formactions">
            <button type="button" className="ap-btn" disabled={busy} onClick={save}>{busy ? 'Saving...' : editingId ? 'Save settings' : 'Create partner'}</button>
            <button type="button" className="ap-btn ghost" disabled={busy} onClick={() => { setForm(null); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="ap-card">
          <div className="ap-detailhead">
            <div>
              <h2 className="ap-h2">{detail.partner.name || detail.partner.company || 'Partner'}</h2>
              <p className="ap-muted">Referral code <code>{detail.partner.referral_code}</code></p>
              {detail.partner.referral_link ? <p className="ap-link">{detail.partner.referral_link}</p> : null}
            </div>
            <button type="button" className="ap-btn ghost sm" onClick={() => setDetail(null)}>Close</button>
          </div>

          <div className="ap-stats">
            <div className="ap-stat"><span>Earned</span><strong>{money(detail.totals.earned_cents)}</strong></div>
            <div className="ap-stat"><span>Pending</span><strong>{money(detail.totals.pending_cents)}</strong></div>
            <div className="ap-stat"><span>Paid</span><strong>{money(detail.totals.paid_cents)}</strong></div>
            <div className="ap-stat"><span>Referrals</span><strong>{detail.referrals.length}</strong></div>
          </div>

          <h3 className="ap-h3">Referred accounts</h3>
          {detail.referrals.length === 0 ? <p className="ap-muted">No referred accounts yet.</p> : (
            <div className="ap-mini">
              {detail.referrals.map((r, i) => (
                <div key={i} className="ap-minirow">
                  <span>{r.org_name || r.attribution}</span>
                  <span className="ap-cap">{r.org_type || '-'}</span>
                  <span className="ap-badge">{r.attribution.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}

          <h3 className="ap-h3">Commission ledger (profit-based)</h3>
          {detail.commissions.length === 0 ? <p className="ap-muted">No commissions recorded yet.</p> : (
            <div className="ap-mini">
              <div className="ap-minirow ap-minihead"><span>Source</span><span>Net profit</span><span>Share</span><span>Commission</span><span>Status</span></div>
              {detail.commissions.map((c) => (
                <div key={c.id} className="ap-minirow">
                  <span className="ap-cap">{c.source.replace(/_/g, ' ')}</span>
                  <span>{money(c.net_profit_cents)}</span>
                  <span>{Number(c.share_pct)}%</span>
                  <span>{money(c.commission_cents)}</span>
                  <span><span className={`ap-badge st-${c.status}`}>{c.status}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const AP_CSS = `
.ap {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.ap *, .ap *::before, .ap *::after { box-sizing: border-box; }
.ap h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ap-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.ap-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.ap-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.ap-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.ap-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.ap-muted { color: var(--dp-muted); font-size: 13px; }
.ap-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.ap-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.ap-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.ap-table { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.ap-tr { display: grid; grid-template-columns: 2fr 1.2fr 1fr .9fr 1fr 1.6fr; gap: 10px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--dp-line); font-size: 13px; }
.ap-tr:last-child { border-bottom: 0; }
.ap-th { background: rgba(18,60,46,.04); font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.ap-name { font-weight: 600; color: var(--dp-emerald); display: flex; flex-direction: column; }
.ap-co { font-style: normal; font-size: 11px; color: var(--dp-muted); font-weight: 400; }
.ap-cap { text-transform: capitalize; }
.ap-code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--dp-ink); }
.ap-badge { font-size: 10px; letter-spacing: .4px; text-transform: capitalize; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; display: inline-block; }
.ap-badge.st-active, .ap-badge.st-paid, .ap-badge.st-approved { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.ap-badge.st-paused, .ap-badge.st-excluded { background: #f3efe6; color: #8a6d27; border-color: rgba(201,163,91,.4); }
.ap-badge.st-ended { background: #f3e9e9; color: #8a4a4a; border-color: #e2caca; }
.ap-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ap-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.ap-btn:hover { background: var(--dp-emerald-2); }
.ap-btn:disabled { opacity: .6; cursor: default; }
.ap-btn.sm { padding: 6px 12px; font-size: 12px; }
.ap-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.ap-card { margin-top: 18px; border: 1px solid var(--dp-line); border-radius: 14px; background: #fff; padding: 20px; }
.ap-h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--dp-emerald); margin: 0 0 14px; }
.ap-h3 { font-size: 12px; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); margin: 18px 0 8px; }
.ap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ap-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dp-muted); }
.ap-field span { font-weight: 600; }
.ap-field input, .ap-field select, .ap-field textarea { font: inherit; font-size: 13px; color: var(--dp-ink); padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; }
.ap-wide { margin-top: 12px; }
.ap-toggles { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; }
.ap-toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dp-ink); }
.ap-formactions { display: flex; gap: 8px; margin-top: 16px; }
.ap-detailhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ap-link { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--dp-emerald-2); word-break: break-all; margin: 2px 0 0; }
.ap-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
.ap-stat { border: 1px solid var(--dp-line); border-radius: 10px; padding: 10px 12px; background: rgba(247,244,238,.5); }
.ap-stat span { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); display: block; }
.ap-stat strong { font-size: 18px; color: var(--dp-emerald); }
.ap-mini { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 10px; overflow: hidden; }
.ap-minirow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dp-line); font-size: 12.5px; align-items: center; }
.ap-minirow:last-child { border-bottom: 0; }
.ap-minihead { background: rgba(18,60,46,.04); font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
@media (max-width: 900px) {
  .ap-tr { grid-template-columns: 1fr 1fr; } .ap-th { display: none; }
  .ap-grid { grid-template-columns: 1fr 1fr; } .ap-stats { grid-template-columns: 1fr 1fr; }
  .ap-minirow { grid-template-columns: 1fr 1fr; }
}
`;
