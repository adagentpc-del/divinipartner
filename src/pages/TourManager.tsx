import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Tour Manager. A tour is a series of stops; each stop is a full event, so it
 * gets every event capability (public landing, floorplans, schedule, tickets,
 * bids, booths). Create a tour, add stops (each spins up an event), then open
 * each stop's workspace to fill in the details or its public page. Self-contained
 * styling under .tm-. Zero em dashes.
 */

type Tour = { id: string; name: string; description: string | null; status: string; stop_count?: number };
type Stop = {
  event_id: string;
  name: string | null;
  date_time: string | null;
  stop_city: string | null;
  tour_stop_order: number | null;
  status: string | null;
};

function dateStr(v: string | null): string {
  if (!v) return 'Date TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Date TBD' : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export default function TourManager() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [selected, setSelected] = useState<Tour | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [newTour, setNewTour] = useState({ name: '', description: '' });
  const [newStop, setNewStop] = useState({ name: '', city: '', date_time: '' });

  async function loadTours() {
    try {
      const r = await apiGet<{ tours: Tour[] }>('/tours');
      setTours(r.tours ?? []);
    } catch (e: any) { setErr(e?.message ?? 'Could not load tours.'); }
  }
  useEffect(() => { void loadTours(); }, []);

  async function openTour(t: Tour) {
    setSelected(t);
    setMsg(null); setErr(null);
    try {
      const r = await apiGet<{ tour: Tour; stops: Stop[] }>(`/tours/${t.id}`);
      setSelected(r.tour);
      setStops(r.stops ?? []);
    } catch (e: any) { setErr(e?.message ?? 'Could not open tour.'); }
  }

  async function createTour(e: React.FormEvent) {
    e.preventDefault();
    if (!newTour.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiSend<{ tour: Tour }>('POST', '/tours', {
        name: newTour.name.trim(),
        description: newTour.description.trim() || null,
      });
      setNewTour({ name: '', description: '' });
      await loadTours();
      await openTour(r.tour);
    } catch (e: any) { setErr(e?.message ?? 'Could not create the tour.'); } finally { setBusy(false); }
  }

  async function addStop(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !newStop.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiSend('POST', `/tours/${selected.id}/stops`, {
        name: newStop.name.trim(),
        city: newStop.city.trim() || null,
        date_time: newStop.date_time ? new Date(newStop.date_time).toISOString() : null,
      });
      setNewStop({ name: '', city: '', date_time: '' });
      await openTour(selected);
      await loadTours();
      setMsg('Stop added. Open it to set the venue, schedule, floorplans, packages, booths, and tickets.');
    } catch (e: any) { setErr(e?.message ?? 'Could not add the stop.'); } finally { setBusy(false); }
  }

  async function removeStop(eventId: string) {
    if (!selected) return;
    if (!window.confirm('Remove this stop from the tour? The event itself is kept.')) return;
    try {
      await apiSend('DELETE', `/tours/${selected.id}/stops/${eventId}`);
      await openTour(selected);
      await loadTours();
    } catch (e: any) { setErr(e?.message ?? 'Could not remove the stop.'); }
  }

  function copyTourLink() {
    if (!selected) return;
    void navigator.clipboard?.writeText(`${window.location.origin}/tour/${selected.id}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="tm">
      <style>{CSS}</style>
      <div className="tm-head">
        <h1>Tours</h1>
        <p className="tm-sub">Run a touring event as one series. Each stop is a full event with its own landing page, schedule, floorplans, packages, booths, and tickets.</p>
      </div>

      {err && <div className="tm-error">{err}</div>}
      {msg && <div className="tm-msg">{msg}</div>}

      <div className="tm-grid">
        <div className="tm-col">
          <div className="tm-card">
            <h3>New tour</h3>
            <form onSubmit={createTour}>
              <input className="tm-in" placeholder="Tour name (e.g. Social Commerce Festival 2027)" value={newTour.name}
                onChange={(e) => setNewTour({ ...newTour, name: e.target.value })} />
              <input className="tm-in" placeholder="Short description (optional)" value={newTour.description}
                onChange={(e) => setNewTour({ ...newTour, description: e.target.value })} />
              <button type="submit" className="tm-btn" disabled={busy}>Create tour</button>
            </form>
          </div>

          <div className="tm-card">
            <h3>Your tours</h3>
            {tours.length === 0 ? <div className="tm-empty">No tours yet.</div> : (
              tours.map((t) => (
                <button key={t.id} type="button" className={`tm-row ${selected?.id === t.id ? 'active' : ''}`} onClick={() => openTour(t)}>
                  <span className="tm-rowname">{t.name}</span>
                  <span className="tm-rowmeta">{t.stop_count ?? 0} stops</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="tm-col">
          {selected ? (
            <div className="tm-card">
              <div className="tm-detailhead">
                <h3>{selected.name}</h3>
                <button type="button" className="tm-btn ghost" onClick={copyTourLink}>{copied ? 'Copied' : 'Copy tour link'}</button>
              </div>
              {selected.description && <p className="tm-desc">{selected.description}</p>}

              <form className="tm-stopform" onSubmit={addStop}>
                <input className="tm-in" placeholder="Stop name (e.g. Miami)" value={newStop.name}
                  onChange={(e) => setNewStop({ ...newStop, name: e.target.value })} />
                <input className="tm-in" placeholder="City" value={newStop.city}
                  onChange={(e) => setNewStop({ ...newStop, city: e.target.value })} />
                <input className="tm-in" type="datetime-local" value={newStop.date_time}
                  onChange={(e) => setNewStop({ ...newStop, date_time: e.target.value })} />
                <button type="submit" className="tm-btn" disabled={busy}>Add stop</button>
              </form>

              {stops.length === 0 ? (
                <div className="tm-empty">No stops yet. Add your first stop above.</div>
              ) : (
                <div className="tm-stoplist">
                  {stops.map((s, i) => (
                    <div key={s.event_id} className="tm-stop">
                      <div className="tm-stopnum">{i + 1}</div>
                      <div className="tm-stopbody">
                        <div className="tm-stopname">{s.name}{s.stop_city ? <span className="tm-city">{s.stop_city}</span> : null}</div>
                        <div className="tm-stopmeta">{dateStr(s.date_time)}{s.status ? ` - ${s.status.replace(/_/g, ' ')}` : ''}</div>
                        <div className="tm-stopactions">
                          <a className="tm-link" href={`/events/${s.event_id}`}>Manage event</a>
                          <a className="tm-link" href={`/event/${s.event_id}`} target="_blank" rel="noreferrer">Public page</a>
                          <button type="button" className="tm-del" onClick={() => removeStop(s.event_id)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="tm-card tm-empty">Select or create a tour to manage its stops.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.tm { max-width: 1080px; margin: 0 auto; padding: 24px 16px; }
.tm-head h1 { font-size: 24px; margin: 0 0 4px; }
.tm-sub { opacity: .75; margin: 0 0 16px; max-width: 720px; }
.tm-error { background: #fdecea; color: #a12; border: 1px solid #f5c6c0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.tm-msg { background: #eaf6ee; color: #17603a; border: 1px solid #bfe3cc; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.tm-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; }
@media (max-width: 780px) { .tm-grid { grid-template-columns: 1fr; } }
.tm-col { display: flex; flex-direction: column; gap: 16px; }
.tm-card { border: 1px solid #e3e8f0; border-radius: 12px; padding: 16px; background: #fff; }
.tm-card h3 { margin: 0 0 12px; font-size: 16px; }
.tm-in { width: 100%; border: 1px solid #dfe4ec; border-radius: 8px; padding: 8px 10px; font-size: 14px; box-sizing: border-box; margin-bottom: 8px; }
.tm-btn { border: none; background: #123c2e; color: #fff; border-radius: 8px; padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
.tm-btn.ghost { background: #fff; color: #123c2e; border: 1px solid #cdd6cf; }
.tm-btn:disabled { opacity: .55; cursor: default; }
.tm-row { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid #eceff4; border-radius: 8px; padding: 9px 11px; background: #fbfcfe; cursor: pointer; margin-bottom: 7px; }
.tm-row.active { border-color: #123c2e; }
.tm-rowname { font-weight: 600; font-size: 14px; }
.tm-rowmeta { font-size: 12px; opacity: .6; }
.tm-detailhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.tm-desc { opacity: .8; font-size: 14px; margin: 4px 0 12px; }
.tm-stopform { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
.tm-stopform .tm-in { flex: 1 1 140px; margin-bottom: 0; }
.tm-stoplist { display: flex; flex-direction: column; gap: 8px; }
.tm-stop { display: flex; gap: 12px; border: 1px solid #f0ebe0; border-radius: 10px; padding: 11px 13px; }
.tm-stopnum { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: #123c2e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.tm-stopbody { flex: 1; }
.tm-stopname { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.tm-city { font-size: 11px; font-weight: 700; letter-spacing: .4px; color: #1E5D4A; background: rgba(30,93,74,.12); border-radius: 4px; padding: 1px 6px; }
.tm-stopmeta { font-size: 12px; opacity: .6; margin: 2px 0 6px; text-transform: capitalize; }
.tm-stopactions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.tm-link { font-size: 13px; color: #2563eb; text-decoration: none; }
.tm-link:hover { text-decoration: underline; }
.tm-del { border: none; background: transparent; color: #a12; font-size: 13px; cursor: pointer; padding: 0; }
.tm-empty { opacity: .6; padding: 18px 0; text-align: center; }
`;
