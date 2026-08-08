import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

type PubItem = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  track: string | null;
  is_public: boolean | null;
};

/**
 * Phase 6 - Itinerary tab (blueprint 15). The auto-built day-of itinerary,
 * derived from the event record, accepted quotes, invoices and persisted items.
 * A role-view switcher (all / client / venue / vendor / installer / planner)
 * filters the schedule, and deterministic checks surface gaps (missing guest
 * count, deliveries after load-in, etc.) without fabricating data.
 */
type DerivedItem = {
  key: string;
  title: string;
  description: string | null;
  category: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  owner_role: string;
  owner_label: string | null;
  source: string;
  status: string;
};
type Check = { id: string; severity: 'info' | 'warning' | 'error'; message: string };
type Built = {
  event: { id: string; name: string; date_time: string | null; guest_count: number | null };
  generated_at: string;
  items: DerivedItem[];
  by_role: Record<string, DerivedItem[]>;
  checks: Check[];
  categories: { key: string; label: string }[];
};

const ROLES = [
  { key: 'all', label: 'All teams' },
  { key: 'client', label: 'Client' },
  { key: 'venue', label: 'Venue' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'installer', label: 'Installer' },
  { key: 'planner', label: 'Planner' },
];

function fmtTime(v: string | null): string {
  if (!v) return 'TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'TBD' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtRange(a: string | null, b: string | null): string {
  if (!a) return 'Time TBD';
  return b && b !== a ? `${fmtTime(a)} - ${fmtTime(b)}` : fmtTime(a);
}

