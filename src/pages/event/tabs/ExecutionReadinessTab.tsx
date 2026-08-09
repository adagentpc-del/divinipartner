import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../../../lib/api';

/**
 * EVENT READINESS panel for the Final Event Schedule / Event Execution
 * Packet readiness engine (server/src/db/readiness.ts). Deliberately a
 * SEPARATE tab from the pre-existing "Readiness" tab (EventReadinessPanel,
 * the older Friction Elimination U2 score against /event-readiness/:id) --
 * that is a different, already-shipped feature this does not touch or
 * replace. This one is the completion-phase deliverable: the deterministic
 * checks behind Core/Schedule/Vendors/Venue-Logistics/Packet, grouped and
 * labeled to match the spec (Event/Schedule/Vendors/Logistics/
 * Communications), each incomplete item with a real, working action -- not
 * a decorative percentage.
 *
 * Zero em dashes.
 */

type ReadinessCategory = 'core' | 'schedule' | 'vendors' | 'venue' | 'packet';
type ReadinessCheck = {
  id: string;
  category: ReadinessCategory;
  label: string;
  status: 'complete' | 'missing';
  severity: 'blocking' | 'warning';
  message: string;
  fix_link: string;
};
type ReadinessReport = {
  state: 'not_ready' | 'needs_attention' | 'ready' | 'ready_with_warnings';
  percent: number;
  total_checks: number;
  completed: ReadinessCheck[];
  blocking: ReadinessCheck[];
  warnings: ReadinessCheck[];
  generated_at: string;
};

const CATEGORY_LABEL: Record<ReadinessCategory, string> = {
  core: 'Event',
  schedule: 'Schedule',
  vendors: 'Vendors',
  venue: 'Logistics',
  packet: 'Communications',
};
const CATEGORY_ORDER: ReadinessCategory[] = ['core', 'vendors', 'schedule', 'venue', 'packet'];

const STATE_LABEL: Record<ReadinessReport['state'], string> = {
  not_ready: 'NOT READY',
  needs_attention: 'NEEDS ATTENTION',
  ready: 'READY',
  ready_with_warnings: 'READY WITH WARNINGS',
};

/**
 * Every check id maps to a real workspace tab -- clicking "Add Arrival
 * Time" actually opens the Itinerary tab, not a fake modal. Checks with no
 * dedicated tab open the tab most likely to fix them (e.g. core.venue ->
 * the Venue tab). Falls back to Overview for anything unmapped.
 */
const CHECK_TAB: Record<string, string> = {
  'core.date_time': 'overview',
  'core.timezone': 'overview',
  'core.venue': 'venue',
  'core.venue_address': 'venue',
  'core.planner': 'vendors',
  'core.final_count': 'overview',
  'schedule.run_of_show': 'itinerary',
  'schedule.vendor_arrival': 'itinerary',
  'schedule.load_in': 'itinerary',
  'schedule.setup': 'itinerary',
  'schedule.strike': 'itinerary',
  'vendors.attached': 'vendors',
  'vendors.lead_contacts': 'vendors',
  'vendors.arrival_times': 'itinerary',
  'vendors.final_quantities': 'vendors',
  'vendors.final_count_ack': 'vendors',
  'venue.floorplan': 'floorplans',
  'venue.loading': 'venue',
  'venue.vendor_access': 'venue',
  'venue.emergency_contact': 'venue',
  'venue.parking': 'venue',
  'packet.generated': 'overview',
  'packet.recipients': 'overview',
  'packet.acknowledgments': 'overview',
};

const CHECK_ACTION_LABEL: Record<string, string> = {
  'core.date_time': 'Set Date/Time',
  'core.timezone': 'Set Timezone',
  'core.venue': 'Select Venue',
  'core.venue_address': 'Add Venue Address',
  'core.planner': 'Assign Planner',
  'core.final_count': 'Set Final Count',
  'schedule.run_of_show': 'Build Run of Show',
  'schedule.vendor_arrival': 'Add Arrival Time',
  'schedule.load_in': 'Schedule Load-in',
  'schedule.setup': 'Schedule Setup',
  'schedule.strike': 'Schedule Strike',
  'vendors.attached': 'Add Vendors',
  'vendors.lead_contacts': 'Add Vendor Contact',
  'vendors.arrival_times': 'Add Arrival Time',
  'vendors.final_quantities': 'Request Final Quantity',
  'vendors.final_count_ack': 'Send Reminder',
  'venue.floorplan': 'Upload Floorplan',
  'venue.loading': 'Add Loading Instructions',
  'venue.vendor_access': 'Add Vendor Access Info',
  'venue.emergency_contact': 'Set Emergency Contact',
  'venue.parking': 'Add Parking Info',
  'packet.generated': 'Generate Packet',
  'packet.recipients': 'Generate Packet',
  'packet.acknowledgments': 'Send Reminder',
};

