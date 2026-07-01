import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import ReadinessGauge from '../components/marketing/ReadinessGauge';

/**
 * Vendor Readiness Score surface (Venue Intelligence Phase 4).
 *
 * Reads the live score the backend computes at GET /api/vendor-readiness/:vendorId
 * (server/src/routes/vendor-readiness.ts -> db/vendor-readiness.getVendorReadiness),
 * which returns { row, score, breakdown }. `breakdown` is the per-factor list
 * ({ key, label, weight, earned }) produced by vendorReadinessBreakdown in
 * server/src/lib/vendorReadiness.ts. We render the 0-100 score as a gauge, every
 * factor with its earned-vs-weight contribution, and concrete recommendations
 * for the weakest factors. No numbers are fabricated: if no readiness row exists
 * yet we show an empty state rather than inventing a score.
 *
 * The vendor id defaults to the signed-in vendor's OWN vendor row, resolved via
 * GET /api/vendor-readiness/mine (org-scoped, IDOR-safe), so a logged-in vendor
 * sees their own score with no param. The ?vendor= query param (matching the
 * sibling VendorRequirementBuilder surface) overrides that default, and a
 * manual-entry field remains for admins / cross-vendor lookups. Default export,
 * no required props.
 */

// ---- Backend response shape (mirrors server/src/db/vendor-readiness.ts) -----

type ReadinessFactor = {
  key: string;
  label: string;
  weight: number;
  earned: number;
};

type ReadinessRow = {
  id: string;
  vendor_id: string | null;
  response_speed: string | null;
  quote_speed: string | null;
  approval_rate: string | null;
  win_rate: string | null;
  profile_completeness: string | null;
  insurance_uploaded: boolean | null;
  w9_uploaded: boolean | null;
  reviews_score: string | null;
  completion_history: string | null;
  score: number | null;
  updated_at: string;
};

type ReadinessResponse = {
  row: ReadinessRow | null;
  score: number;
  breakdown: ReadinessFactor[];
};

// Concrete, factor-specific guidance shown when a factor is underperforming.
const ADVICE: Record<string, string> = {
  response_speed:
    'Reply to new bid invitations faster. Turn on notifications and aim to acknowledge requests within a few hours.',
  quote_speed:
    'Shorten the time from request to sent quote. Build reusable packages and pricing so you can quote in one sitting.',
  approval_rate:
    'Tighten your quotes so more get approved. Match the requested scope and keep pricing transparent.',
  win_rate:
    'Win more of the jobs you quote. Sharpen your packages, add photos, and follow up after sending a proposal.',
  profile_completeness:
    'Complete your vendor profile. Add services, photos, service areas, and your business details so clients can find and trust you.',
  reviews_score:
    'Earn stronger reviews. Ask satisfied clients to leave a rating after each completed event.',
  completion_history:
    'Build a track record of completed jobs. Each successfully delivered event raises this factor.',
  insurance_uploaded:
    'Upload your certificate of insurance (COI). Many venues require it before you can be awarded work.',
  w9_uploaded:
    'Upload your W-9. It is required for payouts and to stay eligible to bid.',
};

function readVendorParam(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('vendor') || '';
  } catch {
    return '';
  }
}

function tone(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: 'Excellent', cls: 'great' };
  if (score >= 60) return { label: 'Strong', cls: 'good' };
  if (score >= 40) return { label: 'Developing', cls: 'ok' };
  return { label: 'Needs work', cls: 'low' };
}

