import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * Event Sponsor Activation (live-ops phase, Part 23-24): the live, day-of
 * checklist for a sponsor's physical activation at THIS event (booth
 * setup, banner placement, signage) -- distinct from the pre-existing
 * nonprofit fundraising sponsor tabs, which track a different domain
 * (fundraising_events). Owner/planner build the checklist per sponsor org;
 * the sponsor's own org can self-check-off their own items.
 *
 * Zero em dashes.
 */
type Activation = {
  id: string;
  sponsor_org_id: string;
  label: string;
  status: string;
  notes: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  issue: 'Issue',
};

export default function SponsorActivationTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sponsor_org_id: '', label: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ activations: Activation[] }>(`/event-sponsor-activation/event/${eventId}`)
      .then((r) => setItems(r.activations))
      .catch((e) => setError(e?.message ?? 'Failed to load sponsor activation'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function addItem() {
    if (!form.sponsor_org_id.trim() || !form.label.trim()) {
      setActionErr('Sponsor organization ID and a label are both required.');
      return;
    }
    setBusy(true);
    setActionErr(null);
    try {
      await apiSend('POST', `/event-sponsor-activation/event/${eventId}`, {
        sponsor_org_id: form.sponsor_org_id.trim(),
        label: form.label.trim(),
      });
      setForm({ sponsor_org_id: '', label: '' });
      setShowForm(false);
      load();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setActionErr(null);
    try {
      await apiSend('PATCH', `/event-sponsor-activation/event/${eventId}/${id}`, { status });
      load();
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const bySponsor = new Map<string, Activation[]>();
  for (const item of items) {
    if (!bySponsor.has(item.sponsor_org_id)) bySponsor.set(item.sponsor_org_id, []);
    bySponsor.get(item.sponsor_org_id)!.push(item);
  }

  if (loading) return <p className="ew-muted">Loading sponsor activation...</p>;
  if (error) return <p className="ew-error">{error}</p>;

  return (
    <div className="ew-spact">
      <style>{SPACT_CSS}</style>
      {actionErr ? <p className="ew-error">{actionErr}</p> : null}

      <div className="ew-spact-toolbar">
        <button type="button" className="ew-btn sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'Add activation item'}
        </button>
      </div>

      {showForm ? (
        <div className="ew-spact-form">
          <input
            className="ew-spact-input"
            placeholder="Sponsor organization ID"
            value={form.sponsor_org_id}
            onChange={(e) => setForm((f) => ({ ...f, sponsor_org_id: e.target.value }))}
          />
          <input
            className="ew-spact-input"
            placeholder="Deliverable (e.g. Step-and-repeat banner at main entrance)"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <button type="button" className="ew-btn sm" onClick={() => void addItem()} disabled={busy}>Add</button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="ew-empty"><p>No sponsor activation items tracked for this event yet.</p></div>
      ) : (
        [...bySponsor.entries()].map(([orgId, rows]) => (
          <div key={orgId} className="ew-spact-group">
            <h3 className="ew-spact-grouphead">Sponsor {orgId.slice(0, 8)}</h3>
            {rows.map((item) => (
              <div key={item.id} className="ew-spact-row" data-status={item.status}>
                <span className="ew-spact-status">{STATUS_LABEL[item.status] ?? item.status}</span>
                <span className="ew-spact-label">{item.label}</span>
                <div className="ew-spact-acts">
                  {item.status !== 'complete' ? (
                    <button type="button" className="ew-btn sm" onClick={() => void setStatus(item.id, 'complete')} disabled={busy}>Mark complete</button>
                  ) : null}
                  {item.status !== 'issue' ? (
                    <button type="button" className="ew-btn ghost sm" onClick={() => void setStatus(item.id, 'issue')} disabled={busy}>Flag issue</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

const SPACT_CSS = `
.ew-spact-toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
.ew-spact-form { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.ew-spact-input { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; }
.ew-spact-group { margin-bottom: 18px; }
.ew-spact-grouphead { font-size: 15px; color: #123c2e; margin-bottom: 8px; }
.ew-spact-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid #f0ebe0; border-radius: 10px; margin-bottom: 6px; background: #fff; }
.ew-spact-status { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(154,142,94,.15); color: #9a8a5e; white-space: nowrap; }
.ew-spact-row[data-status="complete"] .ew-spact-status { background: rgba(18,60,46,.1); color: #123c2e; }
.ew-spact-row[data-status="issue"] .ew-spact-status { background: rgba(155,44,44,.1); color: #9b2c2c; }
.ew-spact-label { flex: 1 1 auto; font-size: 13px; color: #2c2a26; }
.ew-spact-acts { display: flex; gap: 6px; }
`;
