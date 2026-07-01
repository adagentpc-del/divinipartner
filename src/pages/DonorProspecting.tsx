import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Donor Prospecting surface (Phase 3 Intelligence).
 *
 * Reads ranked donor prospects from GET /api/donor-prospect
 * (server/src/routes/donor-prospect.ts -> server/src/lib/donorProspect.ts). The
 * backend cross-reads the donor + donations tables BY NAME, scopes to the
 * signed-in nonprofit org, and ranks donors RFM-style (Recency, Frequency,
 * Monetary), surfacing lapsed-but-high-value donors and a suggested ask. This
 * surface auto-loads on mount, shows each prospect's score, RFM bars, why, and
 * suggested ask, and degrades to a graceful empty state when no donor data
 * exists. Default export, no required props.
 */

type DonorProspect = {
  donor: {
    id: string;
    name?: string | null;
    email?: string | null;
    total_given?: number | null;
    gift_count?: number | null;
    largest_gift?: number | null;
    last_gift_at?: string | null;
  };
  score: number;
  rfm: { recency: number; frequency: number; monetary: number };
  lapsed: boolean;
  suggested_ask: number;
  reasons: string[];
};

type ProspectResponse = {
  prospects: DonorProspect[];
  total: number;
  empty: boolean;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}

export default function DonorProspecting() {
  const [data, setData] = useState<ProspectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<ProspectResponse>('/donor-prospect');
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const prospects = data?.prospects ?? [];

  return (
    <div className="dpr">
      <style>{CSS}</style>

      <header className="dpr-head">
        <span className="dpr-kicker">Fundraising Intelligence</span>
        <h1 className="dpr-title">Donor Prospecting</h1>
        <p className="dpr-sub">
          Your donors, ranked as major-gift prospects. We score each by recency,
          frequency, and total giving, and surface high-value donors who have
          lapsed and are ripe for a renewal ask. Every prospect comes with a
          suggested next ask anchored on their giving history.
        </p>
      </header>

      {error && <div className="dpr-error">{error}</div>}

      {loading && (
        <div className="dpr-state">
          <div className="dpr-spinner" aria-hidden="true" />
          <p>Scoring your donors</p>
        </div>
      )}

      {!loading && !error && prospects.length === 0 && (
        <div className="dpr-empty">
          <span className="dpr-empty-glyph" aria-hidden="true">D</span>
          <h2>No donor prospects yet</h2>
          <p>
            We have no donor records to rank for your organization yet. As you add
            donors and record donations, this list fills with ranked prospects,
            each with a suggested ask and the reasoning behind it.
          </p>
        </div>
      )}

      {!loading && !error && prospects.length > 0 && (
        <section className="dpr-results">
          <p className="dpr-count">
            {prospects.length} ranked prospect{prospects.length === 1 ? '' : 's'}
          </p>
          <ol className="dpr-list">
            {prospects.map((p, i) => (
              <li key={p.donor.id} className={`dpr-card${p.lapsed ? ' lapsed' : ''}`}>
                <div className="dpr-rank">#{i + 1}</div>
                <div className="dpr-main">
                  <div className="dpr-cardhead">
                    <span className="dpr-name">
                      {p.donor.name || p.donor.email || 'Donor'}
                    </span>
                    {p.lapsed && <span className="dpr-flag">Lapsed high-value</span>}
                  </div>
                  <div className="dpr-meta">
                    <span>Lifetime {money(p.donor.total_given)}</span>
                    {p.donor.gift_count != null && <span>{p.donor.gift_count} gifts</span>}
                    {p.donor.largest_gift != null && (
                      <span>Best {money(p.donor.largest_gift)}</span>
                    )}
                  </div>
                  <div className="dpr-rfm">
                    {(['recency', 'frequency', 'monetary'] as const).map((k) => (
                      <div key={k} className="dpr-rfm-item">
                        <span className="dpr-rfm-label">{k[0].toUpperCase()}</span>
                        <div className="dpr-bar">
                          <div className="dpr-bar-fill" style={{ width: `${p.rfm[k]}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {p.reasons.length > 0 && (
                    <ul className="dpr-reasons">
                      {p.reasons.map((r, ri) => (
                        <li key={ri}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="dpr-side">
                  <div className="dpr-score">{p.score}</div>
                  <div className="dpr-scorelabel">prospect</div>
                  {p.suggested_ask > 0 && (
                    <div className="dpr-ask">
                      <span>Suggested ask</span>
                      <strong>{money(p.suggested_ask)}</strong>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const CSS = `
.dpr {
  --vemerald: #1E5D4A; --vemerald-deep: #123c2e; --vgold: #C9A35B;
  --vivory: #f7f4ee; --vink: #2c2a26; --vmuted: #7d776c; --vline: #e7e1d6;
  max-width: 1000px; margin: 0 auto; padding: 28px 24px 56px;
  font-family: Inter, system-ui, sans-serif; color: var(--vink);
}
.dpr * { box-sizing: border-box; }
.dpr h1, .dpr h2 { font-family: 'Cormorant Garamond', Georgia, serif; color: var(--vemerald-deep); margin: 0; }

.dpr-head { margin-bottom: 22px; }
.dpr-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--vgold); font-weight: 600; }
.dpr-title { font-size: 30px; line-height: 1.1; margin: 4px 0 8px; }
.dpr-sub { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; max-width: 740px; margin: 0; }

.dpr-error {
  background: rgba(179,65,58,.08); border: 1px solid rgba(179,65,58,.4);
  color: #8c322c; border-radius: 10px; padding: 11px 14px; font-size: 13px; margin-bottom: 16px;
}

.dpr-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--vmuted); }
.dpr-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid var(--vline); border-top-color: var(--vemerald);
  animation: dprspin .8s linear infinite;
}
@keyframes dprspin { to { transform: rotate(360deg); } }

.dpr-empty {
  background: #fff; border: 1px dashed var(--vline); border-radius: 16px;
  padding: 30px 28px; max-width: 640px;
}
.dpr-empty-glyph {
  width: 40px; height: 40px; border-radius: 11px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 700; font-size: 17px;
  background: rgba(201,163,91,.18); color: var(--vemerald); margin-bottom: 12px;
}
.dpr-empty h2 { font-size: 23px; margin-bottom: 8px; }
.dpr-empty p { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; margin: 0; }

.dpr-count { font-size: 13px; color: var(--vmuted); margin: 0 0 14px; }
.dpr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.dpr-card {
  display: flex; align-items: stretch; gap: 14px; background: #fff;
  border: 1px solid var(--vline); border-radius: 14px; padding: 16px 18px;
}
.dpr-card.lapsed { border-color: rgba(201,163,91,.55); background: linear-gradient(0deg, rgba(201,163,91,.04), #fff); }
.dpr-rank { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--vgold); font-weight: 700; min-width: 34px; }
.dpr-main { flex: 1; min-width: 0; }
.dpr-cardhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dpr-name { font-size: 15px; font-weight: 700; color: var(--vemerald-deep); }
.dpr-flag { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: rgba(201,163,91,.2); color: #8a6608; }
.dpr-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11.5px; color: var(--vmuted); margin: 6px 0; }
.dpr-meta span { background: rgba(247,244,238,.8); border-radius: 6px; padding: 2px 8px; }
.dpr-rfm { display: flex; gap: 12px; margin: 8px 0; }
.dpr-rfm-item { display: flex; align-items: center; gap: 6px; flex: 1; }
.dpr-rfm-label { font-size: 11px; font-weight: 700; color: var(--vmuted); width: 14px; }
.dpr-bar { flex: 1; height: 7px; border-radius: 999px; background: var(--vline); overflow: hidden; }
.dpr-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--vemerald), var(--vemerald-deep)); }
.dpr-reasons { margin: 6px 0 0; padding-left: 16px; font-size: 12.5px; color: var(--vink); line-height: 1.6; }
.dpr-side { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 92px; text-align: center; gap: 2px; }
.dpr-score { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; font-weight: 700; color: var(--vemerald-deep); line-height: 1; }
.dpr-scorelabel { font-size: 10px; letter-spacing: .6px; text-transform: uppercase; color: var(--vmuted); }
.dpr-ask { margin-top: 8px; font-size: 11px; color: var(--vmuted); display: flex; flex-direction: column; }
.dpr-ask strong { font-size: 15px; color: var(--vgold); }

@media (max-width: 640px) {
  .dpr-rfm { flex-direction: column; gap: 6px; }
}
`;
