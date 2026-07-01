import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - F10 Post-Event Intelligence.
 *
 * Collect feedback from any stakeholder (venue / vendor / planner / sponsor /
 * client / attendee) on a completed event, and view the analyzed drivers:
 * average rating overall and per role, plus the top success / failure / revenue
 * drivers across all responses.
 *
 * Submit  : POST /event-memory/feedback
 * View    : GET  /event-memory/feedback/:eventId  (rows + analysis)
 */

type FeedbackRow = {
  id: string;
  event_id: string;
  role: string | null;
  rating: number | null;
  comments: string | null;
  drivers: unknown;
  created_at: string;
};

type DriverTally = { label: string; count: number };

type Analysis = {
  responses: number;
  avg_rating: number | null;
  by_role: { role: string; responses: number; avg_rating: number | null }[];
  success_drivers: DriverTally[];
  failure_drivers: DriverTally[];
  revenue_drivers: DriverTally[];
  summary: string;
};

type FeedbackResult = { feedback: FeedbackRow[]; analysis: Analysis };

// A vendor on the event's roster (GET /events/:id/vendors), used to target
// vendor feedback at one specific vendor (per-vendor granularity).
type EventVendor = {
  id: string;
  event_id: string;
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  vendor_name?: string | null;
};

// Response of POST /event-memory/feedback (F10 intelligence loop).
type ScoreUpdated = { entity_type: string; entity_id: string; score: number };
type PlaybookEligibility = {
  eligible: boolean;
  reason: string;
  avg_rating: number | null;
  responses: number;
};
type SubmitResult = {
  feedback: FeedbackRow;
  scores_updated: ScoreUpdated[];
  playbook: PlaybookEligibility;
};

