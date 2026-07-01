/**
 * ConnectPayoutSettings - the signed-in partner's Stripe Connect onboarding
 * state for the split-payout rail. Route: /connect-payouts/settings.
 *
 * "Connect bank account (Stripe)" opens a Stripe-hosted onboarding link; we show
 * the resulting payouts-enabled flag and the masked bank last4 that Stripe
 * returns. Banking is handled entirely by Stripe; Divini Partners NEVER stores
 * account or routing numbers. No money moves on this page.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

type ConnectAccount = {
  id: string;
  stripe_account_id: string | null;
  status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  bank_last4: string | null;
  country: string | null;
  default_currency: string | null;
};

const STYLES = `
.cps{--emerald:#1E5D4A;--emerald-deep:#123c2e;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;font-family:Inter,system-ui,sans-serif;color:var(--ink);max-width:840px}
.cps h1{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);font-size:30px;margin:0}
.cps .sub{font-size:13px;color:var(--muted);margin-top:3px}
.cps .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.cps .note{font-size:12.5px;color:var(--muted);line-height:1.5}
.cps .grid{display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.cps .col{flex:1;min-width:160px}
.cps .lbl{font-size:11px;color:var(--muted);font-weight:600}
.cps .badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep);margin-top:4px}
.cps .badge.green{background:#eef6f1;border-color:#cfe6da;color:var(--emerald-deep)}
.cps .badge.amber{background:#fcf6e8;border-color:#ecddb6;color:#7a5b1f}
.cps .badge.red{background:#fbeeee;border-color:#ecd2d2;color:#7a3030}
.cps .btn{border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:13px;font-weight:600;padding:9px 14px;border-radius:9px;cursor:pointer}
.cps .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.cps .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.cps .btn:disabled{opacity:.5;cursor:not-allowed}
.cps .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-bottom:14px}
.cps .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.cps .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.cps .infra{font-size:12px;color:var(--muted);background:var(--ivory);border:1px solid var(--line);border-radius:9px;padding:11px 13px;margin-bottom:14px;line-height:1.5}
`;

const BADGE: Record<string, string> = {
  not_started: '',
  onboarding: 'amber',
  restricted: 'amber',
  enabled: 'green',
  disabled: 'red',
};

export default function ConnectPayoutSettings() {
  const { session } = useAuth();
  const [account, setAccount] = useState<ConnectAccount | null>(null);
  const [isPartner, setIsPartner] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await apiGet<{ configured: boolean; account: ConnectAccount | null; is_partner: boolean }>(
        '/connect-payouts/connect/status',
      );
      setAccount(d.account);
      setConfigured(d.configured);
      setIsPartner(d.is_partner !== false);
    } catch (e: any) {
      setErr(e.message ?? 'Could not load payout status.');
    }
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) return <div className="cps"><div className="card">Sign in to manage payouts.</div></div>;

  async function connect() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const d = await apiSend<{ configured: boolean; url?: string; message?: string }>(
        'POST',
        '/connect-payouts/connect/start',
        {},
      );
      if (d.configured && d.url) {
        window.open(d.url, '_blank', 'noopener');
        setMsg('Stripe onboarding opened in a new tab. Finish there, then refresh status.');
      } else {
        setConfigured(false);
        setMsg(d.message ?? 'Stripe is not connected yet.');
      }
    } catch (e: any) {
      setErr(e.message ?? 'Could not start Stripe onboarding.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cps" style={{ padding: 24 }}>
      <style>{STYLES}</style>
      <h1>Payout Bank Account</h1>
      <div className="sub">
        Connect a bank account to receive your referral revenue-share payouts by direct deposit
        through Stripe.
      </div>

      <div style={{ height: 16 }} />

      <div className="infra">
        Banking is handled by Stripe. Divini Partners never stores your bank account or routing
        numbers. You enter them on Stripe's secure pages; we only keep your Stripe account id and the
        last 4 digits Stripe returns.
      </div>

      {!isPartner && (
        <div className="msg" style={{ background: '#fcf6e8', border: '1px solid #ecddb6', color: '#7a5b1f' }}>
          You do not have a partner record yet, so there is nothing to onboard. Reach out to the team
          to be set up as a referral partner.
        </div>
      )}

      {err && <div className="msg err">{err}</div>}
      {msg && <div className="msg ok">{msg}</div>}

      {!configured && (
        <div className="card">
          <div className="note">
            Stripe payouts are not enabled on this environment yet. Once the platform connects Stripe,
            you will be able to onboard a bank account here.
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid">
          <div className="col">
            <div className="lbl">Status</div>
            <div>
              <span className={'badge ' + (BADGE[account?.status ?? 'not_started'] ?? '')}>
                {account?.status ?? 'not started'}
              </span>
            </div>
          </div>
          <div className="col">
            <div className="lbl">Payouts enabled</div>
            <div>
              <span className={'badge ' + (account?.payouts_enabled ? 'green' : 'amber')}>
                {account?.payouts_enabled ? 'Yes' : 'Not yet'}
              </span>
            </div>
          </div>
          <div className="col">
            <div className="lbl">Bank on file</div>
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              {account?.bank_last4 ? `•••• ${account.bank_last4}` : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={busy || !isPartner} onClick={connect}>
            {account?.stripe_account_id ? 'Continue Stripe onboarding' : 'Connect bank account (Stripe)'}
          </button>
          <button className="btn" disabled={busy} onClick={load}>
            Refresh status
          </button>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          Onboarding opens on Stripe. When you finish, return here and refresh to see payouts enabled.
        </div>
      </div>
    </div>
  );
}
