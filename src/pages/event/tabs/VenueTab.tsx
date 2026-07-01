import React, { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

/**
 * Venue tab. The event detail endpoint exposes the linked venue (venue_id) plus
 * the date, guest count, and location-relevant facts. There is no standalone
 * venue page to embed, so this renders the venue and logistics info from the
 * event the workspace already works with. Graceful empty state when no venue is
 * selected yet. Zero em dashes.
 */

type EventRow = {
  id: string;
  name: string;
  type: string | null;
  venue_id: string | null;
  date_time: string | null;
  guest_count: number | null;
  required_services: string[] | null;
};

function fmtDate(v: string | null): string {
  if (!v) return 'Not scheduled';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function VenueTab({ eventId }: { eventId: string }) {
  const [ev, setEv] = useState<EventRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    apiGet<{ event: EventRow }>(`/events/${eventId}`)
      .then((r) => { if (on) setEv(r.event); })
      .catch((e) => { if (on) setErr((e as Error).message); });
    return () => { on = false; };
  }, [eventId]);

  if (err) return <p className="ew-error">{err}</p>;
  if (!ev) return <p className="ew-muted">Loading venue...</p>;

  if (!ev.venue_id) {
    return (
      <div className="ew-empty">
        <p>No venue selected for this event yet. Once a venue is booked it appears here with its logistics and capacity.</p>
      </div>
    );
  }

  return (
    <div className="ew-venue">
      <style>{V_CSS}</style>
      <div className="ew-venue-banner" aria-hidden="true">
        <span className="ew-venue-glyph">V</span>
      </div>
      <div className="ew-venue-grid">
        <Fact label="Venue reference" value={ev.venue_id} mono />
        <Fact label="Event date and time" value={fmtDate(ev.date_time)} />
        <Fact label="Expected guests" value={ev.guest_count != null ? String(ev.guest_count) : 'Not set'} />
        <Fact label="Event type" value={ev.type ?? 'Not set'} />
        <Fact label="Required services" value={(ev.required_services ?? []).join(', ') || 'None listed'} />
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ew-venue-fact">
      <span className="ew-venue-factk">{label}</span>
      <span className={`ew-venue-factv${mono ? ' ew-mono' : ''}`}>{value}</span>
    </div>
  );
}

const V_CSS = `
.ew-venue-banner { height: 96px; border-radius: 14px; background: linear-gradient(135deg, #123c2e, #1E5D4A); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.ew-venue-glyph { width: 52px; height: 52px; border-radius: 13px; background: rgba(201,163,91,.25); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 26px; }
.ew-venue-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.ew-venue-fact { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.ew-venue-factk { font-size: 11px; color: #9a8a5e; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; }
.ew-venue-factv { font-size: 14px; color: #2c2a26; word-break: break-word; }
@media (max-width: 720px) { .ew-venue-grid { grid-template-columns: 1fr; } }
`;
