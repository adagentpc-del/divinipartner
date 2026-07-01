/**
 * AdminConnectPayouts - the 1-CLICK RELEASE queue for the Stripe Connect
 * split-payout rail. Route: /admin/connect-payouts.
 *
 * Each row is a queued split (recipient, basis, split %, amount, status). A
 * Release button per row instructs Stripe to transfer the funds to the
 * recipient's connected bank. Admin can also hold or cancel a row.
 *
 * SAFETY: Release sends real funds via Stripe to the recipient bank. Nothing
 * auto-disburses; every transfer is a deliberate one-click action. When Stripe
 * is not configured or the recipient is not payouts-enabled, Release marks the
 * row 'blocked' with a clear reason instead of moving money. Admin-gated
 * server-side (requireAdmin); the UI also hides for non-admins.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

type Row = {
  id: string;
  recipient_kind: string;
  recipient_partner_id: string | null;
  recipient_organization_id: string | null;
  recipient_partner_name: string | null;
  recipient_partner_company: string | null;
  recipient_org_name: string | null;
  account_payouts_enabled: boolean | null;
  account_bank_last4: string | null;
  account_stripe_id: string | null;
  basis_cents: number | string | null;
  split_percentage: number | string | null;
  amount_cents: number | string | null;
  currency: string;
  status: string;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: string;
};

type Totals = { pendingCents: number; readyCents: number; paidCents: number };

const STYLES = `
.acp{--emerald:#1E5D4A;--emerald-deep:#123c2e;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.acp h1{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);font-size:30px;margin:0}
.acp .sub{font-size:13px;color:var(--muted);margin-top:3px;max-width:720px}
.acp .warn{display:inline-block;font-size:12px;font-weight:600;padding:7px 12px;border-radius:9px;margin:14px 0;background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.acp .warn.amber{background:#fcf6e8;border-color:#ecddb6;color:#7a5b1f;display:block}
.acp .cards{display:flex;gap:14px;margin:8px 0 16px;flex-wrap:wrap}
.acp .stat{flex:1;min-width:170px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}
.acp .stat .lbl{font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.acp .stat .v{font-size:26px;font-weight:700;color:var(--emerald-deep);margin-top:4px;font-variant-numeric:tabular-nums}
.acp .card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.acp table{width:100%;border-collapse:collapse;font-size:12.5px}
.acp th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:10px 10px;border-bottom:2px solid var(--line);white-space:nowrap}
.acp td{padding:10px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.acp tr:hover td{background:var(--ivory)}
.acp .num{font-variant-numeric:tabular-nums}
.acp .note{font-size:12px;color:var(--muted)}
.acp .st{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep)}
.acp .st.paid{background:#eef6f1;border-color:#cfe6da}
.acp .st.ready,.acp .st.releasing{background:#fcf6e8;border-color:#ecddb6;color:#7a5b1f}
.acp .st.failed,.acp .st.blocked{background:#fbeeee;border-color:#ecd2d2;color:#7a3030}
.acp .btn{border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer}
.acp .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.acp .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.acp .btn:disabled{opacity:.5;cursor:not-allowed}
.acp .ctrls{display:flex;gap:6px;flex-wrap:wrap}
.acp .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-bottom:14px}
.acp .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.acp .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.acp .empty{padding:36px;text-align:center;color:var(--muted)}
`;

const dollars = (cents: number | string | null) => {
  if (cents == null || cents === '') return '-';
  const n = Number(cents);
  return Number.isFinite(n) ? `$${(n / 100).toFixed(2)}` : '-';
};

const pct = (p: number | string | null) => {
  if (p == null || p === '') return '-';
  const n = Number(p);
  return Number.isFinite(n) ? `${n}%` : '-';
};

function recipientName(r: Row): string {
  if (r.recipient_partner_name) return r.recipient_partner_name;
  if (r.recipient_partner_company) return r.recipient_partner_company;
  if (r.recipient_org_name) return r.recipient_org_name;
  if (r.recipient_partner_id) return r.recipient_partner_id.slice(0, 8);
  if (r.recipient_organization_id) return r.recipient_organization_id.slice(0, 8);
  return '-';
}

export default function AdminConnectPayouts() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ pendingCents: 0, readyCents: 0, paidCents: 0 });
  const [configured, setConfigured] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const d = await apiGet<{ rows: Row[]; totals: Totals; configured: boolean }>(
        '/connect-payouts/admin/queue',
      );
      setRows(d.rows ?? []);
      setTotals(d.totals ?? { pendingCents: 0, readyCents: 0, paidCents: 0 });
      setConfigured(d.configured);
    } catch (e: any) {
      setErr(e.message ?? 'Could not load payout queue.');
    }
  }

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return <div className="acp" style={{ padding: 24 }}><div className="card"><div className="empty">Admins only.</div></div></div>;

  async function release(id: string) {
    setBusy(id);
    setErr('');
    setMsg('');
    try {
      const d = await apiSend<{ released: boolean; status: string; reason?: string }>(
        'POST',
        `/connect-payouts/admin/${id}/release`,
        {},
      );
      if (d.released) setMsg('Payout released via Stripe.');
      else setMsg(d.reason ?? `Not released (${d.status}).`);
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Release failed.');
      await load();
    } finally {
      setBusy('');
    }
  }

  async function control(id: string, status: 'held' | 'canceled') {
    setBusy(id);
    setErr('');
    try {
      await apiSend('PATCH', `/connect-payouts/admin/${id}`, { status });
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Update failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="acp" style={{ padding: 24 }}>
      <style>{STYLES}</style>
      <h1>Connect Payouts</h1>
      <div className="sub">
        Release queue for the Stripe Connect split-payout rail. Each split is computed when a
        referred payment is marked collected; release sends the funds to the recipient's connected
        bank.
      </div>

      <div className="warn">
        Release sends real funds via Stripe to the recipient bank. Nothing auto-disburses; each
        transfer is a deliberate one-click action.
      </div>

      {!configured && (
        <div className="warn amber">
          Stripe is not configured (STRIPE_SECRET_KEY unset). Releasing will mark rows blocked, not
          move money, until Stripe is connected.
        </div>
      )}

      {err && <div className="msg err">{err}</div>}
      {msg && <div className="msg ok">{msg}</div>}

      <div className="cards">
        <div className="stat">
          <div className="lbl">Pending</div>
          <div className="v">{dollars(totals.pendingCents)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Ready to release</div>
          <div className="v">{dollars(totals.readyCents)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Paid</div>
          <div className="v">{dollars(totals.paidCents)}</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Kind</th>
              <th>Bank</th>
              <th>Basis</th>
              <th>Split %</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{recipientName(r)}</strong></td>
                <td className="note">{r.recipient_kind}</td>
                <td className="note">
                  {r.account_bank_last4 ? `•••• ${r.account_bank_last4}` : 'not connected'}
                </td>
                <td className="num">{dollars(r.basis_cents)}</td>
                <td className="num">{pct(r.split_percentage)}</td>
                <td className="num"><strong>{dollars(r.amount_cents)}</strong></td>
                <td>
                  <span className={'st ' + r.status}>{r.status}</span>
                  {r.failure_reason ? <div className="note">{r.failure_reason}</div> : null}
                </td>
                <td>
                  <div className="ctrls">
                    {['ready', 'pending', 'blocked', 'failed'].includes(r.status) && (
                      <button
                        className="btn primary"
                        disabled={!!busy}
                        onClick={() => release(r.id)}
                        title={
                          r.account_payouts_enabled
                            ? 'Send funds via Stripe'
                            : 'Recipient not payouts-enabled yet; will mark blocked'
                        }
                      >
                        Release
                      </button>
                    )}
                    {r.status !== 'held' && r.status !== 'paid' && (
                      <button className="btn" disabled={!!busy} onClick={() => control(r.id, 'held')}>
                        Hold
                      </button>
                    )}
                    {r.status !== 'canceled' && r.status !== 'paid' && (
                      <button className="btn" disabled={!!busy} onClick={() => control(r.id, 'canceled')}>
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="empty">
                  No payouts queued. Splits appear here when a collected revenue row has an agreed
                  recipient share.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
