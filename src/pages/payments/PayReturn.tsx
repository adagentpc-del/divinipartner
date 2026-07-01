/**
 * Payment return page. The processor (Stripe / PayPal) redirects the client here
 * after a hosted checkout. We read the query, capture/confirm the payment, and
 * show a result. Idempotent: refreshing re-confirms and shows the same outcome.
 * Route: /pay/return. Zero em dashes.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiSend, apiGet } from '../../lib/api';
import FeeBreakdown from '../../components/FeeBreakdown';
import { pricingV2Active, setPricingV2FromServer, decomposeClientTotal, feeLineLabel, usd } from '../../lib/pricing';

type Phase = 'working' | 'success' | 'cancelled' | 'error';

export default function PayReturn() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('working');
  const [amount, setAmount] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [v2, setV2] = useState<boolean>(pricingV2Active());
  const ran = useRef(false);

  const processor = params.get('processor') as 'stripe' | 'paypal' | null;
  const invoiceId = params.get('invoice_id') || '';
  const eventId = params.get('event_id') || '';
  const flow = params.get('flow') || 'client_to_vendor';
  const kind = params.get('kind') || 'full';
  // Stripe returns session_ref (we templated it); PayPal appends ?token=ORDERID.
  const sessionRef = params.get('session_ref') || params.get('token') || '';
  const cancelled = params.get('status') === 'cancel';

  useEffect(() => {
    let on = true;
    apiGet<{ pricing_v2?: boolean; platform_fee_rate?: number }>('/payments/processors')
      .then((r) => { if (!on) return; setPricingV2FromServer(r); setV2(pricingV2Active()); })
      .catch(() => { /* keep build-time default */ });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (cancelled) { setPhase('cancelled'); return; }
    if (!processor || !sessionRef) { setPhase('error'); setMessage('Missing checkout reference.'); return; }
    apiSend<{ payment: { amount: string | null }; paid: boolean }>('POST', '/payments/capture', {
      processor, session_ref: sessionRef, invoice_id: invoiceId || null, event_id: eventId || null, flow, kind,
    })
      .then((r) => {
        setAmount(Number(r.payment?.amount ?? 0));
        setPhase('success');
      })
      .catch((e) => { setPhase('error'); setMessage((e as Error)?.message ?? 'We could not confirm the payment.'); });
  }, [processor, sessionRef, invoiceId, eventId, flow, kind, cancelled]);

  const money = (n: number | null) =>
    n == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const backToInvoice = () => nav(invoiceId ? `/invoices/${invoiceId}` : '/invoices');

  return (
    <div className="dppr">
      <style>{CSS}</style>
      <div className="dppr-card">
        <div className="dppr-mark">D</div>
        {phase === 'working' && (
          <>
            <div className="dppr-spin" aria-hidden="true" />
            <h1>Confirming your payment</h1>
            <p>One moment while we finalize the transaction securely.</p>
          </>
        )}
        {phase === 'success' && (
          <>
            <div className="dppr-check" aria-hidden="true">&#10003;</div>
            <h1>Payment received</h1>
            <p>{amount ? `Thank you. We received ${money(amount)}.` : 'Thank you. Your payment is confirmed.'} A receipt is recorded on your account.</p>
            {amount ? (
              v2 ? (
                <div className="dppr-v2fb">
                  <div className="dppr-v2row"><span>Vendor receives (their full quote)</span><strong>{usd(decomposeClientTotal(amount).subtotal)}</strong></div>
                  <div className="dppr-v2row"><span>{feeLineLabel()}</span><strong>{usd(decomposeClientTotal(amount).platformFee)}</strong></div>
                  <div className="dppr-v2row dppr-v2total"><span>You paid</span><strong>{usd(amount)}</strong></div>
                  <p className="dppr-v2note">The {feeLineLabel().toLowerCase()} was added on top of the vendor's price. Your vendor receives their full quoted amount.</p>
                </div>
              ) : (
                <FeeBreakdown amountCents={Math.round(amount * 100)} title="Fee transparency" />
              )
            ) : null}
            <div className="dppr-actions">
              <button className="dppr-btn primary" onClick={backToInvoice}>View invoice</button>
              <button className="dppr-btn ghost" onClick={() => nav('/app')}>Go to dashboard</button>
            </div>
          </>
        )}
        {phase === 'cancelled' && (
          <>
            <div className="dppr-x" aria-hidden="true">&times;</div>
            <h1>Checkout cancelled</h1>
            <p>No payment was taken. You can return to the invoice and try again whenever you are ready.</p>
            <div className="dppr-actions">
              <button className="dppr-btn primary" onClick={backToInvoice}>Back to invoice</button>
            </div>
          </>
        )}
        {phase === 'error' && (
          <>
            <div className="dppr-x" aria-hidden="true">!</div>
            <h1>We could not confirm the payment</h1>
            <p>{message} If you were charged, it will be reconciled automatically. Please check the invoice or contact support.</p>
            <div className="dppr-actions">
              <button className="dppr-btn primary" onClick={backToInvoice}>Back to invoice</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.dppr{min-height:100vh;display:grid;place-items:center;background:radial-gradient(120% 120% at 30% 0%,#1E5D4A,#123c2e 60%,#0c2a20);padding:24px;font-family:Inter,system-ui,sans-serif}
.dppr-card{background:#fff;border-radius:20px;max-width:460px;width:100%;padding:44px 36px;text-align:center;box-shadow:0 40px 80px -36px rgba(0,0,0,.5)}
.dppr-mark{width:46px;height:46px;border-radius:11px;background:#123c2e;color:#C9A35B;display:grid;place-items:center;font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:26px;margin:0 auto 22px}
.dppr-card h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#123c2e;margin:6px 0 8px;font-weight:600}
.dppr-card p{font-size:14.5px;color:#7d776c;line-height:1.6;margin:0}
.dppr-spin{width:38px;height:38px;border-radius:50%;border:3px solid #e7e1d6;border-top-color:#1E5D4A;margin:0 auto 18px;animation:dpprspin .9s linear infinite}
@keyframes dpprspin{to{transform:rotate(360deg)}}
.dppr-check{width:52px;height:52px;border-radius:50%;background:#e7f3ec;color:#1f7a4d;display:grid;place-items:center;font-size:26px;margin:0 auto 16px}
.dppr-x{width:52px;height:52px;border-radius:50%;background:#f4ece0;color:#8a6d1a;display:grid;place-items:center;font-size:28px;margin:0 auto 16px}
.dppr-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px}
.dppr-btn{font:inherit;font-size:13.5px;font-weight:600;padding:11px 20px;border-radius:11px;cursor:pointer;border:1px solid transparent}
.dppr-btn.primary{background:#123c2e;color:#fff}
.dppr-btn.ghost{background:transparent;color:#123c2e;border-color:#e7e1d6}
.dppr-btn.ghost:hover{border-color:#123c2e}
.dppr-v2fb{margin:18px auto 0;max-width:340px;text-align:left;border:1px solid #e7e1d6;border-radius:12px;padding:14px 16px}
.dppr-v2row{display:flex;justify-content:space-between;gap:14px;font-size:13px;color:#2c2a26;padding:6px 0;border-bottom:1px solid #e7e1d6}
.dppr-v2row:last-of-type{border-bottom:0}
.dppr-v2row strong{font-variant-numeric:tabular-nums}
.dppr-v2total{font-weight:700;color:#123c2e;border-top:2px solid #123c2e;border-bottom:0;margin-top:4px;padding-top:10px}
.dppr-v2note{font-size:11px;color:#7d776c;line-height:1.5;margin:10px 0 0}
`;
