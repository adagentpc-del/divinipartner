import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

/**
 * WinLoss - the Super Admin Win/Loss + setup-efficacy scorecard.
 * Admin-only: reads GET /api/intelligence/winloss. Renders won/lost tiles with
 * win-rate for bids and quotes, a bid win-rate trend over the last ~6 months,
 * and a profile-completeness vs win-rate efficacy table that answers "does a
 * more complete setup win more?". All numbers are real aggregates from the API.
 */
type Report = {
  generated_at: string;
  bids: { won: number; lost: number; open: number; win_rate: number };
  quotes: { accepted: number; declined: number; pending: number; win_rate: number };
  trend: { month: string; won: number; lost: number; win_rate: number }[];
  efficacy: { completeness_band: string; profiles: number; win_rate: number }[];
};

function pct(n: number): string {
  return `${n}%`;
}

/** Plain-English takeaway: compare Low-band vs High-band win-rate. */
function efficacyTakeaway(rows: Report['efficacy']): string {
  const withData = rows.filter((r) => r.profiles > 0);
  if (withData.length === 0) {
    return 'No profiles with bid or quote outcomes yet. The efficacy rating populates as orgs complete their setup and start winning work.';
  }
  const low = rows.find((r) => r.completeness_band === 'Low');
  const high = rows.find((r) => r.completeness_band === 'High');
  if (low && high && low.profiles > 0 && high.profiles > 0) {
    const delta = Math.round((high.win_rate - low.win_rate) * 10) / 10;
    if (delta > 0) {
      return `More complete setups win more: High-completeness profiles win at ${pct(high.win_rate)} versus ${pct(low.win_rate)} for Low-completeness, a ${pct(delta)} lift.`;
    }
    if (delta < 0) {
      return `Completeness is not driving wins right now: High-completeness profiles win at ${pct(high.win_rate)} versus ${pct(low.win_rate)} for Low. Investigate whether top profiles are bidding on harder work.`;
    }
    return `High and Low completeness profiles are winning at the same rate (${pct(high.win_rate)}). Completeness is not the deciding factor yet.`;
  }
  return 'Not enough profiles across completeness bands to compare yet.';
}

