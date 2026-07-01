import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Phase 6 - Floorplans tab (blueprint 14.4). Add floorplan references by URL
 * and view them. Files are uploaded through the shared document system; this tab
 * registers and previews the floorplan reference used by the seating builder.
 */
type Floorplan = {
  id: string;
  name: string | null;
  description: string | null;
  file_url: string | null;
  scale: string | null;
  is_primary: boolean | null;
  created_at: string;
};

export default function FloorplansTab({ eventId }: { eventId: string }) {
  const [plans, setPlans] = useState<Floorplan[]>([]);
  const [form, setForm] = useState({ name: '', file_url: '', description: '', scale: '' });
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiGet<{ floorplans: Floorplan[] }>(`/seating/floorplans/event/${eventId}`);
      setPlans(r.floorplans);
      if (r.floorplans.length && !active) setActive(r.floorplans[0].id);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiSend<{ floorplan: Floorplan }>('POST', `/seating/floorplans/event/${eventId}`, form);
      setForm({ name: '', file_url: '', description: '', scale: '' });
      setActive(r.floorplan.id);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function makePrimary(id: string) {
    try { await apiSend('PATCH', `/seating/floorplans/${id}`, { is_primary: true }); await load(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function remove(id: string) {
    try { await apiSend('DELETE', `/seating/floorplans/${id}`); if (active === id) setActive(null); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  const current = plans.find((p) => p.id === active) ?? null;

  return (
    <div>
      <style>{F_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <form className="fp-add" onSubmit={add}>
        <input className="fp-in" placeholder="Floorplan name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="fp-in" placeholder="Image or PDF URL" value={form.file_url}
          onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
        <input className="fp-in" placeholder="Scale (e.g. 1px = 1ft)" value={form.scale}
          onChange={(e) => setForm({ ...form, scale: e.target.value })} />
        <button type="submit" className="ew-btn sm" disabled={busy}>Add floorplan</button>
      </form>

      {plans.length === 0 ? (
        <div className="ew-empty"><p>No floorplans yet. Add a floorplan reference (image or PDF URL) to use in the seating chart builder.</p></div>
      ) : (
        <div className="fp-wrap">
          <div className="fp-list">
            {plans.map((p) => (
              <button key={p.id} type="button" className={`fp-item${p.id === active ? ' is-active' : ''}`} onClick={() => setActive(p.id)}>
                <span className="fp-itemname">{p.name || 'Floorplan'}{p.is_primary ? <span className="fp-prim">Primary</span> : null}</span>
                <span className="fp-itemmeta">{p.scale || 'No scale set'}</span>
              </button>
            ))}
          </div>
          <div className="fp-view">
            {current ? (
              <>
                <div className="fp-viewhead">
                  <h3>{current.name || 'Floorplan'}</h3>
                  <div className="fp-actions">
                    {!current.is_primary ? <button type="button" className="ew-btn ghost sm" onClick={() => makePrimary(current.id)}>Set primary</button> : null}
                    <button type="button" className="fp-del" onClick={() => remove(current.id)}>Remove</button>
                  </div>
                </div>
                {current.description ? <p className="ew-muted">{current.description}</p> : null}
                {current.file_url ? (
                  /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(current.file_url)
                    ? <img className="fp-img" src={current.file_url} alt={current.name ?? 'Floorplan'} />
                    : <a className="ew-btn ghost sm" href={current.file_url} target="_blank" rel="noreferrer">Open file</a>
                ) : <div className="fp-noimg">No file attached for this floorplan.</div>}
              </>
            ) : <p className="ew-muted">Select a floorplan to view.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const F_CSS = `
.fp-add { display: flex; flex-wrap: wrap; gap: 8px; background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
.fp-in { font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; flex: 1 1 160px; min-width: 0; }
.fp-wrap { display: grid; grid-template-columns: 220px 1fr; gap: 16px; }
.fp-list { display: flex; flex-direction: column; gap: 6px; }
.fp-item { text-align: left; background: #fff; border: 1px solid #e7e1d6; border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.fp-item.is-active { border-color: #1E5D4A; box-shadow: 0 0 0 2px rgba(30,93,74,.12); }
.fp-itemname { font-size: 13px; color: #123c2e; display: flex; align-items: center; gap: 6px; }
.fp-prim { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #123c2e; background: rgba(201,163,91,.3); border-radius: 4px; padding: 1px 5px; }
.fp-itemmeta { font-size: 11px; color: #b3aa99; }
.fp-view { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 16px; min-height: 220px; }
.fp-viewhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.fp-viewhead h3 { font-size: 20px; color: #123c2e; }
.fp-actions { display: flex; gap: 8px; align-items: center; }
.fp-del { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; }
.fp-del:hover { text-decoration: underline; }
.fp-img { display: block; max-width: 100%; border: 1px solid #e7e1d6; border-radius: 10px; margin-top: 12px; }
.fp-noimg { margin-top: 12px; padding: 30px; text-align: center; color: #b3aa99; border: 1px dashed #e7e1d6; border-radius: 10px; font-size: 12.5px; }
@media (max-width: 720px) { .fp-wrap { grid-template-columns: 1fr; } }
`;
