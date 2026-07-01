import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * PartnerPortal (Module 1) - a partner's self-view. Shows their referral
 * link/code, referred accounts, eligible/earned commissions, pending + paid
 * payout totals, and payment-method status. Client financial detail is never
 * shown: only the partner's own commission amounts and the source label.
 */
type PortalPartner = {
  id: string; name: string | null; company: string | null; partner_type: string | null;
  referral_code: string | null; referral_link: string | null; commission_type: string | null;
  revenue_share_pct: number; subscription_mode: string | null; duration_kind: string | null;
  status: string | null; effective_date: string | null; expiration_date: string | null;
};
type ReferredAccount = { org_name: string | null; org_type: string | null; attribution: string; referred_at: string };
type Commission = { id: string; source: string; net_profit_cents: number; share_pct: number; commission_cents: number; status: string; excluded: boolean; created_at: string };
type Totals = { pending_cents: number; approved_cents: number; paid_cents: number; earned_cents: number; count: number };
type PayoutStatus = { onboarding_status: string | null; payout_method: string | null; has_payout_method: boolean; available: boolean };
type Portal = {
  is_partner: boolean;
  partner?: PortalPartner;
  referred_accounts?: ReferredAccount[];
  commissions?: Commission[];
  totals?: Totals;
  payout_status?: PayoutStatus;
};

