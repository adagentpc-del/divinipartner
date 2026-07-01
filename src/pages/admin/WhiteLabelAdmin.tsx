import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * WhiteLabelAdmin (blueprint 5) - PRIVATE white-label pipeline + controls.
 *
 * ADMIN-ONLY and never linked from the public site. Manages the lifecycle
 * (Not Eligible .. Active .. Cancelled), the internal qualification fields, and
 * the custom configuration (fee rate, seats, domain, branding) applied when a
 * deal goes Active. Reads /api/admin/white-label.
 */
type Status =
  | 'not_eligible' | 'potential_fit' | 'invited' | 'proposal_sent'
  | 'contract_pending' | 'active' | 'paused' | 'cancelled';

type Record = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  organization_tier: string | null;
  status: string;
  fit_score: string | null;
  internal_notes: string | null;
  contract_value: string | null;
  custom_fee_rate: string | null;
  custom_seats: number | null;
  custom_domain: string | null;
  domain_verified: boolean;
  branding_enabled: boolean;
};

const STATUS_ORDER: Status[] = [
  'not_eligible', 'potential_fit', 'invited', 'proposal_sent',
  'contract_pending', 'active', 'paused', 'cancelled',
];
const LABELS: { [k in Status]: string } = {
  not_eligible: 'Not eligible', potential_fit: 'Potential fit', invited: 'Invited',
  proposal_sent: 'Proposal sent', contract_pending: 'Contract pending', active: 'Active',
  paused: 'Paused', cancelled: 'Cancelled',
};

