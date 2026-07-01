import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - Feature 9: Approval Graph Engine.
 *
 * Two panels:
 *   1. Approval contacts: manage the people who own each approval TYPE (venue,
 *      branding, sponsor, engineering, insurance, legal, finance) for your org
 *      and optionally a specific venue. These are the routing targets.
 *   2. Event approval board: paste an event id to see its approvals grouped into
 *      the visibility columns (submitted / pending / approved / rejected /
 *      requires_revision). Submit a new approval (the engine routes it to a
 *      contact by type), decide one, or escalate stalled ones.
 *
 * All data flows through the org / venue / event-scoped /approval-graph API.
 * The selected event id is remembered in localStorage so it survives a refresh.
 */

type ApprovalType =
  | 'venue'
  | 'branding'
  | 'sponsor'
  | 'engineering'
  | 'insurance'
  | 'legal'
  | 'finance';

type ApprovalStatus =
  | 'submitted'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'requires_revision';

type Contact = {
  id: string;
  org_id?: string | null;
  venue_id?: string | null;
  approval_type: ApprovalType;
  name: string;
  email?: string | null;
  role?: string | null;
  created_at?: string;
};

type ApprovalRequest = {
  id: string;
  event_id?: string | null;
  approval_type: ApprovalType;
  contact_id?: string | null;
  subject?: string | null;
  status: ApprovalStatus;
  submitted_at?: string | null;
  decided_at?: string | null;
  notes?: string | null;
  escalated?: boolean;
};

const TYPES: ApprovalType[] = [
  'venue', 'branding', 'sponsor', 'engineering', 'insurance', 'legal', 'finance',
];

const COLUMNS: { key: ApprovalStatus; label: string }[] = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'requires_revision', label: 'Requires revision' },
];

const EVENT_KEY = 'dp.im.approvalEventId';

type ContactDraft = {
  approval_type: ApprovalType;
  name: string;
  email: string;
  role: string;
  venue_id: string;
};

const EMPTY_CONTACT: ContactDraft = {
  approval_type: 'venue', name: '', email: '', role: '', venue_id: '',
};

