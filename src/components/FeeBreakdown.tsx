import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * FeeBreakdown (Fee Transparency, Module 3) - a reusable, drop-in fee summary
 * for checkout / pay surfaces. It shows, BEFORE a transaction completes:
 *   - Transaction amount
 *   - Platform fee (with the rate, and a "cap applied" note when the cap bites)
 *   - Processing fee (clearly labelled an ESTIMATE)
 *   - Total payout to the recipient
 *
 * Usage:
 *   <FeeBreakdown amountCents={150000} />            // self-fetches /fees/preview
 *   <FeeBreakdown amountCents={150000} plan="partner" />
 *   <FeeBreakdown breakdown={preFetchedBreakdown} /> // render a value you already have
 *
 * When `breakdown` is not supplied it self-fetches GET /api/fees/preview using
 * `amountCents` (+ optional `plan`). Graceful loading / empty / error states.
 *
 * Luxury Divini theme (emerald / gold / ivory). Self-contained styles.
 *
 * Zero em dashes.
 */

export interface FeeBreakdownData {
  amountCents: number;
  plan: string;
  feeRate: number;
  capCents: number | null;
  platformFeeCents: number;
  capApplied: boolean;
  processingFeeCents: number;
  processingFeeIsEstimate: boolean;
  totalDeductedCents: number;
  payoutCents: number;
}

type Props = {
  /** The transaction amount in integer cents (drives the self-fetch). */
  amountCents?: number;
  /** Optional explicit plan to preview (free | partner | premier | enterprise). */
  plan?: string;
  /** A pre-fetched breakdown; when given, no fetch happens. */
  breakdown?: FeeBreakdownData;
  /** Optional heading label. */
  title?: string;
};

function money(cents: number): string {
  const v = Number.isFinite(cents) ? cents : 0;
  return (v / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  partner: 'Partner',
  premier: 'Premier',
  enterprise: 'Enterprise',
};

export default function FeeBreakdown({ amountCents, plan, breakdown, title }: Props) {
  const [data, setData] = useState<FeeBreakdownData | null>(breakdown ?? null);
  const [loading, setLoading] = useState(!breakdown);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (breakdown) {
      setData(breakdown);
      setLoading(false);
      return;
    }
    if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) {
      setData(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ amount: String(Math.round(amountCents)) });
    if (plan) qs.set('plan', plan);
    apiGet<FeeBreakdownData>(`/fees/preview?${qs.toString()}`)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setErr((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [amountCents, plan, breakdown]);

  return (
    <div className="dp-fb">
      <style>{FB_CSS}</style>
      <div className="dp-fb-head">
        <span className="dp-fb-kicker">Fee Transparency</span>
        <h4 className="dp-fb-title">{title ?? 'Before you continue'}</h4>
      </div>

      {loading ? (
        <p className="dp-fb-muted">Calculating your breakdown...</p>
      ) : err ? (
        <p className="dp-fb-err">We could not load the fee breakdown. {err}</p>
      ) : !data ? (
        <p className="dp-fb-muted">Enter an amount to see the full fee breakdown.</p>
      ) : (
        <>
          <dl className="dp-fb-rows">
            <div className="dp-fb-row">
              <dt>Transaction amount</dt>
              <dd>{money(data.amountCents)}</dd>
            </div>
            <div className="dp-fb-row">
              <dt>
                Platform fee
                <span className="dp-fb-tag">
                  {PLAN_LABEL[data.plan] ?? data.plan} &middot; {(data.feeRate * 100).toFixed(2)}%
                </span>
                {data.capApplied && data.capCents != null ? (
                  <span className="dp-fb-cap">Cap applied ({money(data.capCents)})</span>
                ) : null}
              </dt>
              <dd className="dp-fb-deduct">-{money(data.platformFeeCents)}</dd>
            </div>
            <div className="dp-fb-row">
              <dt>
                Processing fee
                <span className="dp-fb-est">estimate</span>
              </dt>
              <dd className="dp-fb-deduct">-{money(data.processingFeeCents)}</dd>
            </div>
            <div className="dp-fb-row dp-fb-total">
              <dt>Estimated payout</dt>
              <dd>{money(data.payoutCents)}</dd>
            </div>
          </dl>
          <p className="dp-fb-note">
            The processing fee is an estimate (about 2.9% + 30&cent;); the exact amount is set by
            the payment processor at the time of payment.
          </p>
        </>
      )}
    </div>
  );
}

const FB_CSS = `
.dp-fb {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
  border: 1px solid var(--dp-line); border-radius: 14px; background: #fff;
  padding: 18px 20px; max-width: 460px;
}
.dp-fb *, .dp-fb *::before, .dp-fb *::after { box-sizing: border-box; }
.dp-fb-head { margin-bottom: 12px; }
.dp-fb-kicker { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dp-fb-title { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 22px; color: var(--dp-emerald); margin: 2px 0 0; }
.dp-fb-muted { color: var(--dp-muted); font-size: 13px; margin: 4px 0; }
.dp-fb-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.dp-fb-rows { margin: 0; display: flex; flex-direction: column; }
.dp-fb-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--dp-line); }
.dp-fb-row:last-child { border-bottom: 0; }
.dp-fb-row dt { font-size: 13px; color: var(--dp-ink); display: flex; flex-direction: column; gap: 3px; }
.dp-fb-row dd { margin: 0; font-size: 13.5px; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--dp-ink); white-space: nowrap; }
.dp-fb-deduct { color: #9a5a3a; }
.dp-fb-tag { font-size: 10.5px; color: var(--dp-muted); font-weight: 500; }
.dp-fb-cap { font-size: 10.5px; color: var(--dp-gold); font-weight: 600; }
.dp-fb-est { font-size: 9.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-gold); background: rgba(201,163,91,.12); border: 1px solid rgba(201,163,91,.4); border-radius: 999px; padding: 1px 7px; width: fit-content; font-weight: 600; }
.dp-fb-total { margin-top: 4px; border-top: 2px solid var(--dp-emerald); padding-top: 12px; }
.dp-fb-total dt { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 600; color: var(--dp-emerald); }
.dp-fb-total dd { font-size: 17px; color: var(--dp-emerald); }
.dp-fb-note { margin: 12px 0 0; font-size: 11px; line-height: 1.5; color: var(--dp-muted); }
`;
