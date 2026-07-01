import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - F3 AI Event War Room.
 *
 * A proactive, per-event health monitor. Renders the live scan from
 * /event-war-room/:eventId as a severity-grouped list of alerts, each with its
 * recommended next action and snooze / resolve controls. Snoozing or resolving
 * posts to /event-war-room/:eventId/state and re-runs the scan.
 *
 * Uses src/lib/api.ts (apiGet / apiSend). Route wiring (src/App.tsx) and the
 * Shell nav are owned by the integration lead and are intentionally not edited
 * here. Drop in with an eventId, e.g. <EventWarRoom eventId={id} />.
 */

type Severity = 'critical' | 'warning' | 'info';
type AlertStatus = 'open' | 'snoozed' | 'resolved';

type Alert = {
  code: string;
  severity: Severity;
  message: string;
  recommendation: string;
  status: AlertStatus;
  note: string | null;
  updatedAt: string | null;
};

type WarRoomResult = {
  eventId: string;
  scannedAt: string;
  counts: { critical: number; warning: number; info: number; open: number };
  alerts: Alert[];
};

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info'];

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#c0392b', bg: '#fbeae7' },
  warning: { label: 'Warning', color: '#9a6b00', bg: '#fcf3e0' },
  info: { label: 'Heads up', color: '#1E5D4A', bg: '#e9f1ee' },
};

export default function EventWarRoom({ eventId }: { eventId: string }) {
  const [data, setData] = useState<WarRoomResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<WarRoomResult>(`/event-war-room/${eventId}`);
      setData(r);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function setState(code: string, status: AlertStatus, note?: string) {
    setBusyCode(code);
    try {
      await apiSend('POST', `/event-war-room/${eventId}/state`, { code, status, note });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyCode(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="card">
        <p className="note" style={{ margin: 0 }}>Scanning event...</p>
      </div>
    );
  }

  if (err && !data) {
    return <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b' }}>{err}</div>;
  }

  if (!data) return null;

  const open = data.alerts.filter((a) => a.status === 'open');
  const handled = data.alerts.filter((a) => a.status !== 'open');

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>AI Event War Room</h3>
            <div className="note" style={{ lineHeight: 1.6 }}>
              {open.length === 0
                ? 'No open alerts. This event is healthy.'
                : `${open.length} open alert${open.length === 1 ? '' : 's'} need attention.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill color="#c0392b" bg="#fbeae7" label={`${data.counts.critical} critical`} />
            <Pill color="#9a6b00" bg="#fcf3e0" label={`${data.counts.warning} warning`} />
            <Pill color="#1E5D4A" bg="#e9f1ee" label={`${data.counts.info} info`} />
            <button className="btn" onClick={load} disabled={loading}>
              Re-scan
            </button>
          </div>
        </div>
        {err && <div className="note" style={{ color: '#c0392b', marginTop: 10 }}>{err}</div>}
      </div>

      {SEVERITY_ORDER.map((sev) => {
        const group = open.filter((a) => a.severity === sev);
        if (group.length === 0) return null;
        const meta = SEVERITY_META[sev];
        return (
          <div key={sev} style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px', color: meta.color }}>
              {meta.label} ({group.length})
            </h4>
            {group.map((a) => (
              <AlertCard
                key={a.code}
                alert={a}
                busy={busyCode === a.code}
                onSnooze={() => setState(a.code, 'snoozed')}
                onResolve={() => setState(a.code, 'resolved')}
              />
            ))}
          </div>
        );
      })}

      {handled.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h4 style={{ margin: '0 0 8px' }} className="note">
            Snoozed / resolved ({handled.length})
          </h4>
          {handled.map((a) => (
            <AlertCard
              key={a.code}
              alert={a}
              busy={busyCode === a.code}
              onReopen={() => setState(a.code, 'open')}
              muted
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 999,
        padding: '3px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function AlertCard({
  alert,
  busy,
  onSnooze,
  onResolve,
  onReopen,
  muted,
}: {
  alert: Alert;
  busy: boolean;
  onSnooze?: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  muted?: boolean;
}) {
  const meta = SEVERITY_META[alert.severity];
  return (
    <div
      className="card"
      style={{
        marginBottom: 10,
        borderLeft: `4px solid ${meta.color}`,
        opacity: muted ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 4, padding: '1px 6px' }}>
              {meta.label}
            </span>
            {alert.status !== 'open' && (
              <span className="note" style={{ fontSize: 11, textTransform: 'capitalize' }}>{alert.status}</span>
            )}
          </div>
          <div style={{ fontWeight: 600 }}>{alert.message}</div>
          <div className="note" style={{ lineHeight: 1.5, marginTop: 4 }}>
            <strong>Next:</strong> {alert.recommendation}
          </div>
          {alert.note && (
            <div className="note" style={{ marginTop: 4, fontStyle: 'italic' }}>Note: {alert.note}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {onSnooze && (
            <button className="btn" onClick={onSnooze} disabled={busy}>
              Snooze
            </button>
          )}
          {onResolve && (
            <button className="btn" onClick={onResolve} disabled={busy}>
              Resolve
            </button>
          )}
          {onReopen && (
            <button className="btn" onClick={onReopen} disabled={busy}>
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