export default function VendorReadiness() {
  const [vendorId, setVendorId] = useState(readVendorParam());
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load(vid: string) {
    if (!vid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ReadinessResponse>(`/vendor-readiness/${vid}`);
      setData(res);
      setLoaded(true);
    } catch (e) {
      setData(null);
      setError((e as Error).message);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // With an explicit ?vendor= param, load that vendor. Otherwise resolve the
    // signed-in vendor's own row from the backend and load their own score, so a
    // logged-in vendor never has to know their id.
    if (vendorId) {
      load(vendorId);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{ vendorId: string | null }>('/vendor-readiness/mine');
        if (cancelled) return;
        if (res.vendorId) {
          setVendorId(res.vendorId);
          load(res.vendorId);
        }
      } catch {
        // No current-vendor mapping available: fall back to the manual resolver.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A readiness row that was never computed: row is null. Treat that as "no data
  // yet" so we never present a fabricated score as if it were real.
  const hasRow = !!data?.row;
  const score = hasRow ? Math.max(0, Math.min(100, Math.round(data!.score))) : 0;
  const breakdown = data?.breakdown ?? [];
  const t = tone(score);

  // Weakest factors first (lowest fraction of weight earned), for the
  // recommendations panel. Only surface factors that are not already maxed out.
  const improvements = [...breakdown]
    .map((f) => ({ ...f, pct: f.weight > 0 ? f.earned / f.weight : 1 }))
    .filter((f) => f.pct < 0.95)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  return (
    <div className="vrs">
      <style>{CSS}</style>

      <header className="vrs-head">
        <span className="vrs-kicker">Vendor Workspace</span>
        <h1 className="vrs-title">Vendor Readiness Score</h1>
        <p className="vrs-sub">
          Your readiness score (0 to 100) tells venues and planners how responsive,
          complete, compliant, and proven you are. The higher it climbs, the higher
          you surface in marketplace search.
        </p>
      </header>

      <section className="vrs-section">
        <div className="vrs-vendorrow">
          <label>
            Vendor id
            <input
              value={vendorId}
              placeholder="vendor uuid"
              onChange={(e) => setVendorId(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="vrs-btn"
            onClick={() => load(vendorId)}
            disabled={!vendorId || loading}
          >
            {loading ? 'Loading' : 'Load score'}
          </button>
        </div>
      </section>

      {error && <div className="vrs-error">{error}</div>}

      {loading && !data && (
        <div className="vrs-state">
          <div className="vrs-spinner" aria-hidden="true" />
          <p>Loading your readiness score</p>
        </div>
      )}

      {!loading && loaded && !error && !hasRow && (
        <div className="vrs-empty">
          <span className="vrs-empty-glyph" aria-hidden="true">R</span>
          <h2>No readiness score yet</h2>
          <p>
            We have not computed a readiness score for this vendor yet. Your score
            builds as you complete your profile, upload your COI and W-9, respond
            to bids, send quotes, and complete jobs. Take the actions below and
            your score will start to populate.
          </p>
          <ul className="vrs-empty-list">
            <li>Upload your certificate of insurance (COI)</li>
            <li>Upload your W-9</li>
            <li>Complete your vendor profile and list your services</li>
            <li>Respond to a bid and send a quote</li>
          </ul>
        </div>
      )}

      {!loading && !error && hasRow && (
        <div className="vrs-grid">
          <section className="vrs-card vrs-scorecard">
            <ReadinessGauge score={score} label="Vendor Readiness" size={190} />
            <div className={`vrs-tone ${t.cls}`}>{t.label}</div>
            <p className="vrs-scoresub">
              {data?.row?.updated_at
                ? `Last updated ${new Date(data.row.updated_at).toLocaleDateString()}`
                : 'Updated as your signals change'}
            </p>
          </section>

          <section className="vrs-card vrs-breakdown">
            <h2>Factor breakdown</h2>
            <p className="vrs-card-sub">
              Each factor contributes part of your total. The bar shows how much of
              that factor you have earned.
            </p>
            <div className="vrs-factors">
              {breakdown.map((f) => {
                const pct = f.weight > 0 ? Math.min(100, (f.earned / f.weight) * 100) : 0;
                return (
                  <div key={f.key} className="vrs-factor">
                    <div className="vrs-factor-top">
                      <span className="vrs-factor-label">{f.label}</span>
                      <span className="vrs-factor-val">
                        {f.earned.toFixed(f.earned % 1 === 0 ? 0 : 1)}
                        <span className="vrs-factor-weight"> / {f.weight}</span>
                      </span>
                    </div>
                    <div className="vrs-bar">
                      <div className="vrs-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="vrs-card vrs-improve">
            <h2>How to improve</h2>
            {improvements.length === 0 ? (
              <p className="vrs-card-sub">
                Every factor is performing well. Keep responding quickly and
                completing jobs to hold your score.
              </p>
            ) : (
              <ol className="vrs-tips">
                {improvements.map((f) => (
                  <li key={f.key}>
                    <span className="vrs-tip-label">{f.label}</span>
                    <span className="vrs-tip-gain">
                      +{(f.weight - f.earned).toFixed(
                        (f.weight - f.earned) % 1 === 0 ? 0 : 1,
                      )}{' '}
                      points available
                    </span>
                    <p>{ADVICE[f.key] ?? 'Improve this factor to raise your score.'}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const CSS = `
.vrs {
  --vemerald: #1E5D4A; --vemerald-deep: #123c2e; --vgold: #C9A35B;
  --vivory: #f7f4ee; --vink: #2c2a26; --vmuted: #7d776c; --vline: #e7e1d6;
  max-width: 1060px; margin: 0 auto; padding: 28px 24px 56px;
  font-family: Inter, system-ui, sans-serif; color: var(--vink);
}
.vrs * { box-sizing: border-box; }
.vrs h1, .vrs h2 { font-family: 'Cormorant Garamond', Georgia, serif; color: var(--vemerald-deep); margin: 0; }

.vrs-head { margin-bottom: 22px; }
.vrs-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--vgold); font-weight: 600; }
.vrs-title { font-size: 30px; line-height: 1.1; margin: 4px 0 8px; }
.vrs-sub { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; max-width: 720px; margin: 0; }

.vrs-section { margin-bottom: 18px; }
.vrs-vendorrow { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.vrs-vendorrow label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--vmuted); font-weight: 600; }
.vrs-vendorrow input {
  font: inherit; font-size: 13px; padding: 9px 11px; border: 1px solid var(--vline);
  border-radius: 9px; background: #fff; min-width: 280px; color: var(--vink);
}
.vrs-vendorrow input:focus { outline: none; border-color: var(--vemerald); }

.vrs-btn {
  background: var(--vemerald); color: #fff; border: 0; border-radius: 9px;
  font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 18px; cursor: pointer;
  transition: background .15s ease;
}
.vrs-btn:hover:not(:disabled) { background: var(--vemerald-deep); }
.vrs-btn:disabled { opacity: .55; cursor: not-allowed; }

.vrs-error {
  background: rgba(179,65,58,.08); border: 1px solid rgba(179,65,58,.4);
  color: #8c322c; border-radius: 10px; padding: 11px 14px; font-size: 13px; margin-bottom: 16px;
}

.vrs-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--vmuted); }
.vrs-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid var(--vline); border-top-color: var(--vemerald);
  animation: vrsspin .8s linear infinite;
}
@keyframes vrsspin { to { transform: rotate(360deg); } }

.vrs-empty {
  background: #fff; border: 1px dashed var(--vline); border-radius: 16px;
  padding: 30px 28px; max-width: 640px;
}
.vrs-empty-glyph {
  width: 40px; height: 40px; border-radius: 11px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 700; font-size: 17px;
  background: rgba(201,163,91,.18); color: var(--vemerald); margin-bottom: 12px;
}
.vrs-empty h2 { font-size: 23px; margin-bottom: 8px; }
.vrs-empty p { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; margin: 0 0 14px; }
.vrs-empty-list { margin: 0; padding-left: 18px; color: var(--vink); font-size: 13px; line-height: 1.9; }

.vrs-grid {
  display: grid; grid-template-columns: 300px 1fr; gap: 18px; align-items: start;
}
.vrs-card { background: #fff; border: 1px solid var(--vline); border-radius: 16px; padding: 22px; }
.vrs-card h2 { font-size: 21px; margin-bottom: 4px; }
.vrs-card-sub { font-size: 12.5px; color: var(--vmuted); line-height: 1.55; margin: 0 0 14px; }

.vrs-scorecard { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
.vrs-scorecard .mk-gauge { display: flex; flex-direction: column; align-items: center; }
.vrs-scorecard .mk-gv { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 46px; fill: var(--vemerald-deep); font-weight: 600; }
.vrs-scorecard .mk-gl { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--vmuted); margin-top: 2px; }
.vrs-tone {
  font-size: 11px; letter-spacing: .7px; text-transform: uppercase; font-weight: 700;
  padding: 4px 12px; border-radius: 999px; margin-top: 4px;
}
.vrs-tone.great { background: rgba(47,143,91,.16); color: #1f6b41; }
.vrs-tone.good { background: rgba(30,93,74,.14); color: var(--vemerald); }
.vrs-tone.ok { background: rgba(184,134,11,.16); color: #8a6608; }
.vrs-tone.low { background: rgba(179,65,58,.14); color: #8c322c; }
.vrs-scoresub { font-size: 11.5px; color: var(--vmuted); margin: 2px 0 0; }

.vrs-factors { display: flex; flex-direction: column; gap: 13px; }
.vrs-factor { display: flex; flex-direction: column; gap: 5px; }
.vrs-factor-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.vrs-factor-label { font-size: 13px; font-weight: 500; }
.vrs-factor-val { font-size: 13px; font-weight: 700; color: var(--vemerald-deep); }
.vrs-factor-weight { font-weight: 500; color: var(--vmuted); }
.vrs-bar { height: 8px; border-radius: 999px; background: var(--vline); overflow: hidden; }
.vrs-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--vemerald), var(--vemerald-deep)); transition: width .4s ease; }

.vrs-improve { grid-column: 1 / -1; }
.vrs-tips { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.vrs-tips li {
  border: 1px solid var(--vline); border-radius: 12px; padding: 14px 16px;
  background: rgba(247,244,238,.5);
}
.vrs-tip-label { display: block; font-size: 13.5px; font-weight: 700; color: var(--vemerald-deep); }
.vrs-tip-gain { display: inline-block; font-size: 11px; font-weight: 600; color: var(--vgold); margin: 2px 0 6px; }
.vrs-tips p { margin: 0; font-size: 12.5px; color: var(--vmuted); line-height: 1.55; }

@media (max-width: 860px) {
  .vrs-grid { grid-template-columns: 1fr; }
  .vrs-tips { grid-template-columns: 1fr; }
}
`;