type EventRow = { id: string; status: string | null };

/** Statuses at or beyond LIVE -- once reached, the Start Event action is
 *  retired for this event rather than offered a second time. */
const LIVE_OR_LATER = new Set(['event_day', 'completed', 'closed', 'archived']);

function stateColor(state: ReadinessReport['state']): string {
  if (state === 'ready') return '#1E5D4A';
  if (state === 'ready_with_warnings') return '#1E5D4A';
  if (state === 'needs_attention') return '#C9A35B';
  return '#b4451f';
}

export default function ExecutionReadinessTab({ eventId, onNavigateTab }: { eventId: string; onNavigateTab?: (tab: string) => void }) {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [ev, setEv] = useState<EventRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  // Start Event (Part 4): the readiness gate the backend enforces, surfaced
  // here since this is the panel that already shows the exact blockers.
  const [startBusy, setStartBusy] = useState(false);
  const [startBlocked, setStartBlocked] = useState<ReadinessCheck[] | null>(null);
  const [startedOk, setStartedOk] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [r, e] = await Promise.all([
        apiGet<{ readiness: ReadinessReport }>(`/readiness/event/${eventId}`),
        apiGet<{ event: EventRow }>(`/events/${eventId}`).catch(() => null),
      ]);
      setReport(r.readiness);
      if (e) setEv(e.event);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEvent(override: boolean) {
    setStartBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ event: EventRow }>('POST', `/events/${eventId}/start`, { override });
      setEv(r.event);
      setStartBlocked(null);
      setStartedOk(true);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const blocking = (e.body as { blocking?: ReadinessCheck[] } | null)?.blocking;
        setStartBlocked(blocking ?? []);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setStartBusy(false);
    }
  }

  async function sendReminder() {
    setReminderBusy(true);
    setErr(null);
    try {
      // The scheduled reminder job (server/src/db/packetDistribution.ts)
      // exists to avoid double-sending on a RETRIED tick; this is a
      // deliberate, explicit, one-off action the planner just clicked, so
      // it sends directly to every still-pending recipient rather than
      // going through that offset-based idempotency table.
      await apiSend('POST', `/packet-distribution/event/${eventId}/remind-now`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setReminderBusy(false);
    }
  }

  function act(c: ReadinessCheck) {
    if (c.id === 'vendors.final_count_ack' || c.id === 'packet.acknowledgments') {
      void sendReminder();
      return;
    }
    const tab = CHECK_TAB[c.id] ?? 'overview';
    onNavigateTab?.(tab);
  }

  if (busy && !report) return <p className="ew-empty"><p>Loading readiness...</p></p>;
  if (err && !report) return <p className="ew-error">{err}</p>;
  if (!report) return null;

  const byCategory = new Map<ReadinessCategory, ReadinessCheck[]>();
  for (const c of [...report.completed, ...report.blocking, ...report.warnings]) {
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }

  return (
    <div className="ew-rdy">
      <style>{RDY_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-rdy-hero" style={{ borderColor: stateColor(report.state) }}>
        <div className="ew-rdy-pct" style={{ color: stateColor(report.state) }}>{report.percent}%</div>
        <div className="ew-rdy-state" style={{ color: stateColor(report.state) }}>{STATE_LABEL[report.state]}</div>
        <div className="ew-rdy-heroacts">
          {ev && !LIVE_OR_LATER.has(ev.status ?? '') ? (
            <button
              type="button"
              className="ew-btn sm ew-rdy-start"
              onClick={() => void startEvent(false)}
              disabled={startBusy}
            >
              {startBusy ? 'Starting...' : 'Start Event'}
            </button>
          ) : ev ? (
            <span className="ew-rdy-live">Event is live</span>
          ) : null}
          <button type="button" className="ew-btn ghost sm ew-rdy-refresh" onClick={() => void load()} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {startedOk ? <p className="ew-rdy-startok">Event started. It is now live.</p> : null}

      {startBlocked ? (
        <div className="ew-rdy-block">
          <div className="ew-rdy-blockhead">EVENT NOT FULLY READY</div>
          <p className="ew-rdy-blocksub">
            {startBlocked.length} blocking issue{startBlocked.length === 1 ? '' : 's'} must be resolved before this
            event can start, or an owner/planner may start anyway.
          </p>
          <ul>
            {startBlocked.map((c) => (
              <li key={c.id}>{c.message}</li>
            ))}
          </ul>
          <div className="ew-rdy-blockacts">
            <button type="button" className="ew-btn ghost sm" onClick={() => setStartBlocked(null)} disabled={startBusy}>
              Resolve First
            </button>
            <button type="button" className="ew-btn sm ew-rdy-danger" onClick={() => void startEvent(true)} disabled={startBusy}>
              {startBusy ? 'Starting...' : 'Start Anyway'}
            </button>
          </div>
        </div>
      ) : null}

      {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => {
        const checks = (byCategory.get(cat) ?? []).slice().sort((a, b) => {
          // incomplete first (blocking, then warning), complete last
          const rank = (x: ReadinessCheck) => (x.status === 'complete' ? 2 : x.severity === 'blocking' ? 0 : 1);
          return rank(a) - rank(b);
        });
        return (
          <section key={cat} className="ew-rdy-cat">
            <h3>{CATEGORY_LABEL[cat]}</h3>
            <ul>
              {checks.map((c) => (
                <li key={c.id} className={c.status === 'complete' ? 'is-ok' : c.severity === 'blocking' ? 'is-block' : 'is-warn'}>
                  <span className="ew-rdy-glyph" aria-hidden="true">{c.status === 'complete' ? '✓' : '⚠'}</span>
                  <span className="ew-rdy-body">
                    <span className="ew-rdy-label">{c.label}</span>
                    <span className="ew-rdy-msg">{c.message}</span>
                  </span>
                  {c.status === 'missing' ? (
                    <button
                      type="button"
                      className="ew-btn ghost sm"
                      onClick={() => act(c)}
                      disabled={reminderBusy && (c.id === 'vendors.final_count_ack' || c.id === 'packet.acknowledgments')}
                    >
                      {CHECK_ACTION_LABEL[c.id] ?? 'Fix'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const RDY_CSS = `
.ew-rdy { display: flex; flex-direction: column; gap: 18px; }
.ew-rdy-hero {
  display: flex; align-items: baseline; gap: 16px; padding: 18px 20px; border: 1.5px solid; border-radius: 14px;
  background: rgba(247,244,238,.5);
}
.ew-rdy-pct { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 40px; font-weight: 600; line-height: 1; }
.ew-rdy-state { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.ew-rdy-heroacts { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 10px; }
.ew-rdy-live { font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #1E5D4A; }
.ew-rdy-startok { margin: 0; padding: 10px 14px; border-radius: 10px; background: rgba(30,93,74,.08); color: #1E5D4A; font-size: 13px; font-weight: 600; }
.ew-rdy-block { border: 1.5px solid #b4451f; border-radius: 14px; padding: 16px 18px; background: rgba(180,69,31,.05); }
.ew-rdy-blockhead { font-size: 13px; font-weight: 700; letter-spacing: 1px; color: #b4451f; margin-bottom: 6px; }
.ew-rdy-blocksub { margin: 0 0 10px; font-size: 12.5px; color: var(--dp-muted); line-height: 1.5; }
.ew-rdy-block ul { margin: 0 0 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.ew-rdy-block li { font-size: 13px; color: var(--dp-ink); }
.ew-rdy-blockacts { display: flex; gap: 10px; }
.ew-rdy-danger { background: #b4451f; border-color: #b4451f; color: #fff; }
.ew-rdy-cat h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: var(--dp-emerald); }
.ew-rdy-cat ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ew-rdy-cat li {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--dp-line);
  background: #fff;
}
.ew-rdy-cat li.is-ok { background: rgba(30,93,74,.05); }
.ew-rdy-cat li.is-warn { border-color: rgba(201,163,91,.5); }
.ew-rdy-cat li.is-block { border-color: rgba(180,69,31,.5); background: rgba(180,69,31,.04); }
.ew-rdy-glyph { flex: 0 0 auto; width: 22px; text-align: center; font-size: 15px; }
.is-ok .ew-rdy-glyph { color: #1E5D4A; }
.is-warn .ew-rdy-glyph { color: #9a7e3e; }
.is-block .ew-rdy-glyph { color: #b4451f; }
.ew-rdy-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.ew-rdy-label { font-size: 13.5px; font-weight: 600; color: var(--dp-ink); }
.ew-rdy-msg { font-size: 12px; color: var(--dp-muted); }
`;
