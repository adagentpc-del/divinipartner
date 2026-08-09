import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Incident Management (live-ops phase, Part 15-16). Any event participant
 * can report an incident; only the owner/planner or the incident's own
 * assigned responder may update status/assignment/resolution
 * (server-enforced, db/incidents.ts). Visibility is also server-enforced
 * (lib/incidentVisibility.ts): a general vendor or sponsor never sees
 * medical/security/guest-category incidents or anything explicitly
 * restricted -- this tab simply renders whatever the backend already
 * decided to show, it never applies its own filter.
 *
 * Zero em dashes.
 */

type IncidentCategory =
  | 'medical' | 'security' | 'vendor' | 'guest' | 'venue' | 'equipment'
  | 'inventory' | 'weather' | 'transportation' | 'safety' | 'damage' | 'other';

type Incident = {
  id: string;
  category: string;
  severity: string;
  location: string | null;
  description: string;
  submitted_by: string | null;
  assigned_to: string | null;
  status: string;
  resolution: string | null;
  restricted: boolean;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', monitoring: 'Monitoring', resolved: 'Resolved', closed: 'Closed',
};
const SEVERITY_COLOR: Record<string, string> = {
  low: '#6b6459', medium: '#9a7e3e', high: '#b4451f', critical: '#8a3a3a',
};

export default function IncidentsTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Incident[]>([]);
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'other', severity: 'medium', location: '', description: '' });
  const [submitBusy, setSubmitBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<{ incidents: Incident[] }>(`/incidents/event/${eventId}`),
      apiGet<{ categories: IncidentCategory[] }>('/incidents/meta').catch(() => ({ categories: [] })),
    ])
      .then(([r, meta]) => { setRows(r.incidents ?? []); setCategories(meta.categories); })
      .catch((e) => setError(e?.message ?? 'Failed to load incidents'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.description.trim()) { setActionErr('A description is required.'); return; }
    setSubmitBusy(true);
    setActionErr(null);
    try {
      await apiSend('POST', `/incidents/event/${eventId}`, {
        category: form.category,
        severity: form.severity,
        location: form.location.trim() || null,
        description: form.description.trim(),
      });
      setForm({ category: 'other', severity: 'medium', location: '', description: '' });
      setShowForm(false);
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setSubmitBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setActionBusy(id + status);
    setActionErr(null);
    try {
      await apiSend('PATCH', `/incidents/event/${eventId}/${id}`, { status });
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <p className="ew-muted">Loading incidents...</p>;
  if (error) return <p className="ew-error">{error}</p>;

  return (
    <div className="ew-inc">
      <style>{INC_CSS}</style>
      {actionErr ? <p className="ew-error">{actionErr}</p> : null}

      <div className="ew-inc-toolbar">
        <button type="button" className="ew-btn sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'Report incident'}
        </button>
      </div>

      {showForm ? (
        <div className="ew-inc-form">
          <div className="ew-inc-formrow">
            <select className="ew-inc-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {(categories.length ? categories : ['other']).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className="ew-inc-input" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <input
            className="ew-inc-input"
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <textarea
            className="ew-inc-input"
            placeholder="What happened?"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <button type="button" className="ew-btn sm" onClick={() => void submit()} disabled={submitBusy}>
            {submitBusy ? 'Reporting...' : 'Report'}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="ew-empty"><p>No incidents visible to you for this event.</p></div>
      ) : (
        <div className="ew-inc-list">
          {rows.map((inc) => (
            <div key={inc.id} className="ew-inc-card">
              <div className="ew-inc-top">
                <span className="ew-inc-cat">{inc.category}{inc.restricted ? ' -- restricted' : ''}</span>
                <span className="ew-inc-sev" style={{ color: SEVERITY_COLOR[inc.severity] ?? '#6b6459' }}>{inc.severity}</span>
                <span className="ew-inc-status">{STATUS_LABEL[inc.status] ?? inc.status}</span>
              </div>
              <p className="ew-inc-desc">{inc.description}</p>
              {inc.location ? <p className="ew-inc-loc">Location: {inc.location}</p> : null}
              {inc.resolution ? <p className="ew-inc-res">Resolution: {inc.resolution}</p> : null}
              {inc.status !== 'resolved' && inc.status !== 'closed' ? (
                <div className="ew-inc-acts">
                  <button type="button" className="ew-btn ghost sm" onClick={() => void setStatus(inc.id, 'monitoring')} disabled={!!actionBusy}>
                    {actionBusy === inc.id + 'monitoring' ? '...' : 'Monitoring'}
                  </button>
                  <button type="button" className="ew-btn sm" onClick={() => void setStatus(inc.id, 'resolved')} disabled={!!actionBusy}>
                    {actionBusy === inc.id + 'resolved' ? '...' : 'Resolve'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const INC_CSS = `
.ew-inc-toolbar { margin-bottom: 14px; }
.ew-inc-form { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.ew-inc-formrow { display: flex; gap: 8px; }
.ew-inc-input { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; flex: 1; }
.ew-inc-list { display: flex; flex-direction: column; gap: 12px; }
.ew-inc-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 16px 18px; }
.ew-inc-top { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.ew-inc-cat { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #123c2e; }
.ew-inc-sev { font-size: 11px; font-weight: 700; text-transform: uppercase; }
.ew-inc-status { margin-left: auto; font-size: 11px; font-weight: 600; color: #6b6459; }
.ew-inc-desc { font-size: 13.5px; color: #2c2a26; margin: 4px 0; line-height: 1.5; }
.ew-inc-loc, .ew-inc-res { font-size: 12px; color: #6b6459; margin: 2px 0; }
.ew-inc-acts { display: flex; gap: 8px; margin-top: 10px; }
`;