const money = (cents: number | null | undefined) =>
  `$${(Number(cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PartnerPortal() {
  const [data, setData] = useState<Portal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try { setData(await apiGet<Portal>('/partner-portal')); }
      catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  async function copyLink() {
    const link = data?.partner?.referral_link;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard unavailable */ }
  }

  if (loading) return <div className="pp"><style>{PP_CSS}</style><p className="pp-muted">Loading your partner portal...</p></div>;
  if (err) return <div className="pp"><style>{PP_CSS}</style><p className="pp-err">{err}</p></div>;

  if (!data || !data.is_partner || !data.partner) {
    return (
      <div className="pp">
        <style>{PP_CSS}</style>
        <header className="pp-head">
          <span className="pp-kicker">Partner Program</span>
          <h1 className="pp-title">Partner Portal</h1>
        </header>
        <div className="pp-empty">
          <p>Your account is not enrolled as a revenue-share partner yet.</p>
          <p className="pp-muted">Once a Divini administrator enrolls you, your referral link and commissions will appear here.</p>
        </div>
      </div>
    );
  }

  const p = data.partner;
  const totals = data.totals ?? { pending_cents: 0, approved_cents: 0, paid_cents: 0, earned_cents: 0, count: 0 };
  const accounts = data.referred_accounts ?? [];
  const commissions = data.commissions ?? [];
  const payout = data.payout_status;

  return (
    <div className="pp">
      <style>{PP_CSS}</style>
      <header className="pp-head">
        <span className="pp-kicker">Partner Program</span>
        <h1 className="pp-title">{p.name || p.company || 'Partner Portal'}</h1>
        <p className="pp-sub">Your referral link, referred accounts, and earned commissions.</p>
      </header>

      <div className="pp-linkcard">
        <div>
          <span className="pp-label">Your referral link</span>
          <p className="pp-link">{p.referral_link || '-'}</p>
          <span className="pp-code">Code: <code>{p.referral_code}</code></span>
        </div>
        <button type="button" className="pp-btn" onClick={copyLink} disabled={!p.referral_link}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>

      <div className="pp-stats">
        <div className="pp-stat"><span>Earned</span><strong>{money(totals.earned_cents)}</strong></div>
        <div className="pp-stat"><span>Pending</span><strong>{money(totals.pending_cents)}</strong></div>
        <div className="pp-stat"><span>Paid</span><strong>{money(totals.paid_cents)}</strong></div>
        <div className="pp-stat"><span>Referred accounts</span><strong>{accounts.length}</strong></div>
      </div>

      <div className="pp-payout">
        <span className="pp-label">Payment method</span>
        {!payout || !payout.available ? (
          <p className="pp-muted">Payout setup is not available yet. Your earned commissions are tracked and will be payable once payouts are enabled.</p>
        ) : payout.has_payout_method ? (
          <p className="pp-ok">Connected{payout.payout_method ? ` via ${payout.payout_method}` : ''}{payout.onboarding_status ? ` (${payout.onboarding_status})` : ''}.</p>
        ) : (
          <p className="pp-warn">No payout method on file yet. Add one to receive your commissions.</p>
        )}
      </div>

      <section>
        <h2 className="pp-h2">Referred accounts</h2>
        {accounts.length === 0 ? <p className="pp-muted">No referred accounts yet. Share your link to start earning.</p> : (
          <div className="pp-mini">
            {accounts.map((a, i) => (
              <div key={i} className="pp-minirow">
                <span className="pp-name">{a.org_name || 'Referred account'}</span>
                <span className="pp-cap">{a.org_type || '-'}</span>
                <span className="pp-badge">{a.attribution.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="pp-h2">Commissions</h2>
        {commissions.length === 0 ? <p className="pp-muted">No commissions recorded yet.</p> : (
          <div className="pp-mini">
            <div className="pp-minirow pp-minihead"><span>Source</span><span>Share</span><span>Commission</span><span>Status</span></div>
            {commissions.filter((c) => !c.excluded).map((c) => (
              <div key={c.id} className="pp-minirow">
                <span className="pp-cap">{c.source.replace(/_/g, ' ')}</span>
                <span>{Number(c.share_pct)}%</span>
                <span className="pp-amt">{money(c.commission_cents)}</span>
                <span><span className={`pp-badge st-${c.status}`}>{c.status}</span></span>
              </div>
            ))}
          </div>
        )}
        <p className="pp-note">Commissions are a share of Divini's net profit on each referred transaction. Client invoice amounts are private.</p>
      </section>
    </div>
  );
}

const PP_CSS = `
.pp {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.pp *, .pp *::before, .pp *::after { box-sizing: border-box; }
.pp h1, .pp h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.pp-head { margin-bottom: 18px; }
.pp-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.pp-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.pp-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); }
.pp-muted { color: var(--dp-muted); font-size: 13px; }
.pp-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.pp-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.pp-empty p { margin: 0 0 6px; font-size: 14px; }
.pp-label { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.pp-linkcard { display: flex; justify-content: space-between; align-items: center; gap: 14px; border: 1px solid var(--dp-line); border-radius: 14px; background: #fff; padding: 16px 18px; margin-bottom: 16px; flex-wrap: wrap; }
.pp-link { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--dp-emerald-2); word-break: break-all; margin: 4px 0; }
.pp-code { font-size: 12px; color: var(--dp-muted); }
.pp-code code { font-family: ui-monospace, Menlo, monospace; color: var(--dp-ink); }
.pp-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; cursor: pointer; }
.pp-btn:hover { background: var(--dp-emerald-2); }
.pp-btn:disabled { opacity: .6; cursor: default; }
.pp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.pp-stat { border: 1px solid var(--dp-line); border-radius: 12px; padding: 12px 14px; background: rgba(247,244,238,.5); }
.pp-stat span { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); display: block; }
.pp-stat strong { font-size: 20px; color: var(--dp-emerald); }
.pp-payout { border: 1px solid var(--dp-line); border-radius: 12px; padding: 14px 16px; background: #fff; margin-bottom: 22px; }
.pp-payout p { margin: 6px 0 0; font-size: 13px; }
.pp-ok { color: #1E5D4A; }
.pp-warn { color: #8a6d27; }
.pp-h2 { font-size: 22px; color: var(--dp-emerald); margin: 0 0 10px; }
.pp section { margin-bottom: 22px; }
.pp-mini { display: flex; flex-direction: column; border: 1px solid var(--dp-line); border-radius: 12px; overflow: hidden; background: #fff; }
.pp-minirow { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--dp-line); font-size: 13px; align-items: center; }
.pp-minirow:last-child { border-bottom: 0; }
.pp-minihead { background: rgba(18,60,46,.04); font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; }
.pp-name { font-weight: 600; color: var(--dp-emerald); }
.pp-cap { text-transform: capitalize; }
.pp-amt { font-weight: 600; color: var(--dp-emerald); }
.pp-badge { font-size: 10px; letter-spacing: .4px; text-transform: capitalize; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; display: inline-block; }
.pp-badge.st-paid, .pp-badge.st-approved { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.pp-badge.st-pending { background: #f3efe6; color: #8a6d27; border-color: rgba(201,163,91,.4); }
.pp-note { font-size: 11.5px; color: var(--dp-muted); margin-top: 10px; line-height: 1.6; }
@media (max-width: 760px) {
  .pp-stats { grid-template-columns: 1fr 1fr; }
  .pp-minirow { grid-template-columns: 1fr 1fr; }
}
`;
