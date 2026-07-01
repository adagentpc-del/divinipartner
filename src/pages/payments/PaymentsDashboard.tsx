/**
 * Payments + payout dashboard (blueprint section 21). Route: /payments.
 *
 * Tracks payments and payouts, shows the fee breakdown roll-up, and renders the
 * scale of platform fees by tier so partners can see what upgrading saves. Read
 * + track only; no processor integration. Self-contained styles. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api';

type Summary = {
  total_collected: number;
  total_platform_fees: number;
  total_processing_fees: number;
  total_net_payout: number;
  total_fee_owed_external: number;
  external_count: number;
};
type Payment = {
  id: string;
  amount: string | null;
  flow: string | null;
  kind: string | null;
  payout_status: string | null;
  platform_fee: string | null;
  processing_fee: string | null;
  net_payout: string | null;
  external_payment_flag: boolean;
  fee_owed: string | null;
  payee_label: string | null;
  created_at: string;
};
type Tier = { label: string; monthly: number; feeRate: number };
type Meta = {
  payout_labels: Record<string, string>;
  configurable_fees: { key: string; label: string; type: string; value: number; applies_to: string }[];
  tiers: Record<string, Tier>;
};

const FLOW_LABELS: Record<string, string> = {
  client_to_vendor: 'Client to vendor',
  client_to_venue: 'Client to venue',
  client_to_divini_payout: 'Client to Divini (payout)',
  external_recorded: 'External (off-platform)',
};

function money(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function PaymentsDashboard() {
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    Promise.all([
      apiGet<{ summary: Summary | null; tier: string | null }>('/payments/summary'),
      apiGet<{ payments: Payment[] }>('/payments'),
      apiGet<Meta>('/payments/meta'),
    ])
      .then(([s, p, m]) => {
        if (!on) return;
        setSummary(s.summary);
        setTier(s.tier ?? null);
        setPayments(p.payments ?? []);
        setMeta(m);
      })
      .catch(() => { /* surfaces as empty state */ })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  return (
    <div className="dppay">
      <style>{CSS}</style>

      <header className="dppay-head">
        <span className="dppay-kicker">Divini Partners</span>
        <h1 className="dppay-title">Payments and payouts</h1>
        <p className="dppay-sub">Track payments, fees, and payouts. Protected when routed through Divini.</p>
        <div className="dppay-head-actions">
          <button type="button" className="dppay-setup" onClick={() => nav('/payouts/setup')}>
            Set up automatic payouts
          </button>
          <button type="button" className="dppay-setup ghost" onClick={() => nav('/account/seats')}>
            Manage team seats
          </button>
        </div>
      </header>

      {loading ? (
        <div className="dppay-empty">Loading payment activity...</div>
      ) : (
        <>
          <div className="dppay-stats">
            <Stat k="Collected" v={money(summary?.total_collected)} d="across all flows" />
            <Stat k="Platform fees" v={money(summary?.total_platform_fees)} d="Divini revenue" />
            <Stat k="Processing fees" v={money(summary?.total_processing_fees)} d="pass-through" />
            <Stat k="Net payout" v={money(summary?.total_net_payout)} d="to partners" />
          </div>

          {summary && summary.external_count > 0 ? (
            <div className="dppay-alert">
              <strong>{summary.external_count}</strong> external payment{summary.external_count === 1 ? '' : 's'} recorded off-platform.
              Platform fee still owed: <strong>{money(summary.total_fee_owed_external)}</strong>.
            </div>
          ) : null}

          {meta ? (
            <section className="dppay-section">
              <h2 className="dppay-h2">Platform fee by tier</h2>
              <div className="dppay-tiers">
                {Object.entries(meta.tiers).map(([key, t]) => (
                  <div key={key} className={`dppay-tier${key === tier ? ' is-current' : ''}`}>
                    <div className="dppay-tier-name">{t.label}{key === tier ? <span className="dppay-cur">Current</span> : null}</div>
                    <div className="dppay-tier-rate">{(t.feeRate * 100).toFixed(2)}%</div>
                    <div className="dppay-tier-meta">{t.monthly > 0 ? money(t.monthly) + ' / mo' : 'No monthly fee'}</div>
                  </div>
                ))}
              </div>
              <div className="dppay-fees">
                <span className="dppay-fees-label">Configurable fees</span>
                {meta.configurable_fees.map((f) => (
                  <span key={f.key} className="dppay-feechip">
                    {f.label}: {f.type === 'percent' ? `${(f.value * 100).toFixed(2)}%` : money(f.value)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="dppay-section">
            <h2 className="dppay-h2">Payment activity</h2>
            {payments.length === 0 ? (
              <div className="dppay-empty">No payments recorded yet.</div>
            ) : (
              <div className="dppay-tablewrap">
                <table className="dppay-table">
                  <thead>
                    <tr>
                      <th>Flow</th>
                      <th>Kind</th>
                      <th className="right">Amount</th>
                      <th className="right">Platform fee</th>
                      <th className="right">Net payout</th>
                      <th>Payout status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {FLOW_LABELS[p.flow ?? ''] ?? p.flow}
                          {p.external_payment_flag ? <span className="dppay-extflag">External</span> : null}
                        </td>
                        <td className="cap">{p.kind ?? '-'}</td>
                        <td className="right">{money(p.amount)}</td>
                        <td className="right">{p.external_payment_flag ? money(p.fee_owed) + ' owed' : money(p.platform_fee)}</td>
                        <td className="right">{money(p.net_payout)}</td>
                        <td><span className="dppay-pstat">{meta?.payout_labels[p.payout_status ?? ''] ?? p.payout_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="dppay-stat">
      <div className="dppay-stat-k">{k}</div>
      <div className="dppay-stat-v">{v}</div>
      <div className="dppay-stat-d">{d}</div>
    </div>
  );
}

const CSS = `
.dppay {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dppay h1, .dppay h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dppay-head { margin-bottom: 22px; }
.dppay-setup { margin-top: 14px; font: inherit; font-size: 13px; font-weight: 600; color: #fff; background: var(--dp-emerald); border: 1px solid var(--dp-emerald); padding: 10px 18px; border-radius: 11px; cursor: pointer; }
.dppay-setup:hover { background: var(--dp-emerald-2); }
.dppay-head-actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }
.dppay-head-actions .dppay-setup { margin-top: 0; }
.dppay-setup.ghost { background: transparent; color: var(--dp-emerald); }
.dppay-setup.ghost:hover { background: rgba(18, 60, 46, 0.06); }
.dppay-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dppay-title { font-size: 30px; color: var(--dp-emerald); line-height: 1.1; margin-top: 2px; }
.dppay-sub { font-size: 13px; color: var(--dp-muted); margin: 4px 0 0; }

.dppay-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
.dppay-stat { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px; }
.dppay-stat-k { font-size: 11.5px; color: var(--dp-muted); }
.dppay-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; color: var(--dp-emerald); line-height: 1.05; margin: 4px 0 2px; }
.dppay-stat-d { font-size: 11px; color: var(--dp-muted); }

.dppay-alert { background: rgba(201,163,91,.14); border: 1px solid rgba(201,163,91,.45); color: #8a5a12; border-radius: 12px; padding: 13px 16px; font-size: 13px; margin-bottom: 22px; }

.dppay-section { margin-bottom: 26px; }
.dppay-h2 { font-size: 19px; color: var(--dp-emerald); margin-bottom: 12px; }

.dppay-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.dppay-tier { background: #fff; border: 1px solid var(--dp-line); border-radius: 12px; padding: 14px 16px; }
.dppay-tier.is-current { border-color: var(--dp-gold); box-shadow: 0 0 0 1px var(--dp-gold) inset; }
.dppay-tier-name { font-size: 12.5px; font-weight: 600; color: var(--dp-ink); display: flex; align-items: center; gap: 6px; }
.dppay-cur { font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; color: var(--dp-emerald); background: rgba(201,163,91,.22); border: 1px solid rgba(201,163,91,.5); padding: 1px 6px; border-radius: 999px; }
.dppay-tier-rate { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; color: var(--dp-emerald); line-height: 1.1; margin: 4px 0 2px; }
.dppay-tier-meta { font-size: 11px; color: var(--dp-muted); }

.dppay-fees { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dppay-fees-label { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: var(--dp-muted); font-weight: 600; }
.dppay-feechip { font-size: 11.5px; background: var(--dp-ivory); border: 1px solid var(--dp-line); border-radius: 999px; padding: 3px 11px; color: var(--dp-ink); }

.dppay-tablewrap { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; overflow: hidden; }
.dppay-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dppay-table thead th { text-align: left; padding: 11px 14px; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); background: var(--dp-ivory); border-bottom: 1px solid var(--dp-line); font-weight: 600; }
.dppay-table th.right, .dppay-table td.right { text-align: right; }
.dppay-table td { padding: 12px 14px; border-bottom: 1px solid var(--dp-line); }
.dppay-table tr:last-child td { border-bottom: 0; }
.dppay-table td.cap { text-transform: capitalize; }
.dppay-extflag { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 600; color: #9b2c2c; background: rgba(155,44,44,.1); border: 1px solid rgba(155,44,44,.35); border-radius: 999px; padding: 1px 8px; }
.dppay-pstat { font-size: 11.5px; color: var(--dp-emerald-2); }

.dppay-empty { background: #fff; border: 1px dashed var(--dp-line); border-radius: 14px; padding: 26px; color: var(--dp-muted); font-size: 13.5px; }

@media (max-width: 1024px) {
  .dppay-stats, .dppay-tiers { grid-template-columns: repeat(2, 1fr); }
}
`;
