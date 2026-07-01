import { useState } from 'react';

/**
 * Add-to-calendar control. Builds Google Calendar and Outlook deep links from the
 * platform's event data and opens the user's calendar prefilled to save. No API,
 * no sync, no third-party dependency. Apple and everything else use the existing
 * .ics download (passed via onIcs). Zero em dashes.
 */
interface Props {
  title: string;
  start?: string | null; // ISO or parseable date/datetime
  end?: string | null;
  location?: string;
  details?: string;
  onIcs?: () => void; // download the .ics (Apple / other)
  icsBusy?: boolean;
}

function parse(d?: string | null): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Google wants compact UTC: YYYYMMDDTHHMMSSZ. */
function gfmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export default function AddToCalendar({ title, start, end, location, details, onIcs, icsBusy }: Props) {
  const [open, setOpen] = useState(false);
  const startDt = parse(start);
  // Default to a 3 hour block when no explicit end is known.
  const endDt = parse(end) || (startDt ? new Date(startDt.getTime() + 3 * 60 * 60 * 1000) : null);

  function googleUrl(): string {
    const p = new URLSearchParams({ action: 'TEMPLATE', text: title });
    if (startDt && endDt) p.set('dates', `${gfmt(startDt)}/${gfmt(endDt)}`);
    if (details) p.set('details', details);
    if (location) p.set('location', location);
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  }

  function outlookUrl(): string {
    const p = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: title,
    });
    if (startDt) p.set('startdt', startDt.toISOString());
    if (endDt) p.set('enddt', endDt.toISOString());
    if (details) p.set('body', details);
    if (location) p.set('location', location);
    return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
  }

  function go(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div className="atc">
      <style>{CSS}</style>
      <button type="button" className="atc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Add to calendar
        <span className="atc-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <div className="atc-scrim" onClick={() => setOpen(false)} />
          <div className="atc-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => go(googleUrl())}>Google Calendar</button>
            <button type="button" role="menuitem" onClick={() => go(outlookUrl())}>Outlook</button>
            <button
              type="button"
              role="menuitem"
              disabled={icsBusy}
              onClick={() => { setOpen(false); onIcs?.(); }}
            >
              {icsBusy ? 'Preparing...' : 'Apple / Download (.ics)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.atc{position:relative;display:inline-block}
.atc-btn{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:13px;font-weight:600;color:#123c2e;background:#fff;border:1px solid #e7e1d6;border-radius:11px;padding:10px 16px;cursor:pointer}
.atc-btn:hover{border-color:#1E5D4A;background:#f7f4ee}
.atc-caret{font-size:10px;color:#7d776c}
.atc-scrim{position:fixed;inset:0;z-index:40}
.atc-menu{position:absolute;z-index:41;top:calc(100% + 6px);left:0;min-width:210px;background:#fff;border:1px solid #e7e1d6;border-radius:12px;box-shadow:0 18px 40px -22px rgba(18,60,46,.55);overflow:hidden;display:flex;flex-direction:column}
.atc-menu button{text-align:left;font:inherit;font-size:13.5px;color:#2c2a26;background:#fff;border:none;border-bottom:1px solid #f0ece3;padding:11px 15px;cursor:pointer}
.atc-menu button:last-child{border-bottom:none}
.atc-menu button:hover{background:#f7f4ee;color:#123c2e}
.atc-menu button:disabled{opacity:.55;cursor:not-allowed}
`;
