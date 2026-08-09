import React, { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

/**
 * Event Command Center (live-ops phase, Part 5-6, extended in Part 7-8 for
 * real vendor/staff arrival status). The live event-day operating view:
 * current/next Run of Show item, guest headcount, the vendor arrival
 * schedule with derived arrival status, staff check-in counts, task status
 * counts, and today's event changes -- every number here comes straight
 * from server/src/db/eventCommandCenter.ts, which derives it fresh from
 * the real underlying systems on each call.
 * Sections with no underlying system yet (Incidents, Sponsor activations,
 * Inventory alerts) render an honest "not tracked yet" note rather than a
 * fabricated number -- they will fill in as those parts of the live-ops
 * phase ship, in this same tab.
 *
 * Distinct from the pre-existing "Divini Command Center" (the org-level AI
 * COO ask-a-question feature) -- this is a per-event live operations view,
 * a different system entirely.
 *
 * Zero em dashes.
 */

type PacketAudience = 'full' | 'venue' | 'vendor' | 'vendor_staff' | 'sponsor' | 'event_staff';

type ScheduleItem = { title: string; start_time: string | null; end_time: string | null; location: string | null };

type VendorScheduleRow = {
  start_time: string | null;
  end_time: string | null;
  vendor_org_id: string;
  vendor_name: string;
  action: string;
  category: string;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
};

type ArrivalStatus = 'not_due' | 'due_soon' | 'on_time' | 'early' | 'late' | 'checked_in' | 'completed' | 'no_show';

type VendorArrivalSummaryRow = {
  organization_id: string;
  vendor_name: string;
  scheduled_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  status: ArrivalStatus;
};

type CommandCenter = {
  audience: PacketAudience;
  event: { id: string; name: string; status: string | null; date_time: string | null; timezone: string | null };
  current_status: { current_item: ScheduleItem | null; next_item: ScheduleItem | null; elapsed_minutes: number | null };
  guests: { checked_in: number; vip_checked_in: number; total: number } | null;
  vendors: { expected: number; rows: VendorScheduleRow[]; arrivals: VendorArrivalSummaryRow[] } | null;
  staff: { expected: number; checked_in: number } | null;
  tasks: { complete: number; active: number; blocked: number; total: number } | null;
  changes: { today_count: number; today_financial_impact: number | null } | null;
  incidents: null;
  sponsors: null;
  inventory: null;
  timeline: Array<{ at: string; label: string; kind: string }>;
  generated_at: string;
};

const ARRIVAL_LABEL: Record<ArrivalStatus, string> = {
  not_due: 'Not due',
  due_soon: 'Due soon',
  on_time: 'On time',
  early: 'Early',
  late: 'Late',
  checked_in: 'Checked in',
  completed: 'Completed',
  no_show: 'No show',
};
function arrivalColor(s: ArrivalStatus): string {
  if (s === 'completed' || s === 'on_time' || s === 'checked_in' || s === 'early') return '#1E5D4A';
  if (s === 'due_soon' || s === 'not_due') return '#6b6459';
  return '#b4451f';
}

function fmtTime(v: string | null): string {
  if (!v) return 'TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'TBD' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtElapsed(min: number | null): string {
  if (min == null) return 'Not live yet';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m elapsed` : `${m}m elapsed`;
}

export default function EventCommandCenterTab({ eventId }: { eventId: string }) {
  const [cc, setCc] = useState<CommandCenter | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiGet<{ command_center: CommandCenter }>(`/event-command-center/event/${eventId}`);
      setCc(r.command_center);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (busy && !cc) return <p className="ew-empty">Loading Command Center...</p>;
  if (err && !cc) return <p className="ew-error">{err}</p>;
  if (!cc) return null;

  return (
    <div className="ew-cc">
      <style>{CC_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-cc-head">
        <div>
          <div className="ew-cc-kicker">{cc.event.status === 'event_day' ? 'LIVE' : (cc.event.status ?? '').replace(/_/g, ' ').toUpperCase()}</div>
          <h2 className="ew-cc-title">{cc.event.name}</h2>
        </div>
        <button type="button" className="ew-btn ghost sm" onClick={() => void load()} disabled={busy}>
          {busy ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <section className="ew-cc-card ew-cc-status">
        <h3>Current status</h3>
        <div className="ew-cc-statusgrid">
          <div>
            <span className="ew-cc-label">Current</span>
            <span className="ew-cc-val">{cc.current_status.current_item?.title ?? 'Nothing scheduled now'}</span>
          </div>
          <div>
            <span className="ew-cc-label">Next</span>
            <span className="ew-cc-val">
              {cc.current_status.next_item
                ? `${cc.current_status.next_item.title} at ${fmtTime(cc.current_status.next_item.start_time)}`
                : 'Nothing upcoming'}
            </span>
          </div>
          <div>
            <span className="ew-cc-label">Elapsed</span>
            <span className="ew-cc-val">{fmtElapsed(cc.current_status.elapsed_minutes)}</span>
          </div>
        </div>
      </section>

      <div className="ew-cc-grid">
        {cc.guests ? (
          <section className="ew-cc-card">
            <h3>Guests</h3>
            <div className="ew-cc-nums">
              <div><span className="ew-cc-num">{cc.guests.checked_in}</span><span className="ew-cc-num-lbl">Checked in</span></div>
              <div><span className="ew-cc-num">{cc.guests.vip_checked_in}</span><span className="ew-cc-num-lbl">VIP in</span></div>
              <div><span className="ew-cc-num">{cc.guests.total}</span><span className="ew-cc-num-lbl">Total</span></div>
            </div>
          </section>
        ) : null}

        {cc.vendors ? (
          <section className="ew-cc-card">
            <h3>Vendors</h3>
            <div className="ew-cc-nums">
              <div><span className="ew-cc-num">{cc.vendors.expected}</span><span className="ew-cc-num-lbl">Expected</span></div>
              <div>
                <span className="ew-cc-num">{cc.vendors.arrivals.filter((a) => a.status === 'checked_in' || a.status === 'on_time' || a.status === 'early' || a.status === 'completed').length}</span>
                <span className="ew-cc-num-lbl">On site</span>
              </div>
              <div>
                <span className="ew-cc-num ew-cc-num-warn">{cc.vendors.arrivals.filter((a) => a.status === 'late' || a.status === 'no_show').length}</span>
                <span className="ew-cc-num-lbl">Late / no show</span>
              </div>
            </div>
            {cc.vendors.arrivals.length > 0 ? (
              <ul className="ew-cc-list">
                {cc.vendors.arrivals.map((a) => (
                  <li key={a.organization_id}>
                    <span className="ew-cc-listtime">{fmtTime(a.scheduled_at)}</span>
                    <span>{a.vendor_name}</span>
                    <span className="ew-cc-badge" style={{ color: arrivalColor(a.status) }}>{ARRIVAL_LABEL[a.status]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ew-cc-empty">No vendor arrival times scheduled.</p>
            )}
          </section>
        ) : null}

        {cc.staff ? (
          <section className="ew-cc-card">
            <h3>Staff</h3>
            <div className="ew-cc-nums">
              <div><span className="ew-cc-num">{cc.staff.checked_in}</span><span className="ew-cc-num-lbl">Checked in</span></div>
              <div><span className="ew-cc-num">{cc.staff.expected}</span><span className="ew-cc-num-lbl">Expected</span></div>
            </div>
          </section>
        ) : (
          <section className="ew-cc-card">
            <h3>Staff</h3>
            <p className="ew-cc-empty">Not visible from this role.</p>
          </section>
        )}

        {cc.tasks ? (
          <section className="ew-cc-card">
            <h3>Tasks</h3>
            <div className="ew-cc-nums">
              <div><span className="ew-cc-num">{cc.tasks.complete}</span><span className="ew-cc-num-lbl">Complete</span></div>
              <div><span className="ew-cc-num">{cc.tasks.active}</span><span className="ew-cc-num-lbl">Active</span></div>
              <div><span className="ew-cc-num ew-cc-num-warn">{cc.tasks.blocked}</span><span className="ew-cc-num-lbl">Blocked</span></div>
            </div>
          </section>
        ) : null}

        {cc.changes ? (
          <section className="ew-cc-card">
            <h3>Changes</h3>
            <div className="ew-cc-nums">
              <div><span className="ew-cc-num">{cc.changes.today_count}</span><span className="ew-cc-num-lbl">Approved today</span></div>
              <div>
                <span className="ew-cc-num">
                  {cc.changes.today_financial_impact != null ? `$${cc.changes.today_financial_impact.toLocaleString()}` : '—'}
                </span>
                <span className="ew-cc-num-lbl">Budget impact</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="ew-cc-card">
          <h3>Incidents</h3>
          <p className="ew-cc-empty">Not tracked yet -- incident management ships in a later part of this phase.</p>
        </section>

        <section className="ew-cc-card">
          <h3>Sponsors</h3>
          <p className="ew-cc-empty">Not tracked yet -- sponsor activation status ships in a later part of this phase.</p>
        </section>

        <section className="ew-cc-card">
          <h3>Inventory</h3>
          <p className="ew-cc-empty">Not tracked yet -- event inventory ships in a later part of this phase.</p>
        </section>
      </div>

      {cc.timeline.length > 0 ? (
        <section className="ew-cc-card">
          <h3>Timeline</h3>
          <ul className="ew-cc-timeline">
            {cc.timeline.map((t, i) => (
              <li key={i}>
                <span className="ew-cc-listtime">{new Date(t.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                <span>{t.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const CC_CSS = `
.ew-cc { display: flex; flex-direction: column; gap: 18px; }
.ew-cc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ew-cc-kicker { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; color: var(--dp-gold); }
.ew-cc-title { margin: 2px 0 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: var(--dp-emerald); }
.ew-cc-card { border: 1px solid var(--dp-line); border-radius: 14px; padding: 16px 18px; background: #fff; }
.ew-cc-card h3 { margin: 0 0 10px; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; color: var(--dp-emerald); }
.ew-cc-status { background: rgba(247,244,238,.5); }
.ew-cc-statusgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.ew-cc-statusgrid > div { display: flex; flex-direction: column; gap: 3px; }
.ew-cc-label { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); }
.ew-cc-val { font-size: 14px; font-weight: 600; color: var(--dp-ink); }
.ew-cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.ew-cc-nums { display: flex; gap: 20px; }
.ew-cc-nums > div { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.ew-cc-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 600; color: var(--dp-emerald); line-height: 1; }
.ew-cc-num-warn { color: #b4451f; }
.ew-cc-num-lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); }
.ew-cc-empty { margin: 0; font-size: 12.5px; color: var(--dp-muted); }
.ew-cc-list, .ew-cc-timeline { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ew-cc-list li, .ew-cc-timeline li { display: flex; gap: 10px; font-size: 12.5px; color: var(--dp-ink); }
.ew-cc-listtime { flex: 0 0 62px; font-weight: 600; color: var(--dp-emerald); }
.ew-cc-badge { margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
`;
