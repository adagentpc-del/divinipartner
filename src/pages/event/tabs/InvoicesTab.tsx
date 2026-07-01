import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../../lib/api';

/**
 * Invoices tab. Reuses the InvoiceList data shape and table markup but scopes to
 * the current event via the API filter (GET /invoices?event_id=). Rows open the
 * standalone invoice detail route. Graceful empty state per event. Zero em dashes.
 */

type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total: string | null;
  balance_due: string | null;
  due_date: string | null;
  currency: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  uploaded: 'Uploaded',
  standardized: 'Standardized',
  sent: 'Sent',
  viewed: 'Viewed',
  deposit_paid: 'Deposit paid',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  disputed: 'Disputed',
  refunded: 'Refunded',
  closed: 'Closed',
};

function money(v: string | null, currency: string | null): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
}

export default function InvoicesTab({ eventId }: { eventId: string }) {
  const nav = useNavigate();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    apiGet<{ invoices: Invoice[] }>(`/invoices?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => { if (on) setRows(r.invoices ?? []); })
      .catch((e) => { if (on) setError(e?.message ?? 'Failed to load invoices'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [eventId]);

  if (loading) return <p className="ew-muted">Loading invoices...</p>;
  if (error) return <p className="ew-error">{error}</p>;
  if (rows.length === 0) {
    return (
      <div className="ew-empty">
        <p>No invoices for this event yet. Standardized invoices appear here once a quote is converted or an invoice is uploaded.</p>
      </div>
    );
  }

  return (
    <div>
      <style>{I_CSS}</style>
      <table className="ew-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Status</th>
            <th>Due date</th>
            <th className="ew-inv-right">Total</th>
            <th className="ew-inv-right">Balance due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} className="ew-inv-row" onClick={() => nav(`/invoices/${inv.id}`)}>
              <td className="ew-inv-num">{inv.invoice_number ?? inv.id.slice(0, 8)}</td>
              <td>
                <span className={`ew-inv-pill st-${inv.status ?? 'draft'}`}>
                  {STATUS_LABELS[inv.status ?? 'draft'] ?? inv.status}
                </span>
              </td>
              <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
              <td className="ew-inv-right">{money(inv.total, inv.currency)}</td>
              <td className="ew-inv-right ew-inv-bal">{money(inv.balance_due, inv.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const I_CSS = `
.ew-inv-right { text-align: right; }
.ew-inv-row { cursor: pointer; transition: background .12s ease; }
.ew-inv-row:hover { background: rgba(201,163,91,.07); }
.ew-inv-num { font-weight: 600; color: #123c2e; }
.ew-inv-bal { font-weight: 600; }
.ew-inv-pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid #e7e1d6; background: #F7F4EE; color: #7d776c; }
.ew-inv-pill.st-paid { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.ew-inv-pill.st-sent, .ew-inv-pill.st-viewed, .ew-inv-pill.st-deposit_paid, .ew-inv-pill.st-partially_paid { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.ew-inv-pill.st-overdue, .ew-inv-pill.st-disputed { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.ew-inv-pill.st-standardized { background: rgba(18,60,46,.08); color: #123c2e; border-color: rgba(18,60,46,.2); }
`;