export default function ItineraryTab({ eventId }: { eventId: string }) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [role, setRole] = useState('all');
  const [err, setErr] = useState<string | null>(null);

  const [pub, setPub] = useState<PubItem[]>([]);
  const [pubForm, setPubForm] = useState({ title: '', start_time: '', track: '', location: '' });
  const [pubBusy, setPubBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await apiGet<{ itinerary: Built }>(`/itinerary/event/${eventId}/build`);
      setBuilt(r.itinerary);
    } catch (e) { setErr((e as Error).message); }
  }
  async function loadPublic() {
    try {
      const r = await apiGet<{ items: PubItem[] }>(`/itinerary/event/${eventId}/items`);
      setPub((r.items ?? []).filter((i) => i.is_public));
    } catch { /* non-fatal */ }
  }
  useEffect(() => { void load(); void loadPublic();   }, [eventId]);

  async function addPublic(e: React.FormEvent) {
    e.preventDefault();
    if (!pubForm.title.trim()) return;
    setPubBusy(true);
    try {
      await apiSend('POST', `/itinerary/event/${eventId}/items`, {
        title: pubForm.title.trim(),
        start_time: pubForm.start_time ? new Date(pubForm.start_time).toISOString() : null,
        track: pubForm.track.trim() || null,
        location: pubForm.location.trim() || null,
        category: 'program',
        is_public: true,
      });
      setPubForm({ title: '', start_time: '', track: '', location: '' });
      await loadPublic();
    } catch (e) { setErr((e as Error).message); } finally { setPubBusy(false); }
  }
  async function removePublic(id: string) {
    try { await apiSend('DELETE', `/itinerary/items/${id}`); await loadPublic(); }
    catch (e) { setErr((e as Error).message); }
  }
  function copyLink() {
    const url = `${window.location.origin}/agenda/${eventId}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (err) return <p className="ew-error">{err}</p>;
  if (!built) return <p className="ew-muted">Building itinerary...</p>;

  const items = built.by_role[role] ?? built.items;
  const catLabel = (k: string) => built.categories.find((c) => c.key === k)?.label ?? k;

  return (
    <div>
      <style>{I_CSS}</style>

      <div className="it-head">
        <div>
          <div className="ew-ov-kicker" style={{ color: '#9a8a5e' }}>Auto-built itinerary</div>
          <div className="it-evname">{built.event.name}</div>
          <div className="it-gen">Generated {new Date(built.generated_at).toLocaleString()}{built.event.date_time ? ` · Event ${new Date(built.event.date_time).toLocaleDateString()}` : ''}</div>
        </div>
        <button type="button" className="ew-btn ghost sm" onClick={load}>Rebuild</button>
      </div>

      <div className="it-pub">
        <div className="it-pubhead">
          <div>
            <div className="ew-ov-kicker" style={{ color: '#9a8a5e' }}>Public agenda</div>
            <div className="it-pubsub">A shareable schedule of what you have planned. Only items you add here are visible to guests.</div>
          </div>
          <button type="button" className="ew-btn ghost sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy share link'}</button>
        </div>
        <form className="it-pubform" onSubmit={addPublic}>
          <input className="fp-in" placeholder="Session title" value={pubForm.title}
            onChange={(e) => setPubForm({ ...pubForm, title: e.target.value })} />
          <input className="fp-in" type="datetime-local" value={pubForm.start_time}
            onChange={(e) => setPubForm({ ...pubForm, start_time: e.target.value })} />
          <input className="fp-in" placeholder="Track (e.g. Main Stage)" value={pubForm.track}
            onChange={(e) => setPubForm({ ...pubForm, track: e.target.value })} />
          <input className="fp-in" placeholder="Location (optional)" value={pubForm.location}
            onChange={(e) => setPubForm({ ...pubForm, location: e.target.value })} />
          <button type="submit" className="ew-btn sm" disabled={pubBusy}>Add to agenda</button>
        </form>
        {pub.length > 0 ? (
          <div className="it-publist">
            {pub.map((p) => (
              <div key={p.id} className="it-pubitem">
                <span className="it-pubtime">{fmtTime(p.start_time)}</span>
                <span className="it-pubtitle">{p.title}{p.track ? <span className="it-pubtrack">{p.track}</span> : null}</span>
                <button type="button" className="fp-del" onClick={() => removePublic(p.id)}>Remove</button>
              </div>
            ))}
          </div>
        ) : <div className="it-pubempty">No public agenda items yet. Add the sessions guests should see.</div>}
      </div>

      {built.checks.length > 0 ? (
        <div className="it-checks">
          {built.checks.map((c) => (
            <div key={c.id} className={`it-check sev-${c.severity}`}>
              <span className="it-checkglyph">{c.severity === 'error' ? '!' : c.severity === 'warning' ? '!' : 'i'}</span>
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="it-check sev-ok"><span className="it-checkglyph">ok</span><span>No scheduling gaps detected from the available event data.</span></div>
      )}

      <div className="it-roles">
        {ROLES.map((r) => (
          <button key={r.key} type="button" className={`it-role${r.key === role ? ' is-active' : ''}`} onClick={() => setRole(r.key)}>
            {r.label}
            <span className="it-rolecount">{(built.by_role[r.key] ?? []).length}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="ew-empty"><p>No itinerary items for this view yet. Set the event date, accept quotes, or add itinerary items to populate the schedule.</p></div>
      ) : (
        <div className="it-list">
          {items.map((it) => (
            <div key={it.key} className="it-item">
              <div className="it-time">{fmtRange(it.start_time, it.end_time)}</div>
              <div className={`it-cat cat-${it.category}`}>{catLabel(it.category)}</div>
              <div className="it-body">
                <div className="it-title">{it.title}</div>
                {it.description ? <div className="it-desc">{it.description}</div> : null}
                <div className="it-tags">
                  {it.owner_label ? <span className="it-owner">{it.owner_label}</span> : null}
                  {it.location ? <span className="it-loc">{it.location}</span> : null}
                  <span className={`it-stat its-${it.status}`}>{it.status.replace(/_/g, ' ')}</span>
                  {it.source.startsWith('auto') ? <span className="it-auto">Auto</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const I_CSS = `
.it-pub { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; }
.it-pubhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.it-pubsub { font-size: 12px; color: #7d776c; max-width: 460px; margin-top: 2px; }
.it-pubform { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.it-pubform .fp-in { font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; flex: 1 1 140px; min-width: 0; }
.it-publist { display: flex; flex-direction: column; gap: 6px; }
.it-pubitem { display: flex; align-items: center; gap: 10px; border: 1px solid #f0ebe0; border-radius: 10px; padding: 8px 11px; }
.it-pubtime { font-size: 12px; font-weight: 600; color: #123c2e; min-width: 64px; }
.it-pubtitle { flex: 1; font-size: 13px; color: #2c2a26; display: flex; align-items: center; gap: 8px; }
.it-pubtrack { font-size: 9.5px; font-weight: 700; letter-spacing: .4px; color: #1E5D4A; background: rgba(30,93,74,.12); border-radius: 4px; padding: 1px 6px; }
.it-pubempty { font-size: 12px; color: #b3aa99; padding: 8px 0; }
.it-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
.it-evname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; color: #123c2e; line-height: 1.1; }
.it-gen { font-size: 11.5px; color: #b3aa99; margin-top: 2px; }
.it-checks { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.it-check { display: flex; align-items: center; gap: 9px; font-size: 12.5px; border-radius: 10px; padding: 9px 12px; }
.it-checkglyph { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.sev-error { background: #f6eaea; color: #8a3a3a; } .sev-error .it-checkglyph { background: #8a3a3a; color: #fff; }
.sev-warning { background: rgba(201,163,91,.14); color: #8a6d2e; } .sev-warning .it-checkglyph { background: #C9A35B; color: #fff; }
.sev-info { background: #eef2ef; color: #4a5a52; } .sev-info .it-checkglyph { background: #7d776c; color: #fff; }
.sev-ok { background: rgba(30,93,74,.1); color: #1E5D4A; margin-bottom: 16px; } .sev-ok .it-checkglyph { background: #1E5D4A; color: #fff; }
.it-roles { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.it-role { display: flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; padding: 6px 12px; border: 1px solid #e7e1d6; border-radius: 999px; background: #fff; color: #7d776c; cursor: pointer; }
.it-role.is-active { background: #123c2e; border-color: #123c2e; color: #fff; }
.it-rolecount { font-size: 10px; font-weight: 700; background: rgba(0,0,0,.08); border-radius: 999px; padding: 0 6px; }
.it-role.is-active .it-rolecount { background: rgba(255,255,255,.2); }
.it-list { display: flex; flex-direction: column; gap: 8px; }
.it-item { display: grid; grid-template-columns: 110px 96px 1fr; gap: 12px; align-items: start; background: #fff; border: 1px solid #f0ebe0; border-radius: 12px; padding: 12px 14px; }
.it-time { font-size: 12.5px; font-weight: 600; color: #123c2e; }
.it-cat { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; padding: 3px 8px; border-radius: 6px; text-align: center; align-self: start; background: #eef2ef; color: #4a5a52; }
.cat-load_in, .cat-load_out { background: rgba(201,163,91,.18); color: #8a6d2e; }
.cat-program { background: rgba(30,93,74,.14); color: #1E5D4A; }
.cat-payment { background: #f6eaea; color: #8a3a3a; }
.cat-service { background: #eaf0ee; color: #1E5D4A; }
.it-title { font-size: 13.5px; color: #2c2a26; font-weight: 600; }
.it-desc { font-size: 12px; color: #7d776c; margin-top: 2px; line-height: 1.5; }
.it-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
.it-owner { font-size: 10.5px; color: #9a8a5e; font-weight: 600; }
.it-loc { font-size: 10.5px; color: #b3aa99; }
.it-stat { font-size: 9.5px; font-weight: 600; text-transform: capitalize; padding: 1px 7px; border-radius: 999px; background: #eef2ef; color: #5a6b62; }
.its-confirmed { background: rgba(30,93,74,.15); color: #1E5D4A; }
.its-done { background: rgba(30,93,74,.15); color: #1E5D4A; }
.its-delayed { background: #f6eaea; color: #8a3a3a; }
.it-auto { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #9a8a5e; border: 1px solid #e7e1d6; border-radius: 4px; padding: 1px 5px; }
@media (max-width: 720px) { .it-item { grid-template-columns: 1fr; gap: 6px; } }
`;
