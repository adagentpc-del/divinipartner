import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import ReadinessGauge from '../components/marketing/ReadinessGauge';

/**
 * Vendor Scorecards surface (Phase 3 Intelligence).
 *
 * Reads the composite vendor scorecard from GET /api/vendor-scorecard/mine (the
 * signed-in vendor's own) or GET /api/vendor-scorecard/:vendorId, served by
 * server/src/routes/vendor-scorecard.ts. That route COMPOSES the existing Vendor
 * Readiness Score (0..100) with the deeper performance fields assembled by
 * server/src/lib/vendorScorecard.ts (response time, quote turnaround, win rate,
 * on-time delivery, change orders, client satisfaction, issues, rework, revenue).
 *
 * We render the composite grade as a gauge plus a per-field breakdown with each
 * field's health bar and value. Unknown fields (no data yet) are shown honestly
 * as "Not enough data" rather than a fabricated zero. The ?vendor= query param
 * overrides the default self-lookup for admins / cross-vendor views. Default
 * export, no required props.
 *
 * (The companion AI Quote Assist accelerator is exposed via POST
 * /api/quote-assist for integration to link from the quoting flow; it is
 * deterministic by default with the AI seam OFF.)
 */

type ScorecardField = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  health: number | null;
  tone: 'great' | 'good' | 'ok' | 'low' | 'unknown';
};

type Scorecard = {
  vendor_id: string;
  readiness_score: number;
  composite_score: number;
  composite_tone: 'great' | 'good' | 'ok' | 'low';
  fields: ScorecardField[];
};

type ScorecardResponse = {
  vendorId: string | null;
  scorecard: Scorecard | null;
};

function readVendorParam(): string {
  try {
    return new URLSearchParams(window.location.search).get('vendor') || '';
  } catch {
    return '';
  }
}

const TONE_LABEL: Record<string, string> = {
  great: 'Excellent',
  good: 'Strong',
  ok: 'Developing',
  low: 'Needs work',
};

