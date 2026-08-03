import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { isFeatureLockedError, UpgradePrompt, type FeatureLockedError } from '../lib/entitlements';

/**
 * Vendor Pro - Profitability (margin tracking + job costing). Calls
 * GET /vendor-profitability/report for the revenue/cost/margin roll-up
 * across won jobs, and lets the vendor record their true cost per job
 * inline (POST /vendor-profitability/quotes/:id/cost). Pro-gated at the API
 * layer; this page only renders the lock state, never enforces anything.
 */

type Job = {
  quote_id: string;
  event_id: string | null;
  status: string | null;
  revenue: number;
  cost: number | null;
  margin: number | null;
  margin_pct: number | null;
  created_at: string;
};

type Report = {
  jobs: Job[];
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number | null;
  costRecordedCount: number;
  jobCount: number;
};

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number | null) => (n == null ? '-' : `${Math.round(n * 100)}%`);
const fmtDate = (s: string) => new Date(s).toLocaleDateString();

function CostForm({ quoteId, onSaved }: { quoteId: string; onSaved: (cost: number) => void }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      setErr('Enter a valid cost.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiSend('POST', `/vendor-profitability/quotes/${quoteId}/cost`, { cost_amount: n });
      onSaved(n);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="prof-costform" onSubmit={save}>
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="True cost ($)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
      {err && <span className="prof-costform-err">{err}</span>}
    </form>
  );
}

