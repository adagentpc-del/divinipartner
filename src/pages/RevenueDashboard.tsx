import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiSend } from '../lib/api';

/**
 * Intelligence Moat - Feature 4: Revenue Leakage Detection dashboard.
 *
 * Run a leakage scan over a venue or an event and see potential vs captured vs
 * missed revenue, plus a ranked list of specific capture suggestions (extra
 * sponsor inventory, VIP packages, brand activations, premium furniture,
 * photo/video, floral, branded installs, transport, parking sponsorships,
 * digital signage). All numbers come from the deterministic /revenue-leakage
 * scan over the org's own venue/event data (IDOR-safe on the server).
 */

type Suggestion = {
  key: string;
  label: string;
  potential: number;
  captured: number;
  missed: number;
  reason: string;
};

type ScanResult = {
  potential: number;
  captured: number;
  missed: number;
  suggestions: Suggestion[];
};

const SCOPE_KEY = 'dp.im.leakScope';
const ID_KEY = 'dp.im.leakId';

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${Math.round(v).toLocaleString()}`;
}

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export default function RevenueDashboard() {
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'venue' | 'event'>(
    (params.get('scope') as 'venue' | 'event') ||
      (localStorage.getItem(SCOPE_KEY) as 'venue' | 'event') ||
      'venue',
  );
  const [id, setId] = useState<string>(params.get('id') || localStorage.getItem(ID_KEY) || '');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runScan() {
    const target = id.trim();
    if (!target) {
      setErr(`Enter a ${scope} id to scan`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ scan: ScanResult }>('POST', '/revenue-leakage/scan', {
        scope,
        id: target,
      });
      setResult(r.scan);
      localStorage.setItem(SCOPE_KEY, scope);
      localStorage.setItem(ID_KEY, target);
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Revenue Leakage</h1>
          <div className="sub">Potential vs captured vs missed revenue, with capture suggestions</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Scope</div>
            <select value={scope} onChange={(e) => setScope(e.target.value as 'venue' | 'event')}>
              <option value="venue">Venue</option>
              <option value="event">Event</option>
            </select>
          </label>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>{scope === 'venue' ? 'Venue' : 'Event'} ID</div>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder={`Paste the ${scope} id to scan`}
              style={{ width: '100%' }}
            />
          </label>
          <button className="btn primary" onClick={runScan} disabled={busy}>
            {busy ? 'Scanning...' : 'Run scan'}
          </button>
        </div>
        <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          Scans are scoped to venues and events your organization can access.
          Numbers are generated deterministically from your inventory, sponsorship,
          and quote data.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {result && (
        <>
          <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
            <div className="card metric">
              <div className="k">Potential</div>
              <div className="v">{money(result.potential)}</div>
              <div className="d">monetizable ceiling</div>
            </div>
            <div className="card metric">
              <div className="k">Captured</div>
              <div className="v">{money(result.captured)}</div>
              <div className="d">{pct(result.captured, result.potential)}% of potential</div>
            </div>
            <div className="card metric">
              <div className="k">Missed</div>
              <div className="v" style={{ color: '#c0392b' }}>{money(result.missed)}</div>
              <div className="d">{pct(result.missed, result.potential)}% leakage</div>
            </div>
          </div>

          <div className="sectitle">Capture suggestions</div>
          {result.suggestions.length === 0 ? (
            <div className="card">
              <p className="note" style={{ margin: 0 }}>No leakage detected. Everything monetizable is captured.</p>
            </div>
          ) : (
            <div className="grid cards2">
              {result.suggestions.map((s) => (
                <div className="card" key={s.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{s.label}</h3>
                    <span style={{ fontWeight: 700, color: '#c0392b' }}>{money(s.missed)}</span>
                  </div>
                  <div className="note" style={{ margin: '8px 0', lineHeight: 1.6 }}>{s.reason}</div>
                  <div className="note" style={{ lineHeight: 1.7 }}>
                    <div>Potential: {money(s.potential)}</div>
                    <div>Captured: {money(s.captured)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!result && !err && (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            Choose a scope, paste a venue or event id, and run a scan to see where
            revenue is leaking.
          </p>
        </div>
      )}
    </>
  );
}