export default function VendorScorecards() {
  const [vendorId, setVendorId] = useState(readVendorParam());
  const [data, setData] = useState<ScorecardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load(vid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ScorecardResponse>(
        vid ? `/vendor-scorecard/${vid}` : '/vendor-scorecard/mine',
      );
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
    load(vendorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sc = data?.scorecard ?? null;
  const composite = sc ? Math.max(0, Math.min(100, Math.round(sc.composite_score))) : 0;

  return (
    <div className="vsc">
      <style>{CSS}</style>

      <header className="vsc-head">
        <span className="vsc-kicker">Vendor Intelligence</span>
        <h1 className="vsc-title">Vendor Scorecard</h1>
        <p className="vsc-sub">
          A composite view of vendor performance: the readiness score plus response
          time, quote turnaround, win rate, on-time delivery, change orders, client
          satisfaction, issues, rework, and revenue generated. Fields with no data
          yet are shown honestly rather than guessed.
        </p>
      </header>

      <section className="vsc-controls">
        <label>
          Vendor id (optional)
          <input
            value={vendorId}
            placeholder="leave blank for your own"
            onChange={(e) => setVendorId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(vendorId)}
          />
        </label>
        <button type="button" className="vsc-btn" onClick={() => load(vendorId)} disabled={loading}>
          {loading ? 'Loading' : 'Load scorecard'}
        </button>
      </section>

      {error && <div className="vsc-error">{error}</div>}

      {loading && !data && (
        <div className="vsc-state">
          <div className="vsc-spinner" aria-hidden="true" />
          <p>Building the scorecard</p>
        </div>
      )}

      {!loading && loaded && !error && !sc && (
        <div className="vsc-empty">
          <span className="vsc-empty-glyph" aria-hidden="true">V</span>
          <h2>No scorecard yet</h2>
          <p>
            We could not resolve a vendor scorecard. If you are a vendor, complete
            your profile and start responding to bids and sending quotes; your
            scorecard builds from that activity. Admins can enter a vendor id above.
          </p>
        </div>
      )}

      {!loading && !error && sc && (
        <div className="vsc-grid">
          <section className="vsc-card vsc-scorecard">
            <ReadinessGauge score={composite} label="Composite" size={190} />
            <div className={`vsc-tone ${sc.composite_tone}`}>
              {TONE_LABEL[sc.composite_tone] ?? sc.composite_tone}
            </div>
            <p className="vsc-readiness">
              Readiness component: <strong>{sc.readiness_score}</strong> / 100
            </p>
          </section>

          <section className="vsc-card vsc-fields">
            <h2>Performance breakdown</h2>
            <p className="vsc-card-sub">
              Each field reflects live activity. Bars show field health; unknown
              fields are not counted against the composite.
            </p>
            <div className="vsc-fieldlist">
              {sc.fields.map((f) => (
                <div key={f.key} className="vsc-field">
                  <div className="vsc-field-top">
                    <span className="vsc-field-label">{f.label}</span>
                    <span className={`vsc-field-val ${f.tone}`}>{f.display}</span>
                  </div>
                  <div className="vsc-bar">
                    {f.health == null ? (
                      <div className="vsc-bar-unknown" />
                    ) : (
                      <div
                        className={`vsc-bar-fill ${f.tone}`}
                        style={{ width: `${Math.max(0, Math.min(100, f.health))}%` }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const CSS = `
.vsc {
  --vemerald: #1E5D4A; --vemerald-deep: #123c2e; --vgold: #C9A35B;
  --vivory: #f7f4ee; --vink: #2c2a26; --vmuted: #7d776c; --vline: #e7e1d6;
  max-width: 1000px; margin: 0 auto; padding: 28px 24px 56px;
  font-family: Inter, system-ui, sans-serif; color: var(--vink);
}
.vsc * { box-sizing: border-box; }
.vsc h1, .vsc h2 { font-family: 'Cormorant Garamond', Georgia, serif; color: var(--vemerald-deep); margin: 0; }

.vsc-head { margin-bottom: 22px; }
.vsc-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--vgold); font-weight: 600; }
.vsc-title { font-size: 30px; line-height: 1.1; margin: 4px 0 8px; }
.vsc-sub { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; max-width: 740px; margin: 0; }

.vsc-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.vsc-controls label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--vmuted); font-weight: 600; }
.vsc-controls input {
  font: inherit; font-size: 13px; padding: 9px 11px; border: 1px solid var(--vline);
  border-radius: 9px; background: #fff; min-width: 280px; color: var(--vink);
}
.vsc-controls input:focus { outline: none; border-color: var(--vemerald); }

.vsc-btn {
  background: var(--vemerald); color: #fff; border: 0; border-radius: 9px;
  font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 18px; cursor: pointer;
  transition: background .15s ease;
}
.vsc-btn:hover:not(:disabled) { background: var(--vemerald-deep); }
.vsc-btn:disabled { opacity: .55; cursor: not-allowed; }

.vsc-error {
  background: rgba(179,65,58,.08); border: 1px solid rgba(179,65,58,.4);
  color: #8c322c; border-radius: 10px; padding: 11px 14px; font-size: 13px; margin-bottom: 16px;
}

.vsc-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--vmuted); }
.vsc-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid var(--vline); border-top-color: var(--vemerald);
  animation: vscspin .8s linear infinite;
}
@keyframes vscspin { to { transform: rotate(360deg); } }

.vsc-empty {
  background: #fff; border: 1px dashed var(--vline); border-radius: 16px;
  padding: 30px 28px; max-width: 640px;
}
.vsc-empty-glyph {
  width: 40px; height: 40px; border-radius: 11px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 700; font-size: 17px;
  background: rgba(201,163,91,.18); color: var(--vemerald); margin-bottom: 12px;
}
.vsc-empty h2 { font-size: 23px; margin-bottom: 8px; }
.vsc-empty p { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; margin: 0; }

.vsc-grid { display: grid; grid-template-columns: 300px 1fr; gap: 18px; align-items: start; }
.vsc-card { background: #fff; border: 1px solid var(--vline); border-radius: 16px; padding: 22px; }
.vsc-card h2 { font-size: 21px; margin-bottom: 4px; }
.vsc-card-sub { font-size: 12.5px; color: var(--vmuted); line-height: 1.55; margin: 0 0 14px; }

.vsc-scorecard { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
.vsc-scorecard .mk-gauge { display: flex; flex-direction: column; align-items: center; }
.vsc-scorecard .mk-gv { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 46px; fill: var(--vemerald-deep); font-weight: 600; }
.vsc-scorecard .mk-gl { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--vmuted); margin-top: 2px; }
.vsc-tone { font-size: 11px; letter-spacing: .7px; text-transform: uppercase; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-top: 4px; }
.vsc-tone.great { background: rgba(47,143,91,.16); color: #1f6b41; }
.vsc-tone.good { background: rgba(30,93,74,.14); color: var(--vemerald); }
.vsc-tone.ok { background: rgba(184,134,11,.16); color: #8a6608; }
.vsc-tone.low { background: rgba(179,65,58,.14); color: #8c322c; }
.vsc-readiness { font-size: 12px; color: var(--vmuted); margin: 6px 0 0; }
.vsc-readiness strong { color: var(--vemerald-deep); }

.vsc-fieldlist { display: flex; flex-direction: column; gap: 13px; }
.vsc-field { display: flex; flex-direction: column; gap: 5px; }
.vsc-field-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.vsc-field-label { font-size: 13px; font-weight: 500; }
.vsc-field-val { font-size: 13px; font-weight: 700; color: var(--vemerald-deep); }
.vsc-field-val.unknown { color: var(--vmuted); font-weight: 500; font-style: italic; }
.vsc-field-val.low { color: #8c322c; }
.vsc-field-val.ok { color: #8a6608; }
.vsc-bar { height: 8px; border-radius: 999px; background: var(--vline); overflow: hidden; }
.vsc-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--vemerald), var(--vemerald-deep)); transition: width .4s ease; }
.vsc-bar-fill.low { background: linear-gradient(90deg, #c46a63, #8c322c); }
.vsc-bar-fill.ok { background: linear-gradient(90deg, #d6b15f, #8a6608); }
.vsc-bar-unknown { height: 100%; width: 100%; background: repeating-linear-gradient(45deg, #efe9dd, #efe9dd 6px, #f7f4ee 6px, #f7f4ee 12px); }

@media (max-width: 860px) {
  .vsc-grid { grid-template-columns: 1fr; }
}
`;
