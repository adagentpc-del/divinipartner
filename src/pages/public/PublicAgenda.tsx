/**
 * Public event agenda (/agenda/:eventId). No auth. Renders only the schedule
 * items the organizer marked public, grouped by track then time. Self-contained
 * styling under .ag-. Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../../lib/api';

type Item = {
  id: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  track: string | null;
  category: string | null;
};
type AgendaResp = { event: { id: string; name: string | null; date_time: string | null }; items: Item[] };

function fmtTime(v: string | null): string {
  if (!v) return 'TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'TBD' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { dateStyle: 'full' });
}

export default function PublicAgenda() {
  const { eventId = '' } = useParams();
  const [data, setData] = useState<AgendaResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiGet<AgendaResp>(`/public/agenda/${encodeURIComponent(eventId)}`);
        if (live) setData(r);
      } catch (e: any) {
        if (live) setErr(e?.message ?? 'This agenda is not available.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [eventId]);

  // Group by track (null track goes into "Schedule").
  const groups: { track: string; items: Item[] }[] = [];
  if (data) {
    const map = new Map<string, Item[]>();
    for (const it of data.items) {
      const key = it.track || 'Schedule';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    for (const [track, items] of map) groups.push({ track, items });
  }

  return (
    <div className="ag">
      <style>{CSS}</style>
      <div className="ag-wrap">
        <div className="ag-brand">Divini Partners</div>
        {loading ? (
          <div className="ag-loading">Loading the agenda...</div>
        ) : err ? (
          <div className="ag-card"><h1>Agenda unavailable</h1><p className="ag-sub">{err}</p></div>
        ) : data ? (
          <>
            <h1 className="ag-title">{data.event.name ?? 'Event agenda'}</h1>
            {fmtDate(data.event.date_time) && <p className="ag-date">{fmtDate(data.event.date_time)}</p>}
            {data.items.length === 0 ? (
              <div className="ag-card"><p className="ag-sub">The schedule has not been published yet. Check back soon.</p></div>
            ) : (
              groups.map((g) => (
                <div key={g.track} className="ag-group">
                  <div className="ag-track">{g.track}</div>
                  {g.items.map((it) => (
                    <div key={it.id} className="ag-item">
                      <div className="ag-time">{fmtTime(it.start_time)}{it.end_time ? ` - ${fmtTime(it.end_time)}` : ''}</div>
                      <div className="ag-body">
                        <div className="ag-itemtitle">{it.title}</div>
                        {it.description && <div className="ag-desc">{it.description}</div>}
                        {it.location && <div className="ag-loc">{it.location}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

const CSS = `
.ag { min-height: 100vh; background: #faf8f3; padding: 40px 16px; }
.ag-wrap { max-width: 680px; margin: 0 auto; }
.ag-brand { font-family: Georgia, serif; font-size: 18px; color: #123c2e; font-weight: 700; margin-bottom: 18px; }
.ag-title { font-family: Georgia, serif; font-size: 30px; color: #123c2e; margin: 0 0 4px; }
.ag-date { color: #6b6459; margin: 0 0 22px; }
.ag-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 22px; }
.ag-sub { color: #6b6459; margin: 0; }
.ag-loading { color: #6b6459; }
.ag-group { margin-bottom: 22px; }
.ag-track { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #1E5D4A; margin: 0 0 8px; }
.ag-item { display: grid; grid-template-columns: 120px 1fr; gap: 14px; background: #fff; border: 1px solid #ece5d8; border-radius: 12px; padding: 13px 16px; margin-bottom: 8px; }
.ag-time { font-size: 13px; font-weight: 600; color: #123c2e; }
.ag-itemtitle { font-size: 15px; font-weight: 600; color: #2c2a26; }
.ag-desc { font-size: 13px; color: #6a645a; margin-top: 3px; line-height: 1.5; }
.ag-loc { font-size: 12px; color: #a99f8c; margin-top: 4px; }
@media (max-width: 560px) { .ag-item { grid-template-columns: 1fr; gap: 4px; } }
`;
