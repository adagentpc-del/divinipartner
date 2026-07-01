/**
 * Nonprofit Post-Event Recap (Phase 2).
 *
 * Pick a fundraising event, generate a deterministic performance recap (goal,
 * total raised, sponsorship / tickets / auction / donations breakdown, net,
 * guests, board report) and work the post-event follow-up checklist (thank-you,
 * receipts, sponsor recap, monthly giving, board report, ...). Data flows
 * through /api/recap and /api/followups (org-scoped + IDOR-safe). Luxury
 * ivory/champagne theme via the shared .card/.btn/.note global classes.
 */
import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

type FundraisingEvent = { id: string; name: string };

type Recap = {
  eventName: string;
  eventKind: string | null;
  eventDate: string | null;
  goalAmount: number;
  sponsorshipRevenue: number;
  ticketRevenue: number;
  auctionRevenue: number;
  auctionAvailable: boolean;
  donationsTotal: number;
  donationCount: number;
  committedRevenue: number;
  totalRaised: number;
  revenueSource: 'payments' | 'committed';
  expenses: number;
  netRaised: number;
  goalProgressPct: number;
  guestCount: number;
  sponsorRecap: string;
  boardReport: string;
};

type FollowupTask = {
  id: string;
  kind: string | null;
  target: string | null;
  status: string | null;
};

const STATUSES = ['pending', 'sent', 'done', 'skipped'];

function money(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}

export default function PostEventRecap() {
  const [events, setEvents] = useState<FundraisingEvent[]>([]);
  const [selected, setSelected] = useState('');
  const [recap, setRecap] = useState<Recap | null>(null);
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadEvents() {
    setLoadingEvents(true);
    setErr(null);
    try {
      const r = await apiGet<{ events: FundraisingEvent[] }>('/fundraising-events');
      setEvents(r.events ?? []);
      if ((r.events ?? []).length && !selected) setSelected(r.events[0].id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function loadTasks(id: string) {
    try {
      const r = await apiGet<{ tasks: FollowupTask[] }>(`/followups/${id}`);
      setTasks(r.tasks ?? []);
    } catch {
      setTasks([]);
    }
  }

  async function generate() {
    if (!selected) {
      setErr('Pick a fundraising event first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await apiGet<{ recap: Recap }>(`/recap/${selected}`);
      setRecap(r.recap);
      await loadTasks(selected);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generateFollowups() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ tasks: FollowupTask[] }>('POST', `/followups/${selected}/generate`);
      setTasks(r.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function advance(id: string, status: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('PATCH', `/followups/task/${id}`, { status });
      if (selected) await loadTasks(selected);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Post-Event Recap</h1>
          <div className="sub">Generate a fundraising performance recap and work the follow-up checklist</div>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12, alignItems: 'end' }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Fundraising event</div>
            <select
              value={selected}
              onChange={(e) => { setSelected(e.target.value); setRecap(null); setTasks([]); }}
              style={{ width: '100%' }}
              disabled={loadingEvents || events.length === 0}
            >
              {events.length === 0 && <option value="">No fundraising events</option>}
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={generate} disabled={busy || !selected}>
              {busy ? 'Working...' : 'Generate recap'}
            </button>
            <button className="btn" onClick={generateFollowups} disabled={busy || !selected}>
              Generate follow-up tasks
            </button>
          </div>
        </div>
        {loadingEvents && <p className="note" style={{ margin: '10px 0 0' }}>Loading events...</p>}
        {!loadingEvents && events.length === 0 && (
          <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.7 }}>
            No fundraising events yet. Create one in the Fundraising Event Builder first.
          </p>
        )}
      </div>

      {recap && (
        <>
          <div className="grid cards3" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="note">Total raised</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{money(recap.totalRaised)}</div>
              <div className="note" style={{ marginTop: 4 }}>
                {recap.goalProgressPct}% of goal ({money(recap.goalAmount)}) - source: {recap.revenueSource}
              </div>
            </div>
            <div className="card">
              <div className="note">Net raised</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{money(recap.netRaised)}</div>
              <div className="note" style={{ marginTop: 4 }}>after {money(recap.expenses)} expenses</div>
            </div>
            <div className="card">
              <div className="note">Guests</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{recap.guestCount}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle">Revenue breakdown</div>
            <div className="note" style={{ lineHeight: 1.9 }}>
              <div>Sponsorship: {money(recap.sponsorshipRevenue)}</div>
              <div>Tickets / tables: {money(recap.ticketRevenue)}</div>
              <div>Donations: {money(recap.donationsTotal)} ({recap.donationCount} gifts)</div>
              <div>Auction (paid): {recap.auctionAvailable ? money(recap.auctionRevenue) : 'not available'}</div>
              <div style={{ marginTop: 6 }}>Committed total: {money(recap.committedRevenue)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle">Sponsor recap</div>
            <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>{recap.sponsorRecap}</p>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle">Board report</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0,
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {recap.boardReport}
            </pre>
          </div>
        </>
      )}

      <div className="card">
        <div className="sectitle">Follow-up checklist</div>
        {tasks.length === 0 ? (
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No follow-up tasks yet. Use "Generate follow-up tasks" to build the post-event
            workflow (thank-you, donor receipts, sponsor recap, monthly giving invite,
            next-event invite, volunteer thanks, board report, fundraising summary).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th className="note" style={{ padding: '6px 8px' }}>Task</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Status</th>
                  <th className="note" style={{ padding: '6px 8px' }}>Advance</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid rgba(0,0,0,.08)' }}>
                    <td style={{ padding: '8px' }}>
                      <div>{(t.kind ?? 'task').replace(/_/g, ' ')}</div>
                      {t.target && <div className="note" style={{ fontSize: 12 }}>{t.target}</div>}
                    </td>
                    <td style={{ padding: '8px' }}>{t.status ?? 'pending'}</td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {STATUSES.filter((s) => s !== (t.status ?? 'pending')).map((s) => (
                          <button key={s} className="btn" onClick={() => advance(t.id, s)} disabled={busy}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
