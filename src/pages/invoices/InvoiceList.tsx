/**
 * Invoice list (blueprint section 20). Route: /invoices.
 * Lists the org's standardized invoices with status pills and balance due.
 * Self-contained styles; brand emerald / gold / ivory. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api';

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

export default function InvoiceList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    apiGet<{ invoices: Invoice[] }>('/invoices')
      .then((r) => { if (on) setRows(r.invoices ?? []); })
      .catch((e) => { if (on) setError(e?.message ?? 'Failed to load invoices'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  return (
    <div className="dpinv">
      <style>{CSS}</style>

      <header className="dpinv-head">
        <div>
          <span className="dpinv-kicker">Divini Partners</span>
          <h1 className="dpinv-title">Invoices</h1>
          <p className="dpinv-sub">Standardized, co-branded invoices across your events.</p>
        </div>
      </header>

      {loading ? (
        <div className="dpinv-empty">Loading invoices...</div>
      ) : error ? (
        <div className="dpinv-empty dpinv-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="dpinv-empty">
          <p>No invoices yet. Standardized invoices appear here once a quote is converted or an invoice is uploaded.</p>
        </div>
      ) : (
        <div className="dpinv-tablewrap">
          <table className="dpinv-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Due date</th>
                <th className="right">Total</th>
                <th className="right">Balance due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} onClick={() => nav(`/invoices/${inv.id}`)} className="dpinv-row">
                  <td className="dpinv-num">{inv.invoice_number ?? inv.id.slice(0, 8)}</td>
                  <td>
                    <span className={`dpinv-pill st-${inv.status ?? 'draft'}`}>
                      {STATUS_LABELS[inv.status ?? 'draft'] ?? inv.status}
                    </span>
                  </td>
                  <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
                  <td className="right">{money(inv.total, inv.currency)}</td>
                  <td className="right dpinv-bal">{money(inv.balance_due, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.dpinv {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dpinv h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dpinv-head { margin-bottom: 22px; }
.dpinv-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dpinv-title { font-size: 30px; color: var(--dp-emerald); line-height: 1.1; margin-top: 2px; }
.dpinv-sub { font-size: 13px; color: var(--dp-muted); margin: 4px 0 0; }
.dpinv-empty {
  background: #fff; border: 1px dashed var(--dp-line); border-radius: 14px;
  padding: 28px; color: var(--dp-muted); font-size: 13.5px; line-height: 1.55;
}
.dpinv-error { color: #9b2c2c; border-color: rgba(155,44,44,.4); }
.dpinv-tablewrap { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; overflow: hidden; }
.dpinv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dpinv-table thead th {
  text-align: left; padding: 12px 16px; font-size: 11px; letter-spacing: .5px;
  text-transform: uppercase; color: var(--dp-muted); background: var(--dp-ivory);
  border-bottom: 1px solid var(--dp-line); font-weight: 600;
}
.dpinv-table th.right, .dpinv-table td.right { text-align: right; }
.dpinv-row { cursor: pointer; transition: background .12s ease; }
.dpinv-row:hover { background: rgba(201,163,91,.07); }
.dpinv-table td { padding: 13px 16px; border-bottom: 1px solid var(--dp-line); }
.dpinv-table tr:last-child td { border-bottom: 0; }
.dpinv-num { font-weight: 600; color: var(--dp-emerald); }
.dpinv-bal { font-weight: 600; }
.dpinv-pill {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 10px;
  border-radius: 999px; border: 1px solid var(--dp-line); background: var(--dp-ivory); color: var(--dp-muted);
}
.dpinv-pill.st-paid { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); border-color: rgba(30,93,74,.3); }
.dpinv-pill.st-sent, .dpinv-pill.st-viewed { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.dpinv-pill.st-deposit_paid, .dpinv-pill.st-partially_paid { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.dpinv-pill.st-overdue, .dpinv-pill.st-disputed { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.dpinv-pill.st-standardized { background: rgba(18,60,46,.08); color: var(--dp-emerald); border-color: rgba(18,60,46,.2); }
`;
