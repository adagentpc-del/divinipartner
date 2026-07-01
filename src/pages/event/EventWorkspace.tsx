import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import OverviewTab from './tabs/OverviewTab';
import VendorsTab from './tabs/VendorsTab';
import BidsTab from './tabs/BidsTab';
import QuotesTab from './tabs/QuotesTab';
import MessagesTab from './tabs/MessagesTab';
import DocumentsTab from './tabs/DocumentsTab';
import NotesTab from './tabs/NotesTab';
import GuestListTab from './tabs/GuestListTab';
import SeatingChartTab from './tabs/SeatingChartTab';
import FloorplansTab from './tabs/FloorplansTab';
import TimelineTab from './tabs/TimelineTab';
import TasksTab from './tabs/TasksTab';
import ItineraryTab from './tabs/ItineraryTab';
import VenueTab from './tabs/VenueTab';
import InventoryTab from './tabs/InventoryTab';
import InvoicesTab from './tabs/InvoicesTab';
import PaymentsTab from './tabs/PaymentsTab';
import ChangeOrdersTab from './tabs/ChangeOrdersTab';
import ReviewsTab from './tabs/ReviewsTab';
import EventReadinessPanel from '../EventReadinessPanel';

/**
 * Per-event command center. The tab bar covers every blueprint 13.1 tab.
 * Phase 3 renders Overview, Vendors, Bids, Quotes, Messages, Documents and
 * Notes in full. The rest render a graceful placeholder so later phases
 * (Phase 6: Guest List / Seating / Floorplans / Timeline / Tasks / Itinerary;
 * Phase 5: Invoices / Payments / Change Orders) can fill them in.
 */

type Tab = { key: string; label: string; element: React.ReactNode };

function Placeholder({ label }: { label: string }) {
  return (
    <div className="ew-placeholder">
      <span className="ew-placeholder-glyph" aria-hidden="true">{label.slice(0, 1)}</span>
      <h3>{label}</h3>
      <p>Coming in this workspace. Another phase fills this tab in.</p>
    </div>
  );
}

type EventHead = { id: string; name: string; status: string | null };

export default function EventWorkspace() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [active, setActive] = useState('overview');
  const [head, setHead] = useState<EventHead | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ event: EventHead }>(`/events/${id}`)
      .then((r) => setHead(r.event))
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  const tabs: Tab[] = [
    { key: 'overview', label: 'Overview', element: <OverviewTab eventId={id} /> },
    { key: 'readiness', label: 'Readiness', element: <EventReadinessPanel eventId={id} /> },
    { key: 'venue', label: 'Venue', element: <VenueTab eventId={id} /> },
    { key: 'vendors', label: 'Vendors', element: <VendorsTab eventId={id} /> },
    { key: 'bids', label: 'Bids', element: <BidsTab eventId={id} /> },
    { key: 'quotes', label: 'Quotes', element: <QuotesTab eventId={id} /> },
    { key: 'inventory', label: 'Inventory', element: <InventoryTab eventId={id} /> },
    { key: 'guest_list', label: 'Guest List', element: <GuestListTab eventId={id} /> },
    { key: 'seating_chart', label: 'Seating Chart', element: <SeatingChartTab eventId={id} /> },
    { key: 'floorplans', label: 'Floorplans', element: <FloorplansTab eventId={id} /> },
    { key: 'timeline', label: 'Timeline', element: <TimelineTab eventId={id} /> },
    { key: 'tasks', label: 'Tasks', element: <TasksTab eventId={id} /> },
    { key: 'itinerary', label: 'Itinerary', element: <ItineraryTab eventId={id} /> },
    { key: 'documents', label: 'Documents', element: <DocumentsTab eventId={id} /> },
    { key: 'messages', label: 'Messages', element: <MessagesTab eventId={id} /> },
    { key: 'invoices', label: 'Invoices', element: <InvoicesTab eventId={id} /> },
    { key: 'payments', label: 'Payments', element: <PaymentsTab eventId={id} /> },
    { key: 'change_orders', label: 'Change Orders', element: <ChangeOrdersTab eventId={id} /> },
    { key: 'reviews', label: 'Reviews', element: <ReviewsTab eventId={id} /> },
    { key: 'notes', label: 'Notes', element: <NotesTab eventId={id} /> },
    { key: 'support', label: 'Support', element: <Placeholder label="Support" /> },
  ];

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="ew">
      <style>{EW_CSS}</style>

      <header className="ew-top">
        <button type="button" className="ew-back" onClick={() => nav('/events')}>Back to events</button>
        <div className="ew-titlewrap">
          <span className="ew-kicker">Event workspace</span>
          <h1 className="ew-title">{head?.name ?? (err ? 'Event' : 'Loading...')}</h1>
        </div>
        {head?.status ? <span className="ew-statuspill">{head.status.replace(/_/g, ' ')}</span> : null}
        <button type="button" className="ew-btn ghost" onClick={() => nav('/bids')}>
          Bid board and auto-quote
        </button>
        <button type="button" className="ew-daymode" onClick={() => nav(`/events/${id}/day`)}>
          Event day mode
        </button>
      </header>

      {err ? <p className="ew-error ew-toperr">{err}</p> : null}

      <nav className="ew-tabbar" aria-label="Event workspace tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ew-tab${t.key === active ? ' is-active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="ew-panel" key={current.key}>
        <h2 className="ew-panel-title">{current.label}</h2>
        {current.element}
      </section>
    </div>
  );
}

