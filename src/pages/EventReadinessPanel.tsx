import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Friction Elimination - U2 Event Readiness Score.
 *
 * A reusable panel that shows the 0..100 readiness score plus a missing-items
 * checklist for a single event. Drop it anywhere an event id is known (event
 * workspace, dashboard, etc). Uses src/lib/api.ts (apiGet) against the
 * /event-readiness/:eventId route; there is no apiPost in api.ts.
 *
 * Route wiring (src/App.tsx) and Shell are owned by the integration lead and
 * are intentionally not edited here.
 */

type Dimension = {
  key: string;
  label: string;
  satisfied: boolean;
  weight: number;
  detail: string;
};

type ReadinessResult = {
  score: number;
  breakdown: Dimension[];
  missing: string[];
  signals?: Record<string, boolean>;
};

function scoreColor(score: number): string {
  if (score >= 80) return '#1E5D4A';
  if (score >= 50) return '#C9A35B';
  return '#c0392b';
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `conic-gradient(${color} ${score * 3.6}deg, #e7e1d6 0deg)`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: '50%',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{score}</div>
        <div className="note" style={{ fontSize: 11 }}>/ 100</div>
      </div>
    </div>
  );
}

export default function EventReadinessPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<ReadinessResult>(`/event-readiness/${eventId}`);
      setData(r);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (loading) {
    return (
      <div className="card">
        <p className="note" style={{ margin: 0 }}>Loading readiness...</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b' }}>{err}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <ScoreRing score={data.score} />
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Event readiness</h3>
          <div className="note" style={{ lineHeight: 1.6 }}>
            {data.missing.length === 0
              ? 'Everything is in place. This event is ready.'
              : `${data.missing.length} item${data.missing.length === 1 ? '' : 's'} still need attention.`}
          </div>
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {data.breakdown.map((d) => (
          <li
            key={d.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 0',
              borderTop: '1px solid #efe9dd',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: d.satisfied ? '#1E5D4A' : '#c9c2b4',
              }}
            >
              {d.satisfied ? 'x' : ''}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>
                {d.label}
                <span className="note" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({d.weight} pts)
                </span>
              </div>
              <div className="note" style={{ lineHeight: 1.5 }}>{d.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}