export default function Profitability() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<FeatureLockedError | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setLockError(null);
    try {
      const res = await apiGet<{ report: Report }>('/vendor-profitability/report');
      setReport(res.report);
    } catch (e) {
      if (isFeatureLockedError(e)) setLockError(e.body);
      else setError((e as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function applyCostLocally(quoteId: string, cost: number) {
    setReport((r) => {
      if (!r) return r;
      const jobs = r.jobs.map((j) =>
        j.quote_id === quoteId
          ? { ...j, cost, margin: j.revenue - cost, margin_pct: j.revenue > 0 ? (j.revenue - cost) / j.revenue : null }
          : j,
      );
      const costed = jobs.filter((j) => j.cost != null);
      const totalCost = costed.reduce((sum, j) => sum + (j.cost ?? 0), 0);
      const costedRevenue = costed.reduce((sum, j) => sum + j.revenue, 0);
      const totalMargin = costedRevenue - totalCost;
      return {
        ...r,
        jobs,
        totalCost,
        totalMargin,
        marginPct: costedRevenue > 0 ? totalMargin / costedRevenue : null,
        costRecordedCount: costed.length,
      };
    });
  }

  return (
    <div className="prof">
      <style>{CSS}</style>

      <header className="prof-head">
        <h1>Profitability</h1>
        <p className="prof-sub">
          What each won job actually earned, after your real costs -- not just the platform fee.
          Record a job's true cost once and its margin tracks automatically.
        </p>
      </header>

      {loading && <p className="prof-muted">Loading.</p>}
      {error && <p className="prof-error">{error}</p>}
      {lockError && <UpgradePrompt error={lockError} />}

      {!loading && !error && !lockError && report && (
        <>
          <div className="prof-stats">
            <div className="prof-stat">
              <div className="prof-stat-k">Revenue (won jobs)</div>
              <div className="prof-stat-v">{fmtMoney(report.totalRevenue)}</div>
            </div>
            <div className="prof-stat">
              <div className="prof-stat-k">Recorded cost</div>
              <div className="prof-stat-v">{fmtMoney(report.totalCost)}</div>
            </div>
            <div className="prof-stat">
              <div className="prof-stat-k">Margin</div>
              <div className="prof-stat-v">{fmtMoney(report.totalMargin)}</div>
            </div>
            <div className="prof-stat">
              <div className="prof-stat-k">Margin %</div>
              <div className="prof-stat-v">{fmtPct(report.marginPct)}</div>
            </div>
          </div>

          {report.jobCount > 0 && report.costRecordedCount < report.jobCount && (
            <p className="prof-coverage">
              Cost recorded for {report.costRecordedCount} of {report.jobCount} won jobs. Totals above
              only include jobs with a recorded cost.
            </p>
          )}

          {report.jobCount === 0 ? (
            <section className="prof-card prof-empty">
              <h2>No won jobs yet</h2>
              <p className="prof-muted">
                Once a quote is accepted or converted, it shows up here so you can track its margin.
              </p>
            </section>
          ) : (
            <section className="prof-card">
              <h2>Jobs</h2>
              <div className="prof-jobs">
                {report.jobs.map((j) => (
                  <div className="prof-job" key={j.quote_id}>
                    <div className="prof-job-top">
                      <span className="prof-job-date">{fmtDate(j.created_at)}</span>
                      <span className="prof-job-status">{j.status}</span>
                    </div>
                    <div className="prof-job-figures">
                      <span>Revenue <strong>{fmtMoney(j.revenue)}</strong></span>
                      {j.cost != null && <span>Cost <strong>{fmtMoney(j.cost)}</strong></span>}
                      {j.margin != null && (
                        <span className={j.margin >= 0 ? 'prof-margin-pos' : 'prof-margin-neg'}>
                          Margin <strong>{fmtMoney(j.margin)} ({fmtPct(j.margin_pct)})</strong>
                        </span>
                      )}
                    </div>
                    {j.cost == null && (
                      <CostForm quoteId={j.quote_id} onSaved={(cost) => applyCostLocally(j.quote_id, cost)} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.prof { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px;
  margin:0 auto; padding:24px 20px 56px; }
.prof *,.prof *::before,.prof *::after { box-sizing:border-box; }
.prof-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.prof-sub { font-size:14px; color:var(--mut); margin:0 0 6px; max-width:680px; line-height:1.5; }
.prof-muted { font-size:12px; color:var(--mut); margin:4px 0 0; }
.prof-error { font-size:13px; color:#9a3a28; margin-top:10px; }
.prof-coverage { font-size:12.5px; color:var(--mut); background:#fff; border:1px solid var(--ln);
  border-radius:10px; padding:10px 14px; margin-top:14px; }

.prof-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:18px; }
.prof-stat { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; }
.prof-stat-k { font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.prof-stat-v { font-size:21px; font-weight:800; color:var(--e); margin-top:2px; }
@media(max-width:700px){ .prof-stats { grid-template-columns:repeat(2,1fr); } }

.prof-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px; margin-top:18px; }
.prof-card h2 { font-size:15px; margin:0 0 12px; color:var(--e); font-weight:700; }
.prof-empty { text-align:center; }

.prof-jobs { display:flex; flex-direction:column; gap:12px; }
.prof-job { border:1px solid var(--ln); border-radius:12px; padding:12px 14px; }
.prof-job-top { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--mut); }
.prof-job-status { text-transform:capitalize; font-weight:700; color:var(--e2); }
.prof-job-figures { display:flex; flex-wrap:wrap; gap:14px; margin-top:8px; font-size:13px; color:var(--mut); }
.prof-job-figures strong { color:var(--ink); }
.prof-margin-pos strong { color:#1E5D4A; }
.prof-margin-neg strong { color:#9a3a28; }

.prof-costform { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center; }
.prof-costform input { border:1px solid var(--ln); border-radius:8px; padding:7px 10px; font-size:13px;
  width:140px; font-family:inherit; }
.prof-costform button { background:var(--e); color:#fff; border:none; border-radius:8px; padding:7px 14px;
  font-size:13px; font-weight:600; cursor:pointer; }
.prof-costform button:disabled { opacity:.6; cursor:default; }
.prof-costform-err { font-size:12px; color:#9a3a28; }

@media(max-width:600px){ .prof { padding:18px 14px 44px; } .prof-head h1 { font-size:22px; } }
`;