function fmtDate(v?: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

export default function ApprovalGraph() {
  const [params, setParams] = useSearchParams();
  const initialEvent = params.get('event') || localStorage.getItem(EVENT_KEY) || '';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);

  const [eventId, setEventId] = useState<string>(initialEvent);
  const [eventInput, setEventInput] = useState<string>(initialEvent);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // New-approval form.
  const [newType, setNewType] = useState<ApprovalType>('venue');
  const [newSubject, setNewSubject] = useState('');

  async function loadContacts() {
    setContactErr(null);
    try {
      const r = await apiGet<{ contacts: Contact[] }>(`/approval-graph/contacts`);
      setContacts(r.contacts ?? []);
    } catch (e) {
      setContactErr((e as Error).message);
      setContacts([]);
    }
  }

  async function loadBoard(id: string) {
    if (!id) { setRequests([]); return; }
    setBoardLoading(true);
    setBoardErr(null);
    try {
      const r = await apiGet<{ requests: ApprovalRequest[] }>(
        `/approval-graph/requests/event/${encodeURIComponent(id)}`,
      );
      setRequests(r.requests ?? []);
    } catch (e) {
      setBoardErr((e as Error).message);
      setRequests([]);
    } finally {
      setBoardLoading(false);
    }
  }

  useEffect(() => { void loadContacts(); }, []);
  useEffect(() => { void loadBoard(eventId); }, [eventId]);

  function applyEvent() {
    const id = eventInput.trim();
    setEventId(id);
    if (id) {
      localStorage.setItem(EVENT_KEY, id);
      setParams({ event: id });
    } else {
      localStorage.removeItem(EVENT_KEY);
      setParams({});
    }
  }

  async function saveContact() {
    if (!contactDraft) return;
    if (!contactDraft.name.trim()) { setContactErr('Name is required'); return; }
    setBusy(true);
    setContactErr(null);
    const body: Record<string, unknown> = {
      approval_type: contactDraft.approval_type,
      name: contactDraft.name.trim(),
      email: contactDraft.email.trim() || null,
      role: contactDraft.role.trim() || null,
      venue_id: contactDraft.venue_id.trim() || null,
    };
    try {
      await apiSend('POST', `/approval-graph/contacts`, body);
      setContactDraft(null);
      await loadContacts();
    } catch (e) {
      setContactErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeContact(id: string) {
    if (!window.confirm('Delete this approval contact?')) return;
    setBusy(true);
    try {
      await apiSend('DELETE', `/approval-graph/contacts/${id}`);
      await loadContacts();
    } catch (e) {
      setContactErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval() {
    if (!eventId) { setBoardErr('Load an event first'); return; }
    setBusy(true);
    setBoardErr(null);
    try {
      await apiSend('POST', `/approval-graph/requests`, {
        event_id: eventId,
        approval_type: newType,
        subject: newSubject.trim() || null,
      });
      setNewSubject('');
      await loadBoard(eventId);
    } catch (e) {
      setBoardErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: ApprovalStatus) {
    setBusy(true);
    setBoardErr(null);
    try {
      await apiSend('PATCH', `/approval-graph/requests/${id}`, { status });
      await loadBoard(eventId);
    } catch (e) {
      setBoardErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    if (!eventId) return;
    setBusy(true);
    setBoardErr(null);
    try {
      const r = await apiSend<{ count: number }>('POST', `/approval-graph/requests/escalate`, {
        event_id: eventId,
      });
      await loadBoard(eventId);
      window.alert(
        r.count > 0
          ? `Escalated ${r.count} stalled approval(s).`
          : 'No stalled approvals to escalate.',
      );
    } catch (e) {
      setBoardErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const byStatus = (s: ApprovalStatus) => requests.filter((r) => r.status === s);
  const contactName = (id?: string | null) =>
    id ? contacts.find((c) => c.id === id)?.name ?? 'Assigned contact' : 'Unrouted';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approval Graph</h1>
          <div className="sub">Route, track, and escalate event sign-offs by type</div>
        </div>
      </div>

      {/* ---- Approval contacts ---- */}
      <div className="sectitle">Approval contacts</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="note">The owner of each approval type. New requests route to the best match.</div>
          <button className="btn" onClick={() => setContactDraft({ ...EMPTY_CONTACT })}>+ Add contact</button>
        </div>

        {contactErr && <div className="note" style={{ color: 'crimson', marginBottom: 8 }}>{contactErr}</div>}

        {contactDraft && (
          <div className="card" style={{ marginBottom: 12, background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 140px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Type</div>
                <select
                  value={contactDraft.approval_type}
                  onChange={(e) => setContactDraft({ ...contactDraft, approval_type: e.target.value as ApprovalType })}
                  style={{ width: '100%' }}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ flex: '1 1 180px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Name</div>
                <input value={contactDraft.name} onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label style={{ flex: '1 1 200px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Email</div>
                <input value={contactDraft.email} onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label style={{ flex: '1 1 160px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Role</div>
                <input value={contactDraft.role} onChange={(e) => setContactDraft({ ...contactDraft, role: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label style={{ flex: '1 1 200px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Venue ID (optional)</div>
                <input value={contactDraft.venue_id} onChange={(e) => setContactDraft({ ...contactDraft, venue_id: e.target.value })} placeholder="Pin to a venue" style={{ width: '100%' }} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" disabled={busy} onClick={() => void saveContact()}>Save</button>
                <button className="btn" disabled={busy} onClick={() => setContactDraft(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {contacts.length === 0 ? (
          <div className="note">No approval contacts yet. Add one per type so requests can route automatically.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Type</th><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <td><span className="tag">{c.approval_type}</span></td>
                  <td>{c.name}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.role || '-'}</td>
                  <td>{c.venue_id ? 'Venue' : 'Org-wide'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" disabled={busy} onClick={() => void removeContact(c.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Event approval board ---- */}
      <div className="sectitle">Event approval board</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Event ID</div>
            <input
              value={eventInput}
              onChange={(e) => setEventInput(e.target.value)}
              placeholder="Paste the event id to view its approvals"
              style={{ width: '100%' }}
            />
          </label>
          <button className="btn" onClick={applyEvent}>Load board</button>
          {eventId && <button className="btn" disabled={busy} onClick={() => void escalate()}>Escalate stalled</button>}
        </div>

        {eventId && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <label style={{ flex: '1 1 160px' }}>
              <div className="note" style={{ marginBottom: 6 }}>New approval type</div>
              <select value={newType} onChange={(e) => setNewType(e.target.value as ApprovalType)} style={{ width: '100%' }}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ flex: '1 1 280px' }}>
              <div className="note" style={{ marginBottom: 6 }}>Subject (optional)</div>
              <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="What needs sign-off" style={{ width: '100%' }} />
            </label>
            <button className="btn primary" disabled={busy} onClick={() => void submitApproval()}>Submit approval</button>
          </div>
        )}

        {boardErr && <div className="note" style={{ color: 'crimson', marginTop: 10 }}>{boardErr}</div>}
      </div>

      {eventId && (
        boardLoading ? (
          <div className="note">Loading approvals...</div>
        ) : (
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {COLUMNS.map((col) => {
              const items = byStatus(col.key);
              return (
                <div key={col.key} className="card">
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {col.label} <span className="note">({items.length})</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="note">None</div>
                  ) : (
                    items.map((r) => (
                      <div key={r.id} className="card" style={{ marginBottom: 8, background: 'rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                          <span className="tag">{r.approval_type}</span>
                          {r.escalated && <span className="tag" style={{ color: 'crimson' }}>escalated</span>}
                        </div>
                        <div style={{ marginTop: 6 }}>{r.subject || `${r.approval_type} approval`}</div>
                        <div className="note" style={{ marginTop: 4 }}>To: {contactName(r.contact_id)}</div>
                        <div className="note">Submitted {fmtDate(r.submitted_at)}{r.decided_at ? ` - decided ${fmtDate(r.decided_at)}` : ''}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {col.key !== 'pending' && col.key !== 'approved' && col.key !== 'rejected' && (
                            <button className="btn" disabled={busy} onClick={() => void decide(r.id, 'pending')}>Mark pending</button>
                          )}
                          {(col.key === 'submitted' || col.key === 'pending' || col.key === 'requires_revision') && (
                            <>
                              <button className="btn primary" disabled={busy} onClick={() => void decide(r.id, 'approved')}>Approve</button>
                              <button className="btn" disabled={busy} onClick={() => void decide(r.id, 'rejected')}>Reject</button>
                              <button className="btn" disabled={busy} onClick={() => void decide(r.id, 'requires_revision')}>Revision</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </>
  );
}