const EW_CSS = `
.ew {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--dp-ink); background: var(--dp-ivory); min-height: 100vh;
  padding: 24px 30px 60px; max-width: 1180px; margin: 0 auto;
}
.ew *, .ew *::before, .ew *::after { box-sizing: border-box; }
.ew h1, .ew h2, .ew h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }

.ew-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.ew-back { background: transparent; border: 1px solid var(--dp-line); border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 12px; color: var(--dp-muted); cursor: pointer; }
.ew-back:hover { border-color: var(--dp-emerald); color: var(--dp-emerald); }
.ew-titlewrap { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ew-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.ew-title { font-size: 30px; color: var(--dp-emerald); line-height: 1.05; }
.ew-statuspill { font-size: 11px; letter-spacing: .5px; text-transform: capitalize; font-weight: 600; color: var(--dp-emerald); background: rgba(201,163,91,.2); border: 1px solid rgba(201,163,91,.5); padding: 4px 12px; border-radius: 999px; }
.ew-daymode { background: var(--dp-emerald); border: 0; border-radius: 9px; padding: 8px 15px; font: inherit; font-size: 12px; font-weight: 600; color: #fff; cursor: pointer; }
.ew-daymode:hover { background: var(--dp-emerald-2); }
.ew-toperr { margin-bottom: 12px; }

.ew-tabbar { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--dp-line); margin-bottom: 22px; padding-bottom: 2px; }
.ew-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; font: inherit; font-size: 12.5px; color: var(--dp-muted); padding: 8px 12px; cursor: pointer; border-radius: 7px 7px 0 0; white-space: nowrap; transition: color .15s ease, border-color .15s ease, background .15s ease; }
.ew-tab:hover { color: var(--dp-emerald); background: rgba(18,60,46,.04); }
.ew-tab.is-active { color: var(--dp-emerald); border-bottom-color: var(--dp-gold); font-weight: 600; }

.ew-panel { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; padding: 24px; }
.ew-panel-title { font-size: 22px; color: var(--dp-emerald); margin-bottom: 16px; }

.ew-muted { color: var(--dp-muted); font-size: 12.5px; }
.ew-error { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; margin: 0 0 12px; }

.ew-empty { border: 1px dashed var(--dp-line); border-radius: 12px; padding: 22px; background: rgba(247,244,238,.55); }
.ew-empty p { margin: 0; font-size: 13px; color: var(--dp-muted); line-height: 1.6; }

.ew-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ew-table th { text-align: left; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--dp-muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--dp-line); }
.ew-table td { padding: 10px; border-bottom: 1px solid #f0ebe0; color: var(--dp-ink); }
.ew-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #6a655c; }

.ew-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 16px; cursor: pointer; transition: background .15s ease; }
.ew-btn:hover { background: var(--dp-emerald-2); }
.ew-btn:disabled { opacity: .55; cursor: default; }
.ew-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.ew-btn.ghost:hover { border-color: var(--dp-emerald); background: rgba(18,60,46,.04); }
.ew-btn.sm { padding: 5px 11px; font-size: 11.5px; }

.ew-placeholder { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 48px 20px; color: var(--dp-muted); }
.ew-placeholder-glyph { width: 44px; height: 44px; border-radius: 12px; background: rgba(201,163,91,.18); color: var(--dp-emerald); display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 20px; }
.ew-placeholder h3 { font-size: 21px; color: var(--dp-emerald); }
.ew-placeholder p { margin: 0; font-size: 13px; max-width: 360px; line-height: 1.6; }

@media (max-width: 720px) { .ew { padding: 18px 16px 48px; } .ew-panel { padding: 18px; } }
`;
