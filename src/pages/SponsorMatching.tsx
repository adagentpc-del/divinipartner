import { useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Sponsor Matching surface (Phase 3 Intelligence).
 *
 * Reads ranked sponsor <-> event matches from GET /api/sponsor-match
 * (server/src/routes/sponsor-match.ts -> server/src/lib/sponsorMatch.ts). Two
 * directions:
 *   - "sponsors-for-event": for a nonprofit, rank SPONSORS that fit a given
 *     sponsorship package or fundraising event.
 *   - "events-for-sponsor": for a sponsor, rank EVENTS/PACKAGES that fit them.
 *
 * Everything is deterministic on the backend (mirrors the partnership-match
 * scoring style). This surface shows each match's score and the reasons behind
 * it. No numbers are fabricated client-side. Default export, no required props.
 */

type SponsorMatch = {
  candidate: {
    id: string;
    kind: string;
    name?: string | null;
    cause?: string | null;
    category?: string | null;
    audience_size?: number | null;
    amount?: number | null;
    tier?: string | null;
  };
  score: number;
  reasons: string[];
};

type MatchResponse = {
  direction: string;
  source: { id: string; name: string | null; kind: string };
  matches: SponsorMatch[];
};

type Direction = 'sponsors-for-event' | 'events-for-sponsor';

function tone(score: number): { label: string; cls: string } {
  if (score >= 70) return { label: 'Strong fit', cls: 'great' };
  if (score >= 50) return { label: 'Good fit', cls: 'good' };
  if (score >= 30) return { label: 'Possible', cls: 'ok' };
  return { label: 'Weak fit', cls: 'low' };
}

export default function SponsorMatching() {
  const [direction, setDirection] = useState<Direction>('sponsors-for-event');
  const [id, setId] = useState('');
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function run() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<MatchResponse>(
        `/sponsor-match?direction=${encodeURIComponent(direction)}&id=${encodeURIComponent(id)}`,
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

  const matches = data?.matches ?? [];
  const isSponsorSide = direction === 'events-for-sponsor';

  return (
    <div className="spm">
      <style>{CSS}</style>

      <header className="spm-head">
        <span className="spm-kicker">Fundraising Intelligence</span>
        <h1 className="spm-title">Sponsor Matching</h1>
        <p className="spm-sub">
          Find the sponsors that fit an event, or the events and packages that fit
          a sponsor. Matches are ranked deterministically by cause alignment,
          budget and price fit, audience size, location, and prior sponsorship
          history. Each suggestion shows exactly why it ranked where it did.
        </p>
      </header>

      <section className="spm-controls">
        <div className="spm-toggle" role="tablist" aria-label="Match direction">
          <button
            type="button"
            role="tab"
            aria-selected={!isSponsorSide}
            className={!isSponsorSide ? 'active' : ''}
            onClick={() => setDirection('sponsors-for-event')}
          >
            Sponsors for an event
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSponsorSide}
            className={isSponsorSide ? 'active' : ''}
            onClick={() => setDirection('events-for-sponsor')}
          >
            Events for a sponsor
          </button>
        </div>

        <div className="spm-row">
          <label>
            {isSponsorSide ? 'Sponsor organization id' : 'Package or fundraising event id'}
            <input
              value={id}
              placeholder="uuid"
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
            />
          </label>
          <button type="button" className="spm-btn" onClick={run} disabled={!id || loading}>
            {loading ? 'Matching' : 'Find matches'}
          </button>
        </div>
      </section>

      {error && <div className="spm-error">{error}</div>}

      {loading && !data && (
        <div className="spm-state">
          <div className="spm-spinner" aria-hidden="true" />
          <p>Ranking matches</p>
        </div>
      )}

      {!loading && loaded && !error && matches.length === 0 && (
        <div className="spm-empty">
          <span className="spm-empty-glyph" aria-hidden="true">S</span>
          <h2>No matches yet</h2>
          <p>
            We could not find candidates to rank for this {isSponsorSide ? 'sponsor' : 'event'}.
            Make sure the id is correct and that there are open{' '}
            {isSponsorSide ? 'sponsorship packages' : 'sponsor organizations'} on the platform.
          </p>
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <section className="spm-results">
          <p className="spm-resultcount">
            {matches.length} match{matches.length === 1 ? '' : 'es'} for{' '}
            <strong>{data?.source.name || data?.source.id}</strong>
          </p>
          <ol className="spm-list">
            {matches.map((m, i) => {
              const t = tone(m.score);
              return (
                <li key={m.candidate.id} className="spm-card">
                  <div className="spm-rank">#{i + 1}</div>
                  <div className="spm-body">
                    <div className="spm-cardhead">
                      <span className="spm-name">{m.candidate.name || m.candidate.id}</span>
                      <span className={`spm-tone ${t.cls}`}>{t.label}</span>
                    </div>
                    <div className="spm-meta">
                      {m.candidate.cause && <span>Cause: {m.candidate.cause}</span>}
                      {m.candidate.tier && <span>Tier: {m.candidate.tier}</span>}
                      {m.candidate.amount != null && (
                        <span>${Math.round(m.candidate.amount).toLocaleString()}</span>
                      )}
                      {m.candidate.audience_size != null && (
                        <span>Audience ~{m.candidate.audience_size.toLocaleString()}</span>
                      )}
                    </div>
                    {m.reasons.length > 0 && (
                      <ul className="spm-reasons">
                        {m.reasons.map((r, ri) => (
                          <li key={ri}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="spm-score">
                    <div className="spm-scoreval">{m.score}</div>
                    <div className="spm-scorelabel">fit</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

const CSS = `
.spm {
  --vemerald: #1E5D4A; --vemerald-deep: #123c2e; --vgold: #C9A35B;
  --vivory: #f7f4ee; --vink: #2c2a26; --vmuted: #7d776c; --vline: #e7e1d6;
  max-width: 1000px; margin: 0 auto; padding: 28px 24px 56px;
  font-family: Inter, system-ui, sans-serif; color: var(--vink);
}
.spm * { box-sizing: border-box; }
.spm h1, .spm h2 { font-family: 'Cormorant Garamond', Georgia, serif; color: var(--vemerald-deep); margin: 0; }

.spm-head { margin-bottom: 22px; }
.spm-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--vgold); font-weight: 600; }
.spm-title { font-size: 30px; line-height: 1.1; margin: 4px 0 8px; }
.spm-sub { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; max-width: 740px; margin: 0; }

.spm-controls { margin-bottom: 20px; }
.spm-toggle { display: inline-flex; border: 1px solid var(--vline); border-radius: 10px; overflow: hidden; margin-bottom: 14px; }
.spm-toggle button {
  font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 16px; border: 0;
  background: #fff; color: var(--vmuted); cursor: pointer;
}
.spm-toggle button.active { background: var(--vemerald); color: #fff; }

.spm-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.spm-row label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--vmuted); font-weight: 600; }
.spm-row input {
  font: inherit; font-size: 13px; padding: 9px 11px; border: 1px solid var(--vline);
  border-radius: 9px; background: #fff; min-width: 320px; color: var(--vink);
}
.spm-row input:focus { outline: none; border-color: var(--vemerald); }

.spm-btn {
  background: var(--vemerald); color: #fff; border: 0; border-radius: 9px;
  font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 18px; cursor: pointer;
  transition: background .15s ease;
}
.spm-btn:hover:not(:disabled) { background: var(--vemerald-deep); }
.spm-btn:disabled { opacity: .55; cursor: not-allowed; }

.spm-error {
  background: rgba(179,65,58,.08); border: 1px solid rgba(179,65,58,.4);
  color: #8c322c; border-radius: 10px; padding: 11px 14px; font-size: 13px; margin-bottom: 16px;
}

.spm-state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--vmuted); }
.spm-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid var(--vline); border-top-color: var(--vemerald);
  animation: spmspin .8s linear infinite;
}
@keyframes spmspin { to { transform: rotate(360deg); } }

.spm-empty {
  background: #fff; border: 1px dashed var(--vline); border-radius: 16px;
  padding: 30px 28px; max-width: 640px;
}
.spm-empty-glyph {
  width: 40px; height: 40px; border-radius: 11px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 700; font-size: 17px;
  background: rgba(201,163,91,.18); color: var(--vemerald); margin-bottom: 12px;
}
.spm-empty h2 { font-size: 23px; margin-bottom: 8px; }
.spm-empty p { font-size: 13.5px; color: var(--vmuted); line-height: 1.6; margin: 0; }

.spm-resultcount { font-size: 13px; color: var(--vmuted); margin: 0 0 14px; }
.spm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.spm-card {
  display: flex; align-items: stretch; gap: 14px; background: #fff;
  border: 1px solid var(--vline); border-radius: 14px; padding: 16px 18px;
}
.spm-rank { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--vgold); font-weight: 700; min-width: 34px; }
.spm-body { flex: 1; min-width: 0; }
.spm-cardhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spm-name { font-size: 15px; font-weight: 700; color: var(--vemerald-deep); }
.spm-tone { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
.spm-tone.great { background: rgba(47,143,91,.16); color: #1f6b41; }
.spm-tone.good { background: rgba(30,93,74,.14); color: var(--vemerald); }
.spm-tone.ok { background: rgba(184,134,11,.16); color: #8a6608; }
.spm-tone.low { background: rgba(179,65,58,.14); color: #8c322c; }
.spm-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11.5px; color: var(--vmuted); margin: 6px 0; }
.spm-meta span { background: rgba(247,244,238,.8); border-radius: 6px; padding: 2px 8px; }
.spm-reasons { margin: 6px 0 0; padding-left: 16px; font-size: 12.5px; color: var(--vink); line-height: 1.6; }
.spm-score { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 56px; }
.spm-scoreval { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 32px; font-weight: 700; color: var(--vemerald-deep); line-height: 1; }
.spm-scorelabel { font-size: 10px; letter-spacing: .6px; text-transform: uppercase; color: var(--vmuted); }

@media (max-width: 640px) {
  .spm-row input { min-width: 0; width: 100%; }
}
`;
