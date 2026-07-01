import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/api';

/**
 * RevenueCenter (Module 8) - Super Admin revenue dashboard. SUPER-ADMIN.
 * Reads GET /api/revenue-center (deterministic, real-data-only, graceful zeros).
 * Sections: subscription (MRR/ARR), transaction (fees/volume), referral
 * (commissions/credits), marketplace (active orgs/events), growth (conversions,
 * new orgs, churn + LTV estimates - labeled).
 *
 * Route: /admin/revenue-center (SuperAdmin).
 */
type Rev = {
  generated_at: string;
  window_days: number;
  subscription: { mrr_cents: number; arr_cents: number; active_subscriptions: number; by_plan: Record<string, { count: number; mrr_cents: number }>; available: boolean };
  transaction: { platform_fees_dollars: number; estimated_fees_dollars: number; gross_volume_dollars: number; capped_transaction_count: number; payment_count: number; available: boolean; note: string };
  referral: {
    commissions: { pending_cents: number; paid_cents: number; total_cents: number; available: boolean };
    payouts: { sent_cents: number; pending_cents: number; available: boolean };
    credits_outstanding_cents: number; credits_available: boolean;
  };
  accrual: {
    accrued_cents: number; invoiced_cents: number; collected_cents: number;
    waived_cents: number; void_cents: number; referral_split_cents: number;
    row_count: number; available: boolean;
  };
  marketplace: { by_type: Record<string, number>; active_events: number; available: boolean };
  growth: {
    referral_conversions: number; referral_total: number; referral_conversion_rate: number;
    new_organizations: number; window_days: number;
    churn_estimate: number; churn_estimate_is_estimate: boolean;
    ltv_estimate_cents: number; ltv_estimate_is_estimate: boolean;
  };
};

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dollars = (d: number) => `$${d.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function Card({ k, v, d }: { k: string; v: string; d?: string }) {
  return (
    <div className="rc-stat">
      <div className="rc-stat-k">{k}</div>
      <div className="rc-stat-v">{v}</div>
      {d ? <div className="rc-stat-d">{d}</div> : null}
    </div>
  );
}

export default function RevenueCenter() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Rev | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiGet<Rev>('/revenue-center')
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="rc"><style>{RC_CSS}</style><p className="rc-guard">This page is restricted to platform administrators.</p></div>;
  }

  return (
    <div className="rc">
      <style>{RC_CSS}</style>
      <header className="rc-head">
        <div>
          <span className="rc-kicker">Super Admin</span>
          <h1 className="rc-title">Revenue Center</h1>
          <p className="rc-sub">Deterministic rollup of subscription, transaction, referral, marketplace, and growth.</p>
        </div>
        {data ? <span className="rc-asof">As of {new Date(data.generated_at).toLocaleString()}</span> : null}
      </header>

      {err ? <p className="rc-err">{err}</p> : null}

      {loading ? (
        <p className="rc-muted">Loading revenue data...</p>
      ) : !data ? (
        <div className="rc-empty"><p>No revenue data available.</p></div>
      ) : (
        <>
          <div className="rc-sectiontitle">Subscription</div>
          <div className="rc-stats">
            <Card k="MRR" v={money(data.subscription.mrr_cents)} d="active recurring memberships" />
            <Card k="ARR" v={money(data.subscription.arr_cents)} d="MRR x 12" />
            <Card k="Active subscriptions" v={String(data.subscription.active_subscriptions)} d="paid partner / premier orgs" />
            <Card k="Plans" v={String(Object.keys(data.subscription.by_plan).length)} d="distinct paid plans" />
          </div>

          <div className="rc-sectiontitle">Transaction</div>
          <div className="rc-stats">
            <Card k="Platform fees (recorded)" v={dollars(data.transaction.platform_fees_dollars)} d="from payments" />
            <Card k="Platform fees (estimated)" v={dollars(data.transaction.estimated_fees_dollars)} d="for un-recorded fees" />
            <Card k="Gross volume" v={dollars(data.transaction.gross_volume_dollars)} d={`${data.transaction.payment_count} payments`} />
            <Card k="Capped transactions" v={String(data.transaction.capped_transaction_count)} d="hit the fee cap" />
          </div>

          <div className="rc-sectiontitle">Platform revenue accrual</div>
          <div className="rc-stats">
            <Card k="Accrued" v={money(data.accrual.accrued_cents)} d={data.accrual.available ? 'owed, not yet collected' : 'no accrual ledger'} />
            <Card k="Invoiced" v={money(data.accrual.invoiced_cents)} d="rolled into statements" />
            <Card k="Collected" v={money(data.accrual.collected_cents)} d="fees collected" />
            <Card k="Waived" v={money(data.accrual.waived_cents)} d="admin forgave" />
            <Card k="Referral split (accrued)" v={money(data.accrual.referral_split_cents)} d={`${data.accrual.row_count} ledger rows`} />
          </div>

          <div className="rc-sectiontitle">Referral</div>
          <div className="rc-stats">
            <Card k="Commissions pending" v={money(data.referral.commissions.pending_cents)} d="owed to partners" />
            <Card k="Commissions paid" v={money(data.referral.commissions.paid_cents)} d="settled" />
            <Card k="Payouts pending" v={money(data.referral.payouts.pending_cents)} d={data.referral.payouts.available ? 'queued' : 'no payouts table'} />
            <Card k="Credits outstanding" v={money(data.referral.credits_outstanding_cents)} d="unredeemed platform credits" />
          </div>

          <div className="rc-sectiontitle">Marketplace</div>
          <div className="rc-stats">
            {Object.entries(data.marketplace.by_type).map(([t, c]) => (
              <Card key={t} k={t} v={String(c)} d="active organizations" />
            ))}
            <Card k="Active events" v={String(data.marketplace.active_events)} d="not closed / archived" />
          </div>

          <div className="rc-sectiontitle">Growth</div>
          <div className="rc-stats">
            <Card k="Referral conversions" v={String(data.growth.referral_conversions)} d={`of ${data.growth.referral_total} referrals`} />
            <Card k="Conversion rate" v={`${Math.round(data.growth.referral_conversion_rate * 100)}%`} d="referrals converted" />
            <Card k={`New orgs (${data.growth.window_days}d)`} v={String(data.growth.new_organizations)} d="in window" />
            <Card k="Churn (est.)" v={`${Math.round(data.growth.churn_estimate * 100)}%`} d="estimate" />
            <Card k="LTV (est.)" v={money(data.growth.ltv_estimate_cents)} d="estimate, per paying org" />
          </div>

          <p className="rc-note">
            Estimates are labeled and computed deterministically from current data: churn = share of paid orgs marked
            suspended / cancelled; LTV = avg monthly revenue per paying org x estimated lifetime. {data.transaction.note}.
          </p>
        </>
      )}
    </div>
  );
}

const RC_CSS = `
.rc {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.rc *, .rc *::before, .rc *::after { box-sizing: border-box; }
.rc h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.rc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
.rc-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.rc-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.rc-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); max-width: 560px; }
.rc-asof { font-size: 11.5px; color: var(--dp-muted); }
.rc-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.rc-muted { color: var(--dp-muted); font-size: 13px; }
.rc-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.rc-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 36px; background: rgba(247,244,238,.55); text-align: center; }
.rc-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); }
.rc-sectiontitle { font-size: 14px; letter-spacing: .8px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; margin: 18px 0 10px; }
.rc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.rc-stat { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px; }
.rc-stat-k { font-size: 11.5px; color: var(--dp-muted); letter-spacing: .3px; text-transform: capitalize; }
.rc-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; color: var(--dp-emerald); line-height: 1.05; margin: 4px 0 2px; }
.rc-stat-d { font-size: 11px; color: var(--dp-muted); }
.rc-note { margin-top: 18px; font-size: 11.5px; color: var(--dp-muted); line-height: 1.6; }
@media (max-width: 1024px) { .rc-stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .rc-stats { grid-template-columns: 1fr; } }
`;
