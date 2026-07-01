/**
 * MyConnectPayouts - the signed-in partner's Stripe Connect payout instructions.
 * Route: /connect-payouts/mine.
 *
 * Read-only list of what the partner is owed / has been paid via the Stripe
 * Connect split-payout rail. Money is released by a super-admin; this page just
 * shows the status and amounts.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/api';

type Instruction = {
  id: string;
  recipient_kind: string;
  basis_cents: number | string | null;
  split_percentage: number | string | null;
  amount_cents: number | string | null;
  currency: string;
  status: string;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  released_at: string | null;
  created_at: string;
};

const STYLES = `
.mcp{--emerald:#1E5D4A;--emerald-deep:#123c2e;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.mcp h1{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);font-size:30px;margin:0}
.mcp .sub{font-size:13px;color:var(--muted);margin-top:3px}
.mcp .card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-top:16px;overflow:hidden}
.mcp table{width:100%;border-collapse:collapse;font-size:12.5px}
.mcp th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:10px 12px;border-bottom:2px solid var(--line);white-space:nowrap}
.mcp td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.mcp tr:hover td{background:var(--ivory)}
.mcp .num{font-variant-numeric:tabular-nums}
.mcp .note{font-size:12px;color:var(--muted)}
.mcp .st{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep)}
.mcp .st.paid{background:#eef6f1;border-color:#cfe6da}
.mcp .st.ready,.mcp .st.releasing{background:#fcf6e8;border-color:#ecddb6;color:#7a5b1f}
.mcp .st.failed,.mcp .st.blocked{background:#fbeeee;border-color:#ecd2d2;color:#7a3030}
.mcp .empty{padding:36px;text-align:center;color:var(--muted)}
.mcp .msg.err{padding:10px 13px;border-radius:9px;font-size:13px;background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030;margin-top:14px}
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

export default function MyConnectPayouts() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Instruction[]>([]);
  const [isPartner, setIsPartner] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!session) return;
    apiGet<{ instructions: Instruction[]; is_partner: boolean }>('/connect-payouts/mine')
      .then((d) => {
        setRows(d.instructions ?? []);
        setIsPartner(d.is_partner !== false);
      })
      .catch((e: any) => setErr(e.message ?? 'Could not load payouts.'));
  }, [session]);

  if (!session) return <div className="mcp" style={{ padding: 24 }}><div className="card"><div className="empty">Sign in to view payouts.</div></div></div>;

  return (
    <div className="mcp" style={{ padding: 24 }}>
      <style>{STYLES}</style>
      <h1>My Payouts</h1>
      <div className="sub">
        Amounts owed and paid to you through the Stripe split-payout rail. Funds are sent to your
        connected bank account once a super-admin releases a payout.
      </div>

      {err && <div className="msg err">{err}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Basis</th>
              <th>Split %</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Released</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="note">{r.recipient_kind}</td>
                <td className="num">{dollars(r.basis_cents)}</td>
                <td className="num">{pct(r.split_percentage)}</td>
                <td className="num"><strong>{dollars(r.amount_cents)}</strong></td>
                <td>
                  <span className={'st ' + r.status}>{r.status}</span>
                  {r.failure_reason ? <div className="note">{r.failure_reason}</div> : null}
                </td>
                <td className="note">
                  {r.released_at ? new Date(r.released_at).toLocaleDateString() : '-'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="empty">
                  {isPartner
                    ? 'No payouts yet. When a referred payment you share in is collected, your split appears here.'
                    : 'You do not have a partner record yet, so there are no payouts to show.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
