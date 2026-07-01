import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - F7 Founding Member Performance Center.
 *
 * A premium KPI dashboard for the signed-in org: revenue generated, referrals,
 * leads, quotes, projects won, commissions, savings, marketplace rank, activity
 * score, response time, and a composite performance score. Below it, the
 * founding-member benefit flags (priority placement / matching, enhanced
 * analytics, lifetime pricing, badge, exclusive opportunities) with a toggle to
 * claim / update founding status.
 *
 * All numbers are aggregated server-side from the existing tables and scored by
 * the pure module; this page only renders them via src/lib/api.ts.
 */

type Performance = {
  revenueGenerated: number;
  referrals: number;
  leads: number;
  quotes: number;
  projectsWon: number;
  commissions: number;
  savings: number;
  marketplaceRank: number;
  activityScore: number;
  responseTime: number;
  performanceScore: number;
  winRate: number;
};

type PerformanceResult = { orgId: string; metrics: unknown; performance: Performance };

type Benefits = {
  priorityPlacement: boolean;
  priorityMatching: boolean;
  enhancedAnalytics: boolean;
  lifetimePricing: boolean;
  foundingBadge: boolean;
  exclusiveOpportunities: boolean;
};

type Status = {
  orgId: string;
  isFounding: boolean;
  benefits: Benefits;
  joinedAt: string | null;
};

const money = (n: unknown): string => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const numFmt = (n: unknown): string => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '-';
};

const BENEFIT_LABELS: [keyof Benefits, string, string][] = [
  ['priorityPlacement', 'Priority placement', 'Surfaced first in search and listings.'],
  ['priorityMatching', 'Priority matching', 'First in line for partnership matches.'],
  ['enhancedAnalytics', 'Enhanced analytics', 'Full performance + audience intelligence.'],
  ['lifetimePricing', 'Lifetime pricing', 'Founding rate locked in for life.'],
  ['foundingBadge', 'Founding badge', 'Founding-member badge across your profile.'],
  ['exclusiveOpportunities', 'Exclusive opportunities', 'Access to invite-only opportunities.'],
];

export default function FoundingMemberCenter() {
  const [perf, setPerf] = useState<Performance | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [p, s] = await Promise.all([
        apiGet<PerformanceResult>('/founding-member/performance'),
        apiGet<{ status: Status }>('/founding-member/status'),
      ]);
      setPerf(p.performance);
      setStatus(s.status);
    } catch (e) {
      setErr((e as Error).message ?? 'Could not load the performance center.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function claimFounding() {
    if (!status) return;
    setSaving(true);
    setErr('');
    try {
      const res = await apiSend<{ status: Status }>('POST', '/founding-member/status', {
        isFounding: true,
        benefits: status.benefits,
      });
      setStatus(res.status);
    } catch (e) {
      setErr((e as Error).message ?? 'Could not update founding status.');
    } finally {
      setSaving(false);
    }
  }

  const cards: [string, string][] = perf
    ? [
        ['Revenue generated', money(perf.revenueGenerated)],
        ['Referrals', numFmt(perf.referrals)],
        ['Leads', numFmt(perf.leads)],
        ['Quotes', numFmt(perf.quotes)],
        ['Projects won', numFmt(perf.projectsWon)],
        ['Commissions', money(perf.commissions)],
        ['Savings', money(perf.savings)],
        ['Marketplace rank', perf.marketplaceRank > 0 ? `#${perf.marketplaceRank}` : '-'],
        ['Activity score', `${perf.activityScore}/100`],
        ['Response time', perf.responseTime > 0 ? `${perf.responseTime}h` : '-'],
        ['Win rate', `${Math.round(perf.winRate * 100)}%`],
        ['Performance score', `${perf.performanceScore}/100`],
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Founding Member Performance Center</h1>
          <div className="sub">
            Your compounding value on Divini Partners - revenue, referrals, wins, and rank.
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {loading && <div className="note">Loading…</div>}

      {status?.isFounding && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--gold, #c9a24b)' }}>
          <strong>Founding Member</strong>
          {status.joinedAt && (
            <span className="note"> since {new Date(status.joinedAt).toLocaleDateString()}</span>
          )}
        </div>
      )}

      <div
        className="stat-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {cards.map(([label, value]) => (
          <div className="card" key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
            <div className="note">{label}</div>
          </div>
        ))}
      </div>

      <div className="sectitle">Founding member benefits</div>
      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 12,
          }}
        >
          {BENEFIT_LABELS.map(([key, label, desc]) => {
            const on = !!status?.benefits?.[key];
            return (
              <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span aria-hidden style={{ color: on ? 'var(--ok, #2f9e44)' : 'var(--muted, #aaa)' }}>
                  {on ? '✓' : '○'}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div className="note">{desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {status && !status.isFounding && (
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={saving} onClick={claimFounding}>
              {saving ? 'Saving…' : 'Activate founding membership'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
