import React, { useState } from 'react';
import { apiSend } from '../lib/api';
import EventReadinessPanel from './EventReadinessPanel';

/**
 * Friction Elimination - U1 Client Event Intelligence Assistant.
 *
 * A short intake wizard (event type, guest count, budget, venue type, desired
 * experience, indoor/outdoor, date, optional event id) that calls
 * /event-assistant/generate and renders the deterministic plan: required +
 * recommended vendors, recommended sponsorships, budget breakdown, timeline,
 * required approvals, and required documents. When an event id is provided the
 * plan is persisted server-side and the U2 readiness panel is shown alongside.
 *
 * There is no apiPost in src/lib/api.ts, so this uses apiSend('POST', ...).
 * Route wiring (src/App.tsx) and Shell are owned by the integration lead and
 * are intentionally not edited here.
 */

const VENUE_TYPES = [
  '', 'ballroom', 'hotel', 'outdoor', 'rooftop', 'warehouse', 'conference', 'gallery', 'stadium',
];
const EVENT_TYPES = [
  '', 'wedding', 'corporate', 'conference', 'trade_show', 'gala', 'concert', 'launch', 'social',
];
const INDOOR_OUTDOOR = ['', 'indoor', 'outdoor', 'both'];

type PlanVendor = {
  category: string;
  label: string;
  score: number;
  required: boolean;
  reasons: string[];
};
type PlanSponsorship = { category: string; label: string; score: number; reasons: string[] };
type BudgetLine = { category: string; label: string; pct: number; amount: number };
type TimelineMilestone = {
  key: string;
  label: string;
  offsetDays: number;
  dueDate: string | null;
  detail: string;
};
type EventPlan = {
  input: {
    eventType: string | null;
    guestCount: number | null;
    budget: number | null;
    venueType: string | null;
    experience: string | null;
    indoorOutdoor: string | null;
    eventDate: string | null;
    budgetTier: string;
    guestBand: string;
  };
  recommendedVendors: PlanVendor[];
  requiredVendors: PlanVendor[];
  recommendedSponsorships: PlanSponsorship[];
  budgetBreakdown: BudgetLine[];
  timeline: TimelineMilestone[];
  requiredApprovals: string[];
  requiredDocuments: string[];
  ai_reranked: boolean;
  notes: string;
};

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

function VendorRow({ v }: { v: PlanVendor }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 0',
        borderTop: '1px solid #efe9dd',
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{v.label}</div>
        {v.reasons.length > 0 && (
          <div className="note" style={{ lineHeight: 1.5 }}>{v.reasons.slice(0, 3).join('  ·  ')}</div>
        )}
      </div>
      <span style={{ fontWeight: 700, color: '#C9A35B', fontSize: 18, flexShrink: 0 }}>{v.score}</span>
    </div>
  );
}