export default function WhiteLabelAdmin() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Record[]>([]);
  const [openOrg, setOpenOrg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // edit fields for the open record
  const [fit, setFit] = useState('');
  const [notes, setNotes] = useState('');
  const [value, setValue] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [seats, setSeats] = useState('');
  const [domain, setDomain] = useState('');
  const [domainVerified, setDomainVerified] = useState(false);
  const [brandingEnabled, setBrandingEnabled] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ pipeline: Record[] }>('/admin/white-label');
      setRows(r.pipeline);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { if (isAdmin) void load(); else setLoading(false); }, [isAdmin]);

  const open = rows.find((r) => r.organization_id === openOrg) ?? null;

  function openEditor(r: Record) {
    setOpenOrg(r.organization_id);
    setFit(r.fit_score ?? '');
    setNotes(r.internal_notes ?? '');
    setValue(r.contract_value ?? '');
    setFeeRate(r.custom_fee_rate ?? '');
    setSeats(r.custom_seats != null ? String(r.custom_seats) : '');
    setDomain(r.custom_domain ?? '');
    setDomainVerified(!!r.domain_verified);
    setBrandingEnabled(!!r.branding_enabled);
  }

  async function saveFields() {
    if (!open) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend('PATCH', `/admin/white-label/${open.organization_id}`, {
        fit_score: fit ? Number(fit) : undefined,
        internal_notes: notes || undefined,
        contract_value: value ? Number(value) : undefined,
        custom_fee_rate: feeRate ? Number(feeRate) : undefined,
        custom_seats: seats ? Number(seats) : undefined,
        custom_domain: domain || undefined,
        domain_verified: domainVerified,
        branding_enabled: brandingEnabled,
      });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(status: Status) {
    if (!open) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/admin/white-label/${open.organization_id}/status`, { status });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!isAdmin) {
    return <div className="wl"><style>{WL_CSS}</style><p className="wl-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="wl">
      <style>{WL_CSS}</style>
      <header className="wl-head">
        <span className="wl-kicker">Confidential</span>
        <h1 className="wl-title">White-Label Pipeline</h1>
        <p className="wl-sub">Internal only. This pipeline is never shown to partners or on the public site.</p>
      </header>

      {err ? <p className="wl-err">{err}</p> : null}

      {loading ? (
        <p className="wl-muted">Loading pipeline...</p>
      ) : (
        <div className="wl-cols">
          {STATUS_ORDER.map((st) => {
            const col = rows.filter((r) => r.status === st);
            if (st === 'not_eligible' && col.length === 0) return null;
            return (
              <div key={st} className="wl-col">
                <div className="wl-col-head">{LABELS[st]}<span>{col.length}</span></div>
                {col.map((r) => (
                  <button key={r.organization_id} type="button" className="wl-cardlite" onClick={() => openEditor(r)}>
                    <span className="wl-cardlite-name">{r.organization_name ?? 'Org'}</span>
                    <span className="wl-cardlite-meta">
                      {r.organization_tier ?? 'tier'}{r.fit_score ? ` - fit ${r.fit_score}` : ''}
                    </span>
                  </button>
                ))}
                {col.length === 0 ? <p className="wl-col-empty">None</p> : null}
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="wl-overlay" role="dialog" aria-modal="true">
          <div className="wl-card">
            <div className="wl-card-head">
              <div>
                <h2>{open.organization_name ?? 'Organization'}</h2>
                <span className="wl-card-tier">{open.organization_tier ?? 'tier'} - {LABELS[open.status as Status] ?? open.status}</span>
              </div>
              <button type="button" className="wl-x" onClick={() => setOpenOrg(null)}>Close</button>
            </div>

            <div className="wl-statusrow">
              {STATUS_ORDER.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`wl-stbtn${open.status === st ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => setStatus(st)}
                >
                  {LABELS[st]}
                </button>
              ))}
            </div>

            <div className="wl-section">Internal qualification</div>
            <div className="wl-fields">
              <label>Fit score (0-100)<input type="number" value={fit} onChange={(e) => setFit(e.target.value)} /></label>
              <label>Contract value<input type="number" value={value} onChange={(e) => setValue(e.target.value)} /></label>
            </div>
            <label className="wl-full">Internal notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

            <div className="wl-section">Custom configuration (applied when Active)</div>
            <div className="wl-fields">
              <label>Custom fee rate (e.g. 0.01)<input type="number" step="0.001" value={feeRate} onChange={(e) => setFeeRate(e.target.value)} /></label>
              <label>Custom seats<input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} /></label>
            </div>
            <label className="wl-full">Custom domain<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="partner.example.com" /></label>
            <div className="wl-toggles">
              <label><input type="checkbox" checked={domainVerified} onChange={(e) => setDomainVerified(e.target.checked)} /> Domain verified</label>
              <label><input type="checkbox" checked={brandingEnabled} onChange={(e) => setBrandingEnabled(e.target.checked)} /> Custom branding enabled</label>
            </div>

            <div className="wl-actions">
              <button type="button" className="wl-btn ghost" onClick={() => setOpenOrg(null)}>Close</button>
              <button type="button" className="wl-btn" disabled={busy} onClick={saveFields}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const WL_CSS = `
.wl {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.wl *, .wl *::before, .wl *::after { box-sizing: border-box; }
.wl h1, .wl h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.wl-head { margin-bottom: 18px; }
.wl-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #a86b6b; font-weight: 700; }
.wl-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.wl-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.wl-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.wl-muted { color: var(--dp-muted); font-size: 13px; }
.wl-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.wl-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; align-items: start; }
.wl-col { background: rgba(18,60,46,.04); border: 1px solid var(--dp-line); border-radius: 12px; padding: 10px; }
.wl-col-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; color: var(--dp-muted); padding: 2px 4px 8px; }
.wl-col-head span { background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; padding: 0 7px; font-size: 11px; }
.wl-col-empty { font-size: 11.5px; color: var(--dp-muted); margin: 4px; }
.wl-cardlite { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; background: #fff; border: 1px solid var(--dp-line); border-radius: 9px; padding: 9px 11px; margin-bottom: 7px; cursor: pointer; font: inherit; }
.wl-cardlite:hover { border-color: var(--dp-gold); }
.wl-cardlite-name { font-size: 13px; font-weight: 600; color: var(--dp-emerald); }
.wl-cardlite-meta { font-size: 11px; color: var(--dp-muted); text-transform: capitalize; }
.wl-overlay { position: fixed; inset: 0; background: rgba(18,30,24,.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 70; }
.wl-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; padding: 22px; }
.wl-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.wl-card-head h2 { font-size: 24px; color: var(--dp-emerald); }
.wl-card-tier { font-size: 12px; color: var(--dp-muted); text-transform: capitalize; }
.wl-x { background: transparent; border: 1px solid var(--dp-line); border-radius: 8px; padding: 5px 11px; font: inherit; font-size: 12px; cursor: pointer; color: var(--dp-muted); }
.wl-statusrow { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 4px; }
.wl-stbtn { background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; font: inherit; font-size: 11.5px; padding: 5px 11px; cursor: pointer; color: var(--dp-ink); }
.wl-stbtn:hover { border-color: var(--dp-gold); }
.wl-stbtn.is-active { background: var(--dp-emerald); color: #fff; border-color: var(--dp-emerald); }
.wl-stbtn:disabled { opacity: .6; cursor: default; }
.wl-section { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; margin: 18px 0 8px; }
.wl-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.wl label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; letter-spacing: .3px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.wl-full { margin-top: 12px; }
.wl input, .wl textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; color: var(--dp-ink); text-transform: none; letter-spacing: normal; font-weight: 400; }
.wl textarea { resize: vertical; }
.wl-toggles { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; }
.wl-toggles label { flex-direction: row; align-items: center; gap: 7px; text-transform: none; letter-spacing: normal; font-weight: 500; font-size: 12.5px; color: var(--dp-ink); }
.wl-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 20px; }
.wl-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.wl-btn:hover { background: var(--dp-emerald-2); }
.wl-btn:disabled { opacity: .6; cursor: default; }
.wl-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
@media (max-width: 560px) { .wl-fields { grid-template-columns: 1fr; } }
`;
