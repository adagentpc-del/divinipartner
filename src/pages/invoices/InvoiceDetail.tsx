/**
 * Standardized invoice detail (blueprint section 20). Route: /invoices/:id.
 *
 * The canonical co-branded Divini invoice view: Divini lockup + the partner org
 * brand, parties, line items, taxes/fees, platform fee, processing fee, deposit
 * status, balance due, status pill, terms + notes, a pay-button placeholder, and
 * a print/download-friendly layout. Self-contained styles. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiSend, apiBlob } from '../../lib/api';
import { pricingV2Active, setPricingV2FromServer, feeLineLabel } from '../../lib/pricing';

type LineItem = { description: string; quantity?: number; unit_price?: number; amount: number };
type Brand = {
  platform?: { name?: string; by?: string; logo?: string };
  partner?: { name?: string; tier?: string | null };
};
type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  line_items: LineItem[] | null;
  subtotal: string | null;
  taxes: string | null;
  platform_fee: string | null;
  platform_fee_rate: string | null;
  processing_fee: string | null;
  total: string | null;
  deposit_due: string | null;
  deposit_paid: string | null;
  deposit_status: string | null;
  balance_due: string | null;
  due_date: string | null;
  terms: string | null;
  notes: string | null;
  payment_link: string | null;
  brand: Brand | null;
  currency: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', uploaded: 'Uploaded', standardized: 'Standardized', sent: 'Sent',
  viewed: 'Viewed', deposit_paid: 'Deposit paid', partially_paid: 'Partially paid',
  paid: 'Paid', overdue: 'Overdue', disputed: 'Disputed', refunded: 'Refunded', closed: 'Closed',
};

function money(v: string | null | undefined, currency: string | null): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proc, setProc] = useState<{ stripe: boolean; paypal: boolean } | null>(null);
  const [v2, setV2] = useState<boolean>(pricingV2Active());
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let on = true;
    apiGet<{ invoice: Invoice }>(`/invoices/${id}`)
      .then((r) => { if (on) setInv(r.invoice); })
      .catch((e) => { if (on) setError(e?.message ?? 'Failed to load invoice'); })
      .finally(() => { if (on) setLoading(false); });
    apiGet<{ stripe: boolean; paypal: boolean; pricing_v2?: boolean; platform_fee_rate?: number }>(`/payments/processors`)
      .then((r) => {
        if (!on) return;
        setProc({ stripe: r.stripe, paypal: r.paypal });
        setPricingV2FromServer(r);
        setV2(pricingV2Active());
      })
      .catch(() => { if (on) setProc({ stripe: false, paypal: false }); });
    return () => { on = false; };
  }, [id]);

  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadPdf() {
    if (!id) return;
    setPdfBusy(true);
    try {
      const blob = await apiBlob(`/invoices/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      window.print(); // fall back to the browser print path
    } finally {
      setPdfBusy(false);
    }
  }

  async function pay(processor: 'stripe' | 'paypal', amount: number) {
    if (!id || amount <= 0) return;
    setPaying(true);
    setPayErr(null);
    try {
      const r = await apiSend<{ redirect_url: string }>('POST', '/payments/checkout', {
        processor, amount, invoice_id: id, flow: 'client_to_vendor',
      });
      window.location.href = r.redirect_url;
    } catch (e) {
      setPayErr((e as Error)?.message ?? 'Could not start checkout');
      setPaying(false);
    }
  }

  if (loading) return <div className="dpid"><style>{CSS}</style><div className="dpid-state">Loading invoice...</div></div>;
  if (error || !inv) return <div className="dpid"><style>{CSS}</style><div className="dpid-state err">{error ?? 'Invoice not found'}</div></div>;

  const cur = inv.currency;
  const items = inv.line_items ?? [];
  const feeRatePct = inv.platform_fee_rate != null ? `${(Number(inv.platform_fee_rate) * 100).toFixed(2)}%` : '';
  const platform = inv.brand?.platform;
  const partner = inv.brand?.partner;
  const balance = Number(inv.balance_due ?? inv.total ?? 0);
  const anyProcessor = !!(proc && (proc.stripe || proc.paypal));

  return (
    <div className="dpid">
      <style>{CSS}</style>

      <div className="dpid-toolbar">
        <button type="button" className="dpid-link" onClick={() => nav('/invoices')}>Back to invoices</button>
        <button type="button" className="dpid-btn ghost" disabled={pdfBusy} onClick={downloadPdf}>
          {pdfBusy ? 'Preparing PDF...' : 'Download PDF'}
        </button>
      </div>

      <article className="dpid-sheet">
        <header className="dpid-sheet-head">
          <div className="dpid-cobrand">
            <div className="dpid-logomark">{platform?.logo ?? 'D'}</div>
            <div className="dpid-brandtext">
              <span className="dpid-brandname">{platform?.name ?? 'Divini Partners'}</span>
              <span className="dpid-brandby">{platform?.by ?? 'by Divini Group'}</span>
            </div>
            {partner?.name ? (
              <>
                <span className="dpid-cobrand-x" aria-hidden="true">+</span>
                <div className="dpid-brandtext">
                  <span className="dpid-brandname">{partner.name}</span>
                  {partner.tier ? <span className="dpid-brandby">{partner.tier}</span> : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="dpid-meta">
            <span className={`dpid-pill st-${inv.status ?? 'draft'}`}>{STATUS_LABELS[inv.status ?? 'draft'] ?? inv.status}</span>
            <div className="dpid-num">{inv.invoice_number ?? inv.id.slice(0, 8)}</div>
            <div className="dpid-issued">Issued {new Date(inv.created_at).toLocaleDateString()}</div>
            {inv.due_date ? <div className="dpid-issued">Due {new Date(inv.due_date).toLocaleDateString()}</div> : null}
          </div>
        </header>

        <table className="dpid-items">
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Qty</th>
              <th className="right">Unit</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} className="dpid-noitems">No line items on this invoice.</td></tr>
            ) : items.map((li, i) => (
              <tr key={i}>
                <td>{li.description}</td>
                <td className="right">{li.quantity ?? '-'}</td>
                <td className="right">{li.unit_price != null ? money(String(li.unit_price), cur) : '-'}</td>
                <td className="right">{money(String(li.amount), cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="dpid-totals">
          <div className="dpid-totrow"><span>Subtotal</span><span>{money(inv.subtotal, cur)}</span></div>
          {Number(inv.taxes ?? 0) > 0 || !v2 ? (
            <div className="dpid-totrow"><span>Taxes</span><span>{money(inv.taxes, cur)}</span></div>
          ) : null}
          <div className="dpid-totrow">
            <span>{v2 ? feeLineLabel() : 'Platform fee'} {!v2 && feeRatePct ? <em className="dpid-rate">({feeRatePct})</em> : null}</span>
            <span>{v2 ? `+ ${money(inv.platform_fee, cur)}` : money(inv.platform_fee, cur)}</span>
          </div>
          {!v2 ? (
            <div className="dpid-totrow"><span>Processing fee</span><span>{money(inv.processing_fee, cur)}</span></div>
          ) : null}
          <div className="dpid-totrow grand"><span>{v2 ? 'Total you pay' : 'Total'}</span><span>{money(inv.total, cur)}</span></div>
          <div className="dpid-totrow muted"><span>Deposit ({inv.deposit_status ?? 'none'})</span><span>{money(inv.deposit_paid, cur)}</span></div>
          <div className="dpid-totrow balance"><span>Balance due</span><span>{money(inv.balance_due, cur)}</span></div>
        </div>
        {v2 ? (
          <p className="dpid-v2note">
            The {feeLineLabel().toLowerCase()} is added on top of your vendor's price. Your vendor
            receives their full quoted amount of {money(inv.subtotal, cur)}; the fee is what you pay
            Divini Partners for a protected, on-platform transaction.
          </p>
        ) : null}

        <p className="dpid-v2note" style={{ fontSize: 12, color: '#6b7a72' }}>
          Payments are processed securely by our third-party payment provider. Divini Partners is a
          lead-generation and networking platform and is not a party to this transaction. See our{' '}
          <a href="/payment-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#1f6f50' }}>Payment Policy</a>{' '}and{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#1f6f50' }}>Terms</a>.
        </p>

        <div className="dpid-pay">
          {balance <= 0 ? (
            <span className="dpid-payhint">This invoice is fully paid. Thank you.</span>
          ) : anyProcessor ? (
            <>
              <div className="dpid-paybtns">
                {proc?.stripe && (
                  <button type="button" className="dpid-btn primary" disabled={paying} onClick={() => pay('stripe', balance)}>
                    {paying ? 'Starting checkout...' : `Pay ${money(inv.balance_due, cur)} by card`}
                  </button>
                )}
                {proc?.paypal && (
                  <button type="button" className="dpid-btn gold" disabled={paying} onClick={() => pay('paypal', balance)}>
                    {paying ? 'Starting checkout...' : 'Pay with PayPal'}
                  </button>
                )}
              </div>
              <span className="dpid-payhint">
                Payments are protected when made through Divini Partners. You will be redirected to a secure checkout.
              </span>
              {payErr ? <span className="dpid-payerr">{payErr}</span> : null}
            </>
          ) : (
            <>
              <button type="button" className="dpid-btn primary" disabled title="Payment processing connects at go-live">
                Pay through Divini
              </button>
              <span className="dpid-payhint">
                Payments are protected when made through Divini Partners. Processor connects at go-live.
              </span>
            </>
          )}
        </div>

        {(inv.terms || inv.notes) ? (
          <footer className="dpid-foot">
            {inv.terms ? <div className="dpid-block"><h4>Terms</h4><p>{inv.terms}</p></div> : null}
            {inv.notes ? <div className="dpid-block"><h4>Notes</h4><p>{inv.notes}</p></div> : null}
          </footer>
        ) : null}
      </article>
    </div>
  );
}

const CSS = `
.dpid {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dpid h4 { font-family: 'Cormorant Garamond', Georgia, serif; margin: 0; }
.dpid-state { padding: 40px; color: var(--dp-muted); font-size: 14px; }
.dpid-state.err { color: #9b2c2c; }
.dpid-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.dpid-link { background: 0; border: 0; color: var(--dp-emerald); font: inherit; font-size: 13px; cursor: pointer; padding: 0; }
.dpid-link:hover { color: var(--dp-gold); }

.dpid-sheet { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; padding: 30px 32px; max-width: 760px; }
.dpid-sheet-head { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 22px; border-bottom: 2px solid var(--dp-emerald); margin-bottom: 22px; }
.dpid-cobrand { display: flex; align-items: center; gap: 12px; }
.dpid-logomark {
  width: 44px; height: 44px; flex: 0 0 44px; border-radius: 11px;
  background: linear-gradient(135deg, var(--dp-gold), #b58e44); color: var(--dp-emerald);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 24px;
}
.dpid-brandtext { display: flex; flex-direction: column; line-height: 1.15; }
.dpid-brandname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 600; color: var(--dp-emerald); }
.dpid-brandby { font-size: 10px; color: var(--dp-muted); letter-spacing: .4px; text-transform: uppercase; }
.dpid-cobrand-x { color: var(--dp-gold); font-size: 18px; font-weight: 700; }
.dpid-meta { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.dpid-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--dp-emerald); }
.dpid-issued { font-size: 11.5px; color: var(--dp-muted); }

.dpid-items { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px; }
.dpid-items thead th { text-align: left; padding: 9px 10px; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); border-bottom: 1px solid var(--dp-line); font-weight: 600; }
.dpid-items th.right, .dpid-items td.right { text-align: right; }
.dpid-items td { padding: 10px; border-bottom: 1px solid var(--dp-line); }
.dpid-noitems { color: var(--dp-muted); font-style: italic; }

.dpid-totals { margin-left: auto; max-width: 320px; display: flex; flex-direction: column; gap: 6px; }
.dpid-totrow { display: flex; justify-content: space-between; font-size: 13px; }
.dpid-totrow.muted { color: var(--dp-muted); }
.dpid-rate { font-style: normal; color: var(--dp-muted); font-size: 11.5px; }
.dpid-totrow.grand { font-weight: 700; font-size: 15px; color: var(--dp-emerald); padding-top: 8px; margin-top: 4px; border-top: 1px solid var(--dp-line); }
.dpid-v2note { max-width: 320px; margin-left: auto; margin-top: 10px; font-size: 11.5px; color: var(--dp-muted); line-height: 1.5; }
.dpid-totrow.balance {
  font-weight: 700; font-size: 15px; color: var(--dp-emerald);
  padding: 8px 12px; margin-top: 6px; border-radius: 9px;
  background: rgba(201,163,91,.14); border: 1px solid rgba(201,163,91,.4);
}

.dpid-pay { display: flex; align-items: center; gap: 14px; margin-top: 24px; flex-wrap: wrap; }
.dpid-payhint { font-size: 11.5px; color: var(--dp-muted); flex: 1 1 220px; }
.dpid-btn { font: inherit; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.dpid-btn.primary { background: var(--dp-emerald); color: #fff; }
.dpid-btn.primary:disabled { opacity: .55; cursor: not-allowed; }
.dpid-btn.ghost { background: transparent; color: var(--dp-emerald); border-color: var(--dp-line); }
.dpid-btn.ghost:hover { border-color: var(--dp-emerald); }
.dpid-btn.gold { background: var(--dp-champagne, #C9A35B); color: #123c2e; }
.dpid-btn.gold:disabled { opacity: .55; cursor: not-allowed; }
.dpid-paybtns { display: flex; gap: 10px; flex-wrap: wrap; }
.dpid-payerr { font-size: 12px; color: #b3261e; flex: 1 1 100%; }

.dpid-foot { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--dp-line); display: grid; gap: 14px; }
.dpid-block h4 { font-size: 15px; color: var(--dp-emerald); margin-bottom: 4px; }
.dpid-block p { font-size: 12.5px; color: var(--dp-muted); line-height: 1.55; margin: 0; }

.dpid-pill { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--dp-line); background: var(--dp-ivory); color: var(--dp-muted); }
.dpid-pill.st-paid { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); border-color: rgba(30,93,74,.3); }
.dpid-pill.st-overdue, .dpid-pill.st-disputed { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.dpid-pill.st-standardized { background: rgba(18,60,46,.08); color: var(--dp-emerald); border-color: rgba(18,60,46,.2); }

@media print {
  .dpid-toolbar, .dpid-pay { display: none; }
  .dpid-sheet { border: 0; box-shadow: none; }
}
`;