export default function WinLoss() {
  const { isAdmin } = useAuth();
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiGet<{ report: Report }>('/intelligence/winloss')
      .then((res) => setR(res.report))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="wl"><style>{WL_CSS}</style><p className="wl-guard">This page is restricted to platform administrators.</p></div>;
  }

  const maxTrend = r ? Math.max(1, ...r.trend.map((t) => t.won + t.lost)) : 1;

  return (
    <div className="wl">
      <style>{WL_CSS}</style>
      <header className="wl-head">
        <span className="wl-kicker">Super Admin</span>
        <h1 className="wl-title">Win / Loss Scorecard</h1>
        <p className="wl-sub">Won versus lost across bids and quotes, the win-rate trend, and whether a more complete setup wins more.</p>
      </header>

      {loading ? <p className="wl-muted">Loading scorecard...</p> : null}
      {err ? <p className="wl-err">{err}</p> : null}

      {r ? (
        <>
          <div className="wl-sectiontitle">Bids</div>
          <div className="wl-stats">
            <Stat k="Bids won" v={String(r.bids.won)} d="awarded" tone="win" />
            <Stat k="Bids lost" v={String(r.bids.lost)} d="declined or expired" tone="loss" />
            <Stat k="Bids open" v={String(r.bids.open)} d="still undecided" />
            <Stat k="Bid win rate" v={pct(r.bids.win_rate)} d="of decided bids" tone="rate" />
          </div>

          <div className="wl-sectiontitle">Quotes</div>
          <div className="wl-stats">
            <Stat k="Quotes accepted" v={String(r.quotes.accepted)} d="accepted or converted" tone="win" />
            <Stat k="Quotes declined" v={String(r.quotes.declined)} d="declined or expired" tone="loss" />
            <Stat k="Quotes pending" v={String(r.quotes.pending)} d="still in flight" />
            <Stat k="Quote win rate" v={pct(r.quotes.win_rate)} d="of decided quotes" tone="rate" />
          </div>

          <div className="wl-sectiontitle">Bid win-rate trend</div>
          <div className="wl-panel">
            {r.trend.length === 0 ? (
              <p className="wl-board-empty">No bid outcomes in the last six months yet.</p>
            ) : (
              <div className="wl-trend">
                {r.trend.map((t) => {
                  const total = t.won + t.lost;
                  const h = Math.round((total / maxTrend) * 100);
                  return (
                    <div className="wl-trend-col" key={t.month}>
                      <div className="wl-trend-bar-wrap">
                        <div className="wl-trend-rate">{pct(t.win_rate)}</div>
                        <div className="wl-trend-bar" style={{ height: `${Math.max(4, h)}%` }} title={`${t.won} won / ${t.lost} lost`}>
                          <span className="wl-trend-won" style={{ height: total > 0 ? `${Math.round((t.won / total) * 100)}%` : '0%' }} />
                        </div>
                      </div>
                      <div className="wl-trend-meta">{t.won}W / {t.lost}L</div>
                      <div className="wl-trend-month">{t.month}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="wl-sectiontitle">Setup efficacy: completeness vs win rate</div>
          <div className="wl-panel">
            <table className="wl-table">
              <thead>
                <tr>
                  <th>Completeness band</th>
                  <th className="wl-num">Profiles</th>
                  <th className="wl-num">Win rate</th>
                  <th>Strength</th>
                </tr>
              </thead>
              <tbody>
                {r.efficacy.map((e) => (
                  <tr key={e.completeness_band}>
                    <td><span className={`wl-band wl-band-${e.completeness_band.toLowerCase()}`}>{e.completeness_band}</span></td>
                    <td className="wl-num">{e.profiles}</td>
                    <td className="wl-num"><b>{pct(e.win_rate)}</b></td>
                    <td>
                      <span className="wl-meter"><span className="wl-meter-fill" style={{ width: `${Math.min(100, e.win_rate)}%` }} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="wl-takeaway">{efficacyTakeaway(r.efficacy)}</p>
          </div>

          <p className="wl-muted wl-gen">Generated {new Date(r.generated_at).toLocaleString()}</p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ k, v, d, tone }: { k: string; v: string; d: string; tone?: 'win' | 'loss' | 'rate' }) {
  return (
    <div className={`wl-stat${tone ? ` is-${tone}` : ''}`}>
      <div className="wl-stat-k">{k}</div>
      <div className="wl-stat-v">{v}</div>
      <div className="wl-stat-d">{d}</div>
    </div>
  );
}

const WL_CSS = `
.wl {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  --dp-loss: #8a4a4a;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.wl *, .wl *::before, .wl *::after { box-sizing: border-box; }
.wl h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.wl-head { margin-bottom: 20px; }
.wl-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.wl-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.wl-sub { margin: 4px 0 0; font-size: 13px; color: var(--dp-muted); max-width: 640px; }
.wl-guard { background: #f6eaea; border: 1px solid #e2caca; color: #8a3a3a; border-radius: 10px; padding: 14px 16px; font-size: 13px; }
.wl-muted { color: var(--dp-muted); font-size: 13px; }
.wl-gen { margin-top: 18px; }
.wl-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.wl-sectiontitle { font-size: 13px; letter-spacing: .8px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; margin: 18px 0 10px; }
.wl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.wl-stat { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px; }
.wl-stat.is-win { border-color: rgba(30,93,74,.35); }
.wl-stat.is-loss { border-color: rgba(138,74,74,.3); }
.wl-stat.is-rate { background: rgba(201,163,91,.08); border-color: rgba(201,163,91,.5); }
.wl-stat-k { font-size: 11.5px; color: var(--dp-muted); letter-spacing: .3px; }
.wl-stat-v { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; color: var(--dp-emerald); line-height: 1.05; margin: 4px 0 2px; }
.wl-stat.is-loss .wl-stat-v { color: var(--dp-loss); }
.wl-stat.is-rate .wl-stat-v { color: var(--dp-emerald-2); }
.wl-stat-d { font-size: 11px; color: var(--dp-muted); }
.wl-panel { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; }
.wl-board-empty { font-size: 12.5px; color: var(--dp-muted); margin: 0; }
.wl-trend { display: flex; align-items: flex-end; gap: 14px; height: 180px; }
.wl-trend-col { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
.wl-trend-bar-wrap { flex: 1 1 auto; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.wl-trend-rate { font-size: 11px; font-weight: 700; color: var(--dp-emerald-2); margin-bottom: 4px; }
.wl-trend-bar { position: relative; width: 70%; max-width: 46px; background: rgba(138,74,74,.25); border-radius: 7px 7px 4px 4px; overflow: hidden; min-height: 4px; }
.wl-trend-won { position: absolute; left: 0; right: 0; bottom: 0; background: var(--dp-emerald); }
.wl-trend-meta { font-size: 10.5px; color: var(--dp-muted); }
.wl-trend-month { font-size: 10.5px; color: var(--dp-ink); font-weight: 600; }
.wl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.wl-table th { text-align: left; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; padding: 0 10px 8px; border-bottom: 1px solid var(--dp-line); }
.wl-table td { padding: 11px 10px; border-bottom: 1px solid var(--dp-line); vertical-align: middle; }
.wl-table tr:last-child td { border-bottom: none; }
.wl-num { text-align: right; }
.wl-band { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 3px 11px; border-radius: 999px; }
.wl-band-low { color: var(--dp-loss); background: rgba(138,74,74,.1); }
.wl-band-medium { color: var(--dp-gold); background: rgba(201,163,91,.14); }
.wl-band-high { color: var(--dp-emerald); background: rgba(18,60,46,.08); }
.wl-meter { display: block; width: 120px; height: 8px; background: var(--dp-line); border-radius: 999px; overflow: hidden; }
.wl-meter-fill { display: block; height: 100%; background: var(--dp-emerald-2); }
.wl-takeaway { margin: 14px 0 0; font-size: 13px; color: var(--dp-ink); border-top: 1px solid var(--dp-line); padding-top: 12px; line-height: 1.5; }
@media (max-width: 1024px) { .wl-stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .wl-stats { grid-template-columns: 1fr; } .wl-trend { gap: 8px; } }
`;