export default function EventAssistant() {
  const [eventType, setEventType] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [budget, setBudget] = useState('');
  const [venueType, setVenueType] = useState('');
  const [experience, setExperience] = useState('');
  const [indoorOutdoor, setIndoorOutdoor] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventId, setEventId] = useState('');

  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [savedEventId, setSavedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      const intake = {
        eventType: eventType || null,
        guestCount: num(guestCount),
        budget: num(budget),
        venueType: venueType || null,
        experience: experience.trim() || null,
        indoorOutdoor: indoorOutdoor || null,
        eventDate: eventDate || null,
      };
      const trimmedEventId = eventId.trim();
      const r = await apiSend<{ plan: EventPlan; saved: { event_id: string } | null }>(
        'POST',
        '/event-assistant/generate',
        { intake, event_id: trimmedEventId || undefined },
      );
      setPlan(r.plan);
      setSavedEventId(r.saved?.event_id ?? null);
    } catch (e) {
      setErr((e as Error).message);
      setPlan(null);
      setSavedEventId(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Event Intelligence Assistant</h1>
          <div className="sub">Answer a few questions and get a complete starter plan</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Event type</div>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: '100%' }}>
              {EVENT_TYPES.map((v) => (
                <option key={v || 'any'} value={v}>{v ? v.replace(/_/g, ' ') : 'Any / not sure'}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Venue type</div>
            <select value={venueType} onChange={(e) => setVenueType(e.target.value)} style={{ width: '100%' }}>
              {VENUE_TYPES.map((v) => (
                <option key={v || 'any'} value={v}>{v ? v.replace(/_/g, ' ') : 'Any / not sure'}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Guest count</div>
            <input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} style={{ width: '100%' }} placeholder="200" inputMode="numeric" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Budget ($)</div>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: '100%' }} placeholder="50000" inputMode="numeric" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Indoor / outdoor</div>
            <select value={indoorOutdoor} onChange={(e) => setIndoorOutdoor(e.target.value)} style={{ width: '100%' }}>
              {INDOOR_OUTDOOR.map((v) => (
                <option key={v || 'any'} value={v}>{v ? v : 'Any / not sure'}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Event date</div>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            <div className="note" style={{ marginBottom: 6 }}>Desired experience (optional)</div>
            <input value={experience} onChange={(e) => setExperience(e.target.value)} style={{ width: '100%' }} placeholder="Elegant, candlelit, live music, seated dinner" />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            <div className="note" style={{ marginBottom: 6 }}>Attach to event (optional event id, saves the plan)</div>
            <input value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: '100%' }} placeholder="Paste an event id to save this plan to the workspace" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={generate} disabled={loading}>
            {loading ? 'Building plan...' : 'Generate plan'}
          </button>
        </div>
        <p className="note" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
          The plan is generated deterministically. Leave any field blank if you
          are not sure; the more you provide, the sharper the plan.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {plan && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="note" style={{ lineHeight: 1.7 }}>
              Budget tier: <strong>{plan.input.budgetTier}</strong>
              {'  ·  '}
              Guest band: <strong>{plan.input.guestBand}</strong>
              {savedEventId && (
                <>
                  {'  ·  '}
                  <span style={{ color: '#1E5D4A' }}>Saved to event</span>
                </>
              )}
            </div>
            <p className="note" style={{ margin: '8px 0 0', lineHeight: 1.6 }}>{plan.notes}</p>
          </div>

          {savedEventId && (
            <div style={{ marginBottom: 16 }}>
              <EventReadinessPanel eventId={savedEventId} />
            </div>
          )}

          <div className="grid cards2" style={{ gap: 16 }}>
            <div className="card">
              <h3 style={{ margin: '0 0 6px' }}>Required vendors</h3>
              {plan.requiredVendors.length === 0 ? (
                <p className="note" style={{ margin: 0 }}>No hard requirements detected.</p>
              ) : (
                plan.requiredVendors.map((v) => <VendorRow key={v.category} v={v} />)
              )}
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 6px' }}>Recommended vendors</h3>
              {plan.recommendedVendors.length === 0 ? (
                <p className="note" style={{ margin: 0 }}>No additional recommendations.</p>
              ) : (
                plan.recommendedVendors.map((v) => <VendorRow key={v.category} v={v} />)
              )}
            </div>
          </div>

          <div className="sectitle" style={{ margin: '20px 0 10px' }}>Budget breakdown</div>
          <div className="card">
            {plan.budgetBreakdown.map((b) => (
              <div
                key={b.category}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: '1px solid #efe9dd',
                }}
              >
                <span>{b.label} <span className="note">({Math.round(b.pct * 100)}%)</span></span>
                <span style={{ fontWeight: 600 }}>{plan.input.budget != null ? money(b.amount) : '-'}</span>
              </div>
            ))}
          </div>

          <div className="sectitle" style={{ margin: '20px 0 10px' }}>Timeline</div>
          <div className="card">
            {plan.timeline.map((m) => (
              <div key={m.key} style={{ padding: '8px 0', borderTop: '1px solid #efe9dd' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontWeight: 600 }}>{m.label}</span>
                  <span className="note" style={{ flexShrink: 0 }}>
                    {m.dueDate ? m.dueDate : `${m.offsetDays} days before`}
                  </span>
                </div>
                <div className="note" style={{ lineHeight: 1.5 }}>{m.detail}</div>
              </div>
            ))}
          </div>

          {plan.recommendedSponsorships.length > 0 && (
            <>
              <div className="sectitle" style={{ margin: '20px 0 10px' }}>Recommended sponsorships</div>
              <div className="grid cards3">
                {plan.recommendedSponsorships.map((s) => (
                  <div key={s.category} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h3 style={{ margin: 0 }}>{s.label}</h3>
                      <span style={{ fontWeight: 700, color: '#C9A35B' }}>{s.score}</span>
                    </div>
                    {s.reasons.length > 0 && (
                      <p className="note" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
                        {s.reasons.slice(0, 3).join('  ·  ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="grid cards2" style={{ gap: 16, marginTop: 20 }}>
            <div className="card">
              <h3 style={{ margin: '0 0 6px' }}>Required approvals</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {plan.requiredApprovals.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 6px' }}>Required documents</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {plan.requiredDocuments.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}