const ROLES = ['venue', 'vendor', 'planner', 'sponsor', 'client', 'attendee'];

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function PostEventFeedback() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  const [eventId, setEventId] = useState<string>(params.get('event') || '');
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);

  // Submit form
  const [role, setRole] = useState('client');
  const [rating, setRating] = useState('5');
  // Per-vendor granularity: which specific vendor this vendor-feedback is about.
  const [targetVendorId, setTargetVendorId] = useState('');
  const [eventVendors, setEventVendors] = useState<EventVendor[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const [comments, setComments] = useState('');
  const [success, setSuccess] = useState('');
  const [failure, setFailure] = useState('');
  const [revenue, setRevenue] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [loop, setLoop] = useState<SubmitResult | null>(null);

  async function loadFeedback(id: string) {
    if (!id.trim()) { setErr('Enter an event id'); return; }
    setLoadBusy(true);
    setErr(null);
    try {
      setParams({ event: id.trim() });
      const r = await apiGet<FeedbackResult>(`/event-memory/feedback/${encodeURIComponent(id.trim())}`);
      setResult(r);
      loadEventVendors(id.trim());
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoadBusy(false);
    }
  }

  // Load the event's vendor roster for the per-vendor selector. Best-effort: the
  // form stays usable (no target = legacy event-level vendor feedback) if it
  // fails or the event has no vendors attached.
  async function loadEventVendors(id: string) {
    setVendorsLoaded(false);
    setEventVendors([]);
    setTargetVendorId('');
    try {
      const r = await apiGet<{ vendors: EventVendor[] }>(`/events/${encodeURIComponent(id)}/vendors`);
      setEventVendors((r.vendors ?? []).filter((v) => !!v.vendor_id));
      setVendorsLoaded(true);
    } catch {
      setVendorsLoaded(true);
    }
  }

  async function submitFeedback() {
    if (!eventId.trim()) { setErr('Enter an event id'); return; }
    setSubmitBusy(true);
    setErr(null);
    setSubmitMsg(null);
    try {
      const drivers: Record<string, string[]> = {};
      const s = splitLines(success);
      const f = splitLines(failure);
      const rv = splitLines(revenue);
      if (s.length) drivers.success = s;
      if (f.length) drivers.failure = f;
      if (rv.length) drivers.revenue = rv;
      const body = {
        event_id: eventId.trim(),
        role,
        rating: Number(rating),
        comments: comments.trim() || null,
        drivers: Object.keys(drivers).length ? drivers : null,
        // Per-vendor granularity: only meaningful for vendor feedback. Empty =>
        // legacy event-level attribution (all vendors on the event).
        target_vendor_id: role === 'vendor' && targetVendorId ? targetVendorId : null,
      };
      const res = await apiSend<SubmitResult>('POST', '/event-memory/feedback', body);
      setLoop(res);
      const n = res.scores_updated?.length ?? 0;
      setSubmitMsg(
        n > 0
          ? `Feedback recorded. Divini Scores updated for ${n} ${n === 1 ? 'entity' : 'entities'}.`
          : 'Feedback recorded.',
      );
      setComments('');
      setSuccess('');
      setFailure('');
      setRevenue('');
      setTargetVendorId('');
      await loadFeedback(eventId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitBusy(false);
    }
  }

  const analysis = result?.analysis;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Post-Event Feedback</h1>
          <div className="sub">Collect stakeholder feedback and analyze success, failure, and revenue drivers</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Event ID</div>
            <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Paste the event id" style={{ width: '100%' }} />
          </label>
          <button className="btn" onClick={() => loadFeedback(eventId)} disabled={loadBusy}>{loadBusy ? 'Loading...' : 'Load feedback'}</button>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sectitle">Add feedback</div>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Role</div>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%' }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Rating (1 to 5)</div>
            <select value={rating} onChange={(e) => setRating(e.target.value)} style={{ width: '100%' }}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </label>
        </div>
        {role === 'vendor' && (
          <label style={{ display: 'block', marginTop: 12 }}>
            <div className="note" style={{ marginBottom: 6 }}>
              About vendor (optional)
            </div>
            <select
              value={targetVendorId}
              onChange={(e) => setTargetVendorId(e.target.value)}
              style={{ width: '100%' }}
              disabled={eventVendors.length === 0}
            >
              <option value="">All vendors on this event (event-level)</option>
              {eventVendors.map((v) => (
                <option key={v.id} value={v.vendor_id as string}>
                  {v.role ? `${v.role} - ` : ''}
                  {v.vendor_name || `Vendor ${String(v.vendor_id).slice(0, 8)}`}
                </option>
              ))}
            </select>
            <div className="note" style={{ marginTop: 6, fontSize: 11 }}>
              {eventVendors.length > 0
                ? 'Pick one vendor to attribute this feedback precisely, or leave on event-level.'
                : vendorsLoaded
                  ? 'Load an event with vendors attached to target a specific one.'
                  : 'Load feedback for an event to list its vendors.'}
            </div>
          </label>
        )}
        <label style={{ display: 'block', marginTop: 12 }}>
          <div className="note" style={{ marginBottom: 6 }}>Comments</div>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} style={{ width: '100%', minHeight: 60 }} placeholder="What stood out about this event?" />
        </label>
        <div className="grid cards3" style={{ gap: 12, marginTop: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Success drivers</div>
            <textarea value={success} onChange={(e) => setSuccess(e.target.value)} style={{ width: '100%', minHeight: 60 }} placeholder={'One per line or comma separated\ne.g. great catering'} />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Failure drivers</div>
            <textarea value={failure} onChange={(e) => setFailure(e.target.value)} style={{ width: '100%', minHeight: 60 }} placeholder={'e.g. late load-in'} />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Revenue drivers</div>
            <textarea value={revenue} onChange={(e) => setRevenue(e.target.value)} style={{ width: '100%', minHeight: 60 }} placeholder={'e.g. premium bar upsell'} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={submitFeedback} disabled={submitBusy}>{submitBusy ? 'Saving...' : 'Submit feedback'}</button>
        </div>
        {submitMsg && <p className="note" style={{ margin: '10px 0 0', color: '#1e7e34' }}>{submitMsg}</p>}
        {loop?.playbook?.eligible && (
          <div
            className="card"
            style={{ marginTop: 12, borderColor: '#1e7e34', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}
          >
            <span className="note" style={{ margin: 0, lineHeight: 1.6 }}>{loop.playbook.reason}</span>
            <button className="btn" onClick={() => navigate('/playbooks')}>Save as playbook</button>
          </div>
        )}
      </div>

      {analysis && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle">Analysis</div>
            <p className="note" style={{ margin: 0, lineHeight: 1.6 }}>{analysis.summary}</p>
          </div>

          <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
            <div className="card metric"><div className="k">Responses</div><div className="v">{analysis.responses}</div><div className="d">collected</div></div>
            <div className="card metric"><div className="k">Avg rating</div><div className="v">{analysis.avg_rating != null ? `${analysis.avg_rating}/5` : '-'}</div><div className="d">overall</div></div>
            <div className="card metric"><div className="k">Roles heard</div><div className="v">{analysis.by_role.length}</div><div className="d">stakeholder types</div></div>
          </div>

          <div className="grid cards3" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="sectitle">Success drivers</div>
              <DriverList items={analysis.success_drivers} empty="None reported." />
            </div>
            <div className="card">
              <div className="sectitle">Failure drivers</div>
              <DriverList items={analysis.failure_drivers} empty="None reported." />
            </div>
            <div className="card">
              <div className="sectitle">Revenue drivers</div>
              <DriverList items={analysis.revenue_drivers} empty="None reported." />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle">By role</div>
            {analysis.by_role.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>No responses yet.</p>
            ) : (
              <div className="note" style={{ lineHeight: 1.9 }}>
                {analysis.by_role.map((r) => (
                  <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ textTransform: 'capitalize' }}>{r.role}</span>
                    <span>{r.responses} response{r.responses === 1 ? '' : 's'}{r.avg_rating != null ? ` (${r.avg_rating}/5)` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="sectitle">Responses</div>
            {result && result.feedback.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>No feedback recorded for this event yet.</p>
            ) : (
              <div className="grid cards2">
                {result?.feedback.map((f) => (
                  <div className="card" key={f.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ textTransform: 'capitalize' }}>{f.role ?? 'unknown'}</strong>
                      <span className="note">{f.rating != null ? `${f.rating}/5` : '-'}</span>
                    </div>
                    {f.comments && <p className="note" style={{ margin: '6px 0 0', lineHeight: 1.6 }}>{f.comments}</p>}
                    <div className="note" style={{ marginTop: 6, fontSize: 11 }}>{new Date(f.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function DriverList({ items, empty }: { items: DriverTally[]; empty: string }) {
  if (!items.length) return <p className="note" style={{ margin: 0 }}>{empty}</p>;
  return (
    <div className="note" style={{ lineHeight: 1.9 }}>
      {items.map((d, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{d.label}</span>
          <span style={{ fontWeight: 700 }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}
