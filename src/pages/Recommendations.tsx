import React, { useState } from 'react';
import { apiSend } from '../lib/api';

/**
 * Venue Intelligence addendum - Event Recommendation Engine (Phase 7, scope A).
 *
 * A simple planning form (venue type, event type, budget, guest count) that
 * returns deterministically ranked vendor service categories and sponsor
 * categories from the /recommend API. There is no apiPost in src/lib/api.ts, so
 * this uses apiSend('POST', ...). Styling follows the shared card/btn/grid
 * classes used by the other Venue Intelligence pages.
 *
 * NOTE: the route wiring for this page (src/App.tsx) is owned by the lead and is
 * intentionally not edited here.
 */

type RankedCategory = {
  category: string;
  label: string;
  score: number;
  reasons: string[];
};

type RecommendResult = {
  input: {
    venueType: string | null;
    eventType: string | null;
    budget: number | null;
    guestCount: number | null;
    budgetTier: string;
    guestBand: string;
  };
  vendorCategories: RankedCategory[];
  sponsors: RankedCategory[];
  ai_reranked: boolean;
  notes: string;
};

// Friendly option lists. Free text is also accepted by the engine, but these
// cover the common cases and keep the form quick to use.
const VENUE_TYPES = [
  '', 'ballroom', 'hotel', 'outdoor', 'rooftop', 'warehouse', 'conference', 'gallery', 'stadium',
];
const EVENT_TYPES = [
  '', 'wedding', 'corporate', 'conference', 'trade_show', 'gala', 'concert', 'launch', 'social',
];

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ height: 6, background: '#e7e1d6', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: '#1E5D4A' }} />
    </div>
  );
}

function CategoryCard({ item }: { item: RankedCategory }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{item.label}</h3>
        <span style={{ fontWeight: 700, color: '#C9A35B', fontSize: 20 }}>{item.score}</span>
      </div>
      <ScoreBar score={item.score} />
      {item.reasons.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, lineHeight: 1.7 }}>
          {item.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="note" style={{ paddingLeft: 14, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#C9A35B', fontWeight: 700 }}>+</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Recommendations() {
  const [venueType, setVenueType] = useState('');
  const [eventType, setEventType] = useState('');
  const [budget, setBudget] = useState('');
  const [guestCount, setGuestCount] = useState('');

  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function recommend() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiSend<{ recommendation: RecommendResult }>('POST', '/recommend', {
        venueType: venueType || null,
        eventType: eventType || null,
        budget: num(budget),
        guestCount: num(guestCount),
      });
      setResult(r.recommendation);
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Event Recommendations</h1>
          <div className="sub">Vendor service categories and sponsors matched to your event</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Venue type</div>
            <select value={venueType} onChange={(e) => setVenueType(e.target.value)} style={{ width: '100%' }}>
              {VENUE_TYPES.map((v) => (
                <option key={v || 'any'} value={v}>{v ? v.replace(/_/g, ' ') : 'Any / not sure'}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Event type</div>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: '100%' }}>
              {EVENT_TYPES.map((v) => (
                <option key={v || 'any'} value={v}>{v ? v.replace(/_/g, ' ') : 'Any / not sure'}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Budget ($)</div>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              style={{ width: '100%' }}
              placeholder="50000"
              inputMode="numeric"
            />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Guest count</div>
            <input
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              style={{ width: '100%' }}
              placeholder="200"
              inputMode="numeric"
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={recommend} disabled={loading}>
            {loading ? 'Matching...' : 'Recommend'}
          </button>
        </div>
        <p className="note" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
          Recommendations are generated deterministically. Leave a field blank if
          you are not sure; the more you provide, the sharper the ranking.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {result && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="note" style={{ lineHeight: 1.7 }}>
              Budget tier: <strong>{result.input.budgetTier}</strong>
              {'  ·  '}
              Guest band: <strong>{result.input.guestBand}</strong>
            </div>
            <p className="note" style={{ margin: '8px 0 0', lineHeight: 1.6 }}>{result.notes}</p>
          </div>

          <div className="sectitle" style={{ marginBottom: 10 }}>Recommended vendor categories</div>
          {result.vendorCategories.length === 0 ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>No vendor categories matched.</p></div>
          ) : (
            <div className="grid cards3">
              {result.vendorCategories.map((c) => <CategoryCard key={c.category} item={c} />)}
            </div>
          )}

          <div className="sectitle" style={{ margin: '20px 0 10px' }}>Recommended sponsors</div>
          {result.sponsors.length === 0 ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>No sponsor categories matched.</p></div>
          ) : (
            <div className="grid cards3">
              {result.sponsors.map((s) => <CategoryCard key={s.category} item={s} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
