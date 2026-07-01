import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../../lib/api';

/**
 * Payments tab. Scopes the payments dashboard to this event via the API filter
 * (GET /payments?event_id=). The org-wide summary endpoint is not event-scoped,
 * so the roll-up here is computed from the event's own payment rows. Read and
 * track only. Graceful empty state per event. Zero em dashes.
 */

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
type Meta = { payout_labels: Record<string, string> };

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
function sum(rows: Payment[], key: keyof Payment): number {
  return rows.reduce((acc, r) => acc + Number((r[key] as string | null) ?? 0), 0);
}

export default function PaymentsTab({ eventId }: { eventId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    Promise.all([
      apiGet<{ payments: Payment[] }>(`/payments?event_id=${encodeURIComponent(eventId)}`),
      apiGet<Meta>('/payments/meta'),
    ])
      .then(([p, m]) => {
        if (!on) return;
        setPayments(p.payments ?? []);
        setMeta(m);
      })
      .catch((e) => { if (on) setError((e as Error).message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [eventId]);

  const totals = useMemo(() => ({
    collected: sum(payments, 'amount'),
    platform: sum(payments, 'platform_fee'),
    processing: sum(payments, 'processing_fee'),
    net: sum(payments, 'net_payout'),
  }), [payments]);

  if (loading) return <p className="ew-muted">Loading payment activity...</p>;
  if (error) return <p className="ew-error">{error}</p>;
  if (payments.length === 0) {
    return (
      <div className="ew-empty">
        <p>No payments recorded for this event yet. Payments and payouts routed for this event appear here.</p>
      </div>
    );
  }

  return (
    <div className="ew-pay">
      <style>{P_CSS}</style>

      <div className="ew-pay-stats">
        <Stat k="Collected" v={money(totals.collected)} d="this event" />
        <Stat k="Platform fees" v={money(totals.platform)} d="Divini revenue" />
        <Stat k="Processing fees" v={money(totals.processing)} d="pass-through" />
        <Stat k="Net payout" v={money(totals.net)} d="to partners" />
      </div>

      <div className="ew-pay-tablewrap">
        <table className="ew-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Kind</th>
              <th className="ew-pay-right">Amount</th>
              <th className="ew-pay-right">Platform fee</th>
              <th className="ew-pay-right">Net payout</th>
              <th>Payout status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {FLOW_LABELS[p.flow ?? ''] ?? p.flow}
                  {p.external_payment_flag ? <span className="ew-pay-extflag">External</span> : null}
                </td>
                <td className="ew-pay-cap">{p.kind ?? '-'}</td>
                <td className="ew-pay-right">{money(p.amount)}</td>
                <td className="ew-pay-right">{p.external_payment_flag ? `${money(p.fee_owed)} owed` : money(p.platform_fee)}</td>
                <td className="ew-pay-right">{money(p.net_payout)}</td>
                <td><span className="ew-pay-pstat">{meta?.payout_labels[p.payout_status ?? ''] ?? p.payout_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="ew-pay-stat">
      <div className="ew-pay-stat-k">{k}</div>
      <div className="ew-pay-stat-v">{v}</div>
      <div className="ew-pay-stat-d">{d}</div>
    </div>
  );
}

const P_CSS = `
.ew-pay-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
.ew-pay-stat { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 16px 18px; }
.ew-pay-stat-k { font-size: 11.5px; color: #7d776c; }
.ew-pay-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; color: #123c2e; line-height: 1.05; margin: 4px 0 2px; }
.ew-pay-stat-d { font-size: 11px; color: #7d776c; }
.ew-pay-tablewrap { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; overflow: hidden; }
.ew-pay-right { text-align: right; }
.ew-pay-cap { text-transform: capitalize; }
.ew-pay-extflag { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 600; color: #9b2c2c; background: rgba(155,44,44,.1); border: 1px solid rgba(155,44,44,.35); border-radius: 999px; padding: 1px 8px; }
.ew-pay-pstat { font-size: 11.5px; color: #1E5D4A; }
@media (max-width: 1024px) { .ew-pay-stats { grid-template-columns: repeat(2, 1fr); } }
`;
