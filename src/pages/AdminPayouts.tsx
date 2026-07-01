import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

/**
 * AdminPayouts - super-admin payout dashboard. Route: /admin/payouts
 *
 * Shows the partner payout ledger (gross volume, platform fees, processing,
 * refunds, chargebacks, net profit, commission %, owed, paid, status) and the
 * admin controls: create onboarding link, compute payout, pause, exclude
 * client/transaction, override commission, manual adjustment, require approval,
 * mark scheduled / paid, and export. Bank info is shown MASKED only.
 *
 * Reads GET /api/payouts (+ /meta, /export, /me/:partnerId via the admin views).
 * Admin-gated server-side (requireAdmin); the UI also hides for non-admins.
 *
 * ZERO em dashes anywhere (hard rule).
 */

const money = (cents?: number | string) =>
  cents == null ? '-' : '$' + (Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
const pct = (n?: number | string) => (n == null ? '-' : (Number(n) * 100).toFixed(1) + '%');

const STYLES = `
.apx{--emerald:#1E5D4A;--emerald-deep:#123c2e;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.apx h1,.apx h2,.apx h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.apx .head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.apx h1{font-size:30px}
.apx .sub{font-size:13px;color:var(--muted);margin-top:3px}
.apx .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.apx .bar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px}
.apx label{display:block;font-size:11px;color:var(--muted);font-weight:600;margin:0 0 4px}
.apx input,.apx select{padding:9px 10px;border:1px solid var(--line);border-radius:9px;font-family:Inter;font-size:13px;background:#fff;color:var(--ink)}
.apx .btn{border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:9px;cursor:pointer}
.apx .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.apx .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.apx .btn.sm{padding:5px 9px;font-size:11.5px}
.apx .btn:disabled{opacity:.5;cursor:not-allowed}
.apx table{width:100%;border-collapse:collapse;font-size:12.5px}
.apx th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:8px 8px;border-bottom:2px solid var(--line);white-space:nowrap}
.apx td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.apx tr:hover td{background:var(--ivory)}
.apx .num{text-align:right;font-variant-numeric:tabular-nums}
.apx .st{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep)}
.apx .st.paid{background:#eef6f1;border-color:#cfe6da}
.apx .st.held,.apx .st.disputed,.apx .st.cancelled{background:#fbeeee;border-color:#ecd2d2;color:#7a3030}
.apx .st.awaiting_tax_info,.apx .st.awaiting_bank_info{background:#fcf6e8;border-color:#ecddb6;color:#7a5b1f}
.apx .ctrls{display:flex;gap:6px;flex-wrap:wrap}
.apx .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-bottom:14px}
.apx .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.apx .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.apx .empty{padding:40px;text-align:center;color:var(--muted)}
.apx .infra{font-size:12px;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:9px;padding:11px 13px;margin-top:14px;line-height:1.5}
`;

type Partner = { id: string; name: string | null; company: string | null; revenue_share_pct: number | null };
type Payout = {
  id: string;
  partner_id: string | null;
  period: string | null;
  gross_volume_cents: number | string;
  platform_fees_cents: number | string;
  processing_costs_cents: number | string;
  refunds_cents: number | string;
  chargebacks_cents: number | string;
  net_profit_cents: number | string;
  commission_pct: number | string;
  commission_owed_cents: number | string;
  commission_paid_cents: number | string;
  manual_adjustment_cents: number | string;
  status: string;
  requires_approval: boolean;
  paused: boolean;
  note: string | null;
};

export default function AdminPayouts() {
  const { isAdmin } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  // compute form
  const [cPartner, setCPartner] = useState('');
  const [cPeriod, setCPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  // onboarding-link form
  const [oPartner, setOPartner] = useState('');
  const [link, setLink] = useState('');

  async function loadMeta() {
    try {
      const m = await apiGet<{ statuses: string[]; partners: Partner[] }>('/payouts/meta');
      setStatuses(m.statuses);
      setPartners(m.partners);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function load() {
    setLoading(true);
    setErr('');
    try {
      const r = await apiGet<{ payouts: Payout[] }>('/payouts');
      setRows(r.payouts);
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
    void loadMeta();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function partnerLabel(id: string | null): string {
    if (!id) return '-';
    const p = partners.find((x) => x.id === id);
    return p ? p.name || p.company || id.slice(0, 8) : id.slice(0, 8);
  }

  async function act(id: string, path: string, body?: unknown, note?: string) {
    setBusy(id);
    setErr('');
    setOk('');
    try {
      await apiSend('POST', path, body);
      if (note) setOk(note);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function compute() {
    if (!cPartner || !cPeriod) {
      setErr('Choose a partner and a period to compute.');
      return;
    }
    await act('compute', '/payouts/compute', { partner_id: cPartner, period: cPeriod }, 'Payout computed.');
  }

  async function createLink() {
    if (!oPartner) {
      setErr('Choose a partner for the onboarding link.');
      return;
    }
    setBusy('link');
    setErr('');
    setOk('');
    try {
      const r = await apiSend<{ onboarding: { onboarding_code: string } }>('POST', '/partner-onboarding', {
        partner_id: oPartner,
      });
      const code = r.onboarding.onboarding_code;
      setLink(`${window.location.origin}/partner-onboarding/${code}`);
      setOk('Onboarding link created. Share it privately with the partner.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    try {
      const data = await apiGet<{ columns: string[]; rows: (string | number)[][] }>('/payouts/export');
      const lines = [data.columns.join(',')].concat(
        data.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
      );
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `partner-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!isAdmin) return <div className="apx"><div className="card">Super-admins only.</div></div>;

  return (
    <div className="apx">
      <style>{STYLES}</style>
      <div className="head">
        <div>
          <h1>Partner Payouts</h1>
          <div className="sub">Compute, control, and record strategic partner commission payouts.</div>
        </div>
        <div className="ctrls">
          <button className="btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {err && <div className="msg err">{err}</div>}
      {ok && <div className="msg ok">{ok}</div>}

      <div className="card">
        <h3 style={{ fontSize: 18, marginBottom: 10 }}>Create onboarding link</h3>
        <div className="bar">
          <div>
            <label>Partner</label>
            <select value={oPartner} onChange={(e) => setOPartner(e.target.value)}>
              <option value="">Select partner</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.company || p.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <button className="btn primary" disabled={busy === 'link'} onClick={createLink}>
            {busy === 'link' ? 'Creating...' : 'Generate secure link'}
          </button>
        </div>
        {partners.length === 0 && (
          <div className="sub">No partners found yet. Partners appear here once the partners workstream is live.</div>
        )}
        {link && (
          <div className="row">
            <label>Private onboarding link</label>
            <input style={{ width: '100%', boxSizing: 'border-box' }} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 18, marginBottom: 10 }}>Compute a payout</h3>
        <div className="bar">
          <div>
            <label>Partner</label>
            <select value={cPartner} onChange={(e) => setCPartner(e.target.value)}>
              <option value="">Select partner</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.company || p.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Period</label>
            <input value={cPeriod} onChange={(e) => setCPeriod(e.target.value)} placeholder="2026-06" />
          </div>
          <button className="btn primary" disabled={busy === 'compute'} onClick={compute}>
            {busy === 'compute' ? 'Computing...' : 'Compute from commissions'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">Loading payouts...</div>
        ) : rows.length === 0 ? (
          <div className="empty">No payouts yet. Compute a partner payout above to get started.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Period</th>
                  <th className="num">Gross</th>
                  <th className="num">Platform fees</th>
                  <th className="num">Processing</th>
                  <th className="num">Refunds</th>
                  <th className="num">Chargebacks</th>
                  <th className="num">Net profit</th>
                  <th className="num">Comm %</th>
                  <th className="num">Owed</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{partnerLabel(p.partner_id)}</td>
                    <td>{p.period || '-'}</td>
                    <td className="num">{money(p.gross_volume_cents)}</td>
                    <td className="num">{money(p.platform_fees_cents)}</td>
                    <td className="num">{money(p.processing_costs_cents)}</td>
                    <td className="num">{money(p.refunds_cents)}</td>
                    <td className="num">{money(p.chargebacks_cents)}</td>
                    <td className="num">{money(p.net_profit_cents)}</td>
                    <td className="num">{pct(p.commission_pct)}</td>
                    <td className="num">{money(p.commission_owed_cents)}</td>
                    <td className="num">{money(p.commission_paid_cents)}</td>
                    <td>
                      <span className={`st ${p.status}`}>{p.status.replace(/_/g, ' ')}</span>
                      {p.paused && <span className="st held" style={{ marginLeft: 4 }}>paused</span>}
                    </td>
                    <td>
                      <div className="ctrls">
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/pause`, { paused: !p.paused }, p.paused ? 'Unpaused.' : 'Paused.')}
                        >
                          {p.paused ? 'Unpause' : 'Pause'}
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/status`, { status: 'approved' }, 'Approved.')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/mark-scheduled`, {}, 'Scheduled.')}
                        >
                          Schedule
                        </button>
                        <button
                          className="btn sm primary"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/mark-paid`, {}, 'Marked paid.')}
                        >
                          Mark paid
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/status`, { status: 'held' }, 'Held.')}
                        >
                          Hold
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => {
                            const v = window.prompt('Override commission %, e.g. 0.10 for 10%', String(p.commission_pct ?? ''));
                            if (v == null) return;
                            void act(p.id, `/payouts/${p.id}/override-commission`, { commission_pct: Number(v) }, 'Commission overridden.');
                          }}
                        >
                          Override
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => {
                            const v = window.prompt('Manual adjustment in cents (can be negative)', String(p.manual_adjustment_cents ?? '0'));
                            if (v == null) return;
                            void act(p.id, `/payouts/${p.id}/manual-adjustment`, { manual_adjustment_cents: Number(v) }, 'Adjustment applied.');
                          }}
                        >
                          Adjust
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => act(p.id, `/payouts/${p.id}/require-approval`, { requires_approval: !p.requires_approval }, 'Approval requirement updated.')}
                        >
                          {p.requires_approval ? 'Approval: on' : 'Approval: off'}
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === p.id}
                          onClick={() => {
                            if (!p.partner_id) return;
                            const v = window.prompt('Exclude a client org id from this partner payout');
                            if (!v) return;
                            void act(p.id, '/payouts/exclude-client', { partner_id: p.partner_id, org_id: v }, 'Client excluded.');
                          }}
                        >
                          Exclude client
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="infra">
          This dashboard records and tracks payouts. It does not move money. Actual disbursement
          requires a connected ACH provider. Marking a payout paid records the disbursement for
          reconciliation and notifies the partner. Bank details are stored encrypted and shown masked
          only (last 4 digits).
        </div>
      </div>
    </div>
  );
}
