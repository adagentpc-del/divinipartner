import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

type EventRow = {
  id: string;
  name: string;
  type: string | null;
  date_time: string | null;
  guest_count: number | null;
  budget: string | null;
  event_goals: string | null;
  required_services: string[] | null;
  status: string | null;
};
type StatusMeta = { key: string; label: string };

function fmtMoney(v: string | null): string {
  if (v == null) return 'Not set';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString()}` : String(v);
}
function fmtDate(v: string | null): string {
  if (!v) return 'Not scheduled';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function OverviewTab({ eventId }: { eventId: string }) {
  const [ev, setEv] = useState<EventRow | null>(null);
  const [statuses, setStatuses] = useState<StatusMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [e, meta] = await Promise.all([
        apiGet<{ event: EventRow }>(`/events/${eventId}`),
        apiGet<{ statuses: StatusMeta[] }>(`/events/meta`),
      ]);
      setEv(e.event);
      setStatuses(meta.statuses);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function changeStatus(status: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ event: EventRow }>('POST', `/events/${eventId}/status`, { status });
      setEv(r.event);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <div className="ew-panel"><p className="ew-error">{err}</p></div>;
  if (!ev) return <div className="ew-panel"><p className="ew-muted">Loading overview...</p></div>;

  const statusLabel = statuses.find((s) => s.key === ev.status)?.label ?? ev.status ?? 'Inquiry';
  const currentIdx = statuses.findIndex((s) => s.key === ev.status);

  return (
    <div className="ew-ov">
      <style>{OV_CSS}</style>

      <div className="ew-ov-head">
        <div>
          <div className="ew-ov-kicker">Event status</div>
          <div className="ew-ov-status">{statusLabel}</div>
        </div>
        <label className="ew-ov-select">
          <span>Move to</span>
          <select
            value={ev.status ?? ''}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="ew-ov-track">
        {statuses.map((s, i) => (
          <div key={s.key} className={`ew-ov-step${i <= currentIdx ? ' is-done' : ''}${i === currentIdx ? ' is-cur' : ''}`}>
            <span className="ew-ov-dot" aria-hidden="true" />
            <span className="ew-ov-steplabel">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="ew-ov-grid">
        <Fact label="Event name" value={ev.name} />
        <Fact label="Type" value={ev.type ?? 'Not set'} />
        <Fact label="Date and time" value={fmtDate(ev.date_time)} />
        <Fact label="Guest count" value={ev.guest_count != null ? String(ev.guest_count) : 'Not set'} />
        <Fact label="Budget" value={fmtMoney(ev.budget)} />
        <Fact label="Required services" value={(ev.required_services ?? []).join(', ') || 'None listed'} />
      </div>

      <div className="ew-ov-goals">
        <div className="ew-ov-kicker">Event goals</div>
        <p>{ev.event_goals || 'No goals captured yet.'}</p>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="ew-ov-fact">
      <span className="ew-ov-factk">{label}</span>
      <span className="ew-ov-factv">{value}</span>
    </div>
  );
}

const OV_CSS = `
.ew-ov-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.ew-ov-kicker { font-size: 10.5px; letter-spacing: 1.3px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.ew-ov-status { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; color: #123c2e; line-height: 1.1; }
.ew-ov-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #7d776c; }
.ew-ov-select select { font: inherit; padding: 7px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.ew-ov-track { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 14px 0 22px; border-bottom: 1px solid #e7e1d6; margin-bottom: 20px; }
.ew-ov-step { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #b3aa99; }
.ew-ov-dot { width: 9px; height: 9px; border-radius: 50%; background: #e7e1d6; border: 1px solid #d8d0c1; }
.ew-ov-step.is-done .ew-ov-dot { background: #1E5D4A; border-color: #1E5D4A; }
.ew-ov-step.is-done { color: #4a5a52; }
.ew-ov-step.is-cur .ew-ov-dot { background: #C9A35B; border-color: #C9A35B; box-shadow: 0 0 0 3px rgba(201,163,91,.2); }
.ew-ov-step.is-cur { color: #123c2e; font-weight: 600; }
.ew-ov-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 20px; }
.ew-ov-fact { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.ew-ov-factk { font-size: 11px; color: #9a8a5e; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; }
.ew-ov-factv { font-size: 14px; color: #2c2a26; }
.ew-ov-goals { background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 16px 18px; }
.ew-ov-goals p { margin: 6px 0 0; font-size: 13.5px; color: #4a463e; line-height: 1.6; }
@media (max-width: 720px) { .ew-ov-grid { grid-template-columns: 1fr; } }
`;
