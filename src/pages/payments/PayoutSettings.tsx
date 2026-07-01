/**
 * Payout setup. A vendor/venue connects where they get paid so that client
 * payments split automatically: Stripe Connect (their net auto-transfers, the
 * Divini platform fee is kept) and/or a PayPal payout email. Route:
 * /payouts/setup. Zero em dashes.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

type Account = {
  processor: 'stripe' | 'paypal';
  external_id: string | null;
  email: string | null;
  status: string;
  payouts_enabled: boolean;
  details_submitted: boolean;
};
type StatusResp = { accounts: Account[]; processors: { stripe: boolean; paypal: boolean } };

export default function PayoutSettings() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<StatusResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ppEmail, setPpEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<StatusResp>('/payments/connect/status');
      setData(r);
      const pp = r.accounts.find((a) => a.processor === 'paypal');
      if (pp?.email) setPpEmail(pp.email);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Could not load payout settings');
    }
  }, []);

  useEffect(() => {
    // Returning from Stripe onboarding: sync status, then drop the query flag.
    const back = params.get('connected') === 'stripe' || params.get('refresh') === 'stripe';
    (async () => {
      if (back) {
        try { await apiGet('/payments/connect/stripe/refresh'); setMsg('Stripe details synced.'); } catch { /* ignore */ }
        params.delete('connected'); params.delete('refresh'); setParams(params, { replace: true });
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stripe = data?.accounts.find((a) => a.processor === 'stripe');
  const paypal = data?.accounts.find((a) => a.processor === 'paypal');

  async function connectStripe() {
    setBusy('stripe'); setErr(null);
    try {
      const r = await apiSend<{ url: string }>('POST', '/payments/connect/stripe/onboard', {});
      window.location.href = r.url;
    } catch (e) {
      setErr((e as Error)?.message ?? 'Could not start Stripe onboarding');
      setBusy(null);
    }
  }

  async function savePaypal() {
    setBusy('paypal'); setErr(null); setMsg(null);
    try {
      await apiSend('POST', '/payments/connect/paypal', { email: ppEmail.trim() });
      setMsg('PayPal payout email saved.');
      await load();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Could not save PayPal email');
    } finally {
      setBusy(null);
    }
  }

  const badge = (ok: boolean, label: string) => (
    <span className={'dps-badge ' + (ok ? 'ok' : 'pend')}>{label}</span>
  );

  return (
    <div className="dps">
      <style>{CSS}</style>
      <div className="dps-wrap">
        <button className="dps-link" onClick={() => nav('/app')}>Back to dashboard</button>
        <h1>Get paid automatically</h1>
        <p className="dps-lead">
          Connect where you receive money and client payments will split on their own. Your net
          arrives in your account and the Divini platform fee is handled for you. No manual payouts.
        </p>
        {err ? <div className="dps-alert err">{err}</div> : null}
        {msg ? <div className="dps-alert ok">{msg}</div> : null}

        <div className="dps-grid">
          {/* Stripe */}
          <div className="dps-card">
            <div className="dps-card-head">
              <h2>Card payments via Stripe</h2>
              {stripe ? badge(stripe.payouts_enabled, stripe.payouts_enabled ? 'Active' : 'Onboarding') : badge(false, 'Not connected')}
            </div>
            <p>Onboard once with Stripe. Card payments to you are split automatically: your net transfers to your bank, the platform fee stays with Divini.</p>
            {!data?.processors.stripe ? (
              <div className="dps-muted">Stripe is not enabled on this environment yet.</div>
            ) : stripe?.payouts_enabled ? (
              <div className="dps-ok-row">
                <span>Payouts active. You are all set for automatic splits.</span>
                <button className="dps-btn ghost" disabled={busy === 'stripe'} onClick={connectStripe}>Update details</button>
              </div>
            ) : (
              <button className="dps-btn primary" disabled={busy === 'stripe'} onClick={connectStripe}>
                {busy === 'stripe' ? 'Opening Stripe...' : stripe ? 'Continue onboarding' : 'Connect Stripe'}
              </button>
            )}
          </div>

          {/* PayPal */}
          <div className="dps-card">
            <div className="dps-card-head">
              <h2>PayPal payouts</h2>
              {paypal ? badge(paypal.payouts_enabled, paypal.payouts_enabled ? 'Active' : 'Pending') : badge(false, 'Not set')}
            </div>
            <p>Add your PayPal email. When a client pays with PayPal, your net is sent there automatically right after the payment clears.</p>
            {!data?.processors.paypal ? (
              <div className="dps-muted">PayPal is not enabled on this environment yet.</div>
            ) : (
              <div className="dps-field">
                <input
                  type="email"
                  placeholder="payouts@yourbusiness.com"
                  value={ppEmail}
                  onChange={(e) => setPpEmail(e.target.value)}
                />
                <button className="dps-btn primary" disabled={busy === 'paypal' || !ppEmail.trim()} onClick={savePaypal}>
                  {busy === 'paypal' ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="dps-note">
          Funds split at the moment a client pays. Until you connect a payout method, payments are
          held by Divini and tracked on your payments page for manual release.
        </div>
      </div>
    </div>
  );
}

const CSS = `
.dps{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--mut:#7d776c;--line:#e7e1d6;background:var(--ivory);min-height:100vh;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.dps-wrap{max-width:880px;margin:0 auto;padding:40px 24px 80px}
.dps-link{background:none;border:none;color:var(--em);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0;margin-bottom:18px}
.dps h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;color:var(--em);margin:0 0 8px;font-weight:600}
.dps-lead{font-size:15.5px;color:var(--mut);line-height:1.6;max-width:640px;margin:0 0 24px}
.dps-alert{border-radius:11px;padding:11px 15px;font-size:13.5px;margin-bottom:16px}
.dps-alert.err{background:#fbeceb;color:#b3261e}
.dps-alert.ok{background:#e7f3ec;color:#1f7a4d}
.dps-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.dps-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px 22px;display:flex;flex-direction:column;gap:12px}
.dps-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dps-card h2{font-size:19px;color:var(--em);margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-weight:600}
.dps-card p{font-size:13.5px;color:var(--mut);line-height:1.55;margin:0;flex:1}
.dps-badge{font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:4px 10px;border-radius:20px;white-space:nowrap}
.dps-badge.ok{background:#e7f3ec;color:#1f7a4d}
.dps-badge.pend{background:#f4ece0;color:#8a6d1a}
.dps-btn{font:inherit;font-size:13.5px;font-weight:600;padding:11px 18px;border-radius:11px;cursor:pointer;border:1px solid transparent}
.dps-btn.primary{background:var(--em);color:#fff}
.dps-btn.primary:disabled{opacity:.55;cursor:not-allowed}
.dps-btn.ghost{background:transparent;color:var(--em);border-color:var(--line)}
.dps-ok-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13.5px;color:var(--ink)}
.dps-field{display:flex;gap:8px}
.dps-field input{flex:1;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}
.dps-field input:focus{outline:none;border-color:var(--em2)}
.dps-muted{font-size:13px;color:var(--mut);font-style:italic}
.dps-note{margin-top:22px;font-size:12.5px;color:var(--mut);line-height:1.6;background:#fff;border:1px dashed var(--line);border-radius:12px;padding:14px 16px}
@media(max-width:720px){.dps-grid{grid-template-columns:1fr}}
`;
