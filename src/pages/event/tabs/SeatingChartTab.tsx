import React, { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Phase 6 - Seating Chart builder (blueprint 14.3). Place tables and zones on a
 * floorplan canvas, mark VIP tables, assign guests to tables, and export the
 * layout. Drag tables to reposition; click to select and assign guests. The
 * whole layout (tables, zones, assignments) is saved as a single jsonb blob.
 */
type STable = { id: string; label: string; x: number; y: number; shape?: string; seats?: number; vip?: boolean };
type SZone = { id: string; label: string; type: string; x: number; y: number; width?: number; height?: number };
type Layout = { tables: STable[]; zones: SZone[]; assignments: Record<string, string> };
type Chart = { id: string; name: string | null; status: string | null; floorplan_id: string | null; layout: Layout | null };
type Floorplan = { id: string; name: string | null; file_url: string | null };
type Guest = { id: string; name: string | null; vip: boolean | null };
type Meta = { zone_types: { key: string; label: string }[]; table_shapes: string[] };

const W = 900;
const H = 600;
const uid = () => Math.random().toString(36).slice(2, 9);
const emptyLayout = (): Layout => ({ tables: [], zones: [], assignments: {} });

export default function SeatingChartTab({ eventId }: { eventId: string }) {
  const [chart, setChart] = useState<Chart | null>(null);
  const [layout, setLayout] = useState<Layout>(emptyLayout());
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  async function load() {
    try {
      const [c, f, g, m] = await Promise.all([
        apiGet<{ charts: Chart[] }>(`/seating/charts/event/${eventId}`),
        apiGet<{ floorplans: Floorplan[] }>(`/seating/floorplans/event/${eventId}`),
        apiGet<{ guests: Guest[] }>(`/guests/event/${eventId}`),
        apiGet<Meta>(`/seating/meta`),
      ]);
      setFloorplans(f.floorplans);
      setGuests(g.guests);
      setMeta(m);
      const existing = c.charts[0] ?? null;
      setChart(existing);
      setLayout(normalize(existing?.layout));
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  function normalize(l: Layout | null | undefined): Layout {
    return { tables: l?.tables ?? [], zones: l?.zones ?? [], assignments: l?.assignments ?? {} };
  }

  async function createChart() {
    setBusy(true); setErr(null);
    try {
      const r = await apiSend<{ chart: Chart }>('POST', `/seating/charts/event/${eventId}`, {
        name: 'Seating chart', layout: emptyLayout(),
        floorplan_id: floorplans[0]?.id ?? null,
      });
      setChart(r.chart);
      setLayout(normalize(r.chart.layout));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    if (!chart) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiSend<{ chart: Chart }>('PATCH', `/seating/charts/${chart.id}`, { layout });
      setChart(r.chart);
      setDirty(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function mutate(fn: (l: Layout) => Layout) {
    setLayout((prev) => fn(structuredClone(prev)));
    setDirty(true);
  }

  function addTable() {
    const n = layout.tables.length + 1;
    mutate((l) => { l.tables.push({ id: uid(), label: `Table ${n}`, x: 80 + (n % 6) * 120, y: 90 + Math.floor(n / 6) * 120, shape: 'round', seats: 8, vip: false }); return l; });
  }
  function addZone(type: string) {
    const label = meta?.zone_types.find((z) => z.key === type)?.label ?? type;
    mutate((l) => { l.zones.push({ id: uid(), label, type, x: 60, y: 60, width: 160, height: 100 }); return l; });
  }
  function patchTable(id: string, p: Partial<STable>) {
    mutate((l) => { const t = l.tables.find((x) => x.id === id); if (t) Object.assign(t, p); return l; });
  }
  function removeTable(id: string) {
    mutate((l) => {
      l.tables = l.tables.filter((t) => t.id !== id);
      for (const gid of Object.keys(l.assignments)) if (l.assignments[gid] === id) delete l.assignments[gid];
      return l;
    });
    if (selected === id) setSelected(null);
  }
  function removeZone(id: string) {
    mutate((l) => { l.zones = l.zones.filter((z) => z.id !== id); return l; });
  }
  function assign(guestId: string, tableId: string) {
    mutate((l) => { if (tableId) l.assignments[guestId] = tableId; else delete l.assignments[guestId]; return l; });
  }

  function clientPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }
  function onDown(e: React.PointerEvent, id: string) {
    const t = layout.tables.find((x) => x.id === id);
    if (!t) return;
    const p = clientPoint(e);
    dragRef.current = { id, dx: p.x - t.x, dy: p.y - t.y };
    setSelected(id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const p = clientPoint(e);
    patchTable(d.id, { x: Math.max(20, Math.min(W - 20, p.x - d.dx)), y: Math.max(20, Math.min(H - 20, p.y - d.dy)) });
  }
  function onUp() { dragRef.current = null; }

  function exportLayout() {
    const blob = new Blob([JSON.stringify({ eventId, chart: chart?.name, layout }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `seating-${eventId}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const fp = floorplans.find((f) => f.id === chart?.floorplan_id) ?? null;
  const tableLabel = (id: string | undefined) => layout.tables.find((t) => t.id === id)?.label ?? '';
  const seatsUsed = (id: string) => Object.values(layout.assignments).filter((tid) => tid === id).length;
  const selTable = layout.tables.find((t) => t.id === selected) ?? null;

  if (!chart) {
    return (
      <div>
        <style>{S_CSS}</style>
        {err ? <p className="ew-error">{err}</p> : null}
        <div className="ew-empty">
          <p>No seating chart yet. Create one to start placing tables and zones on the floorplan and assigning guests.</p>
          <button type="button" className="ew-btn" style={{ marginTop: 12 }} onClick={createChart} disabled={busy}>Create seating chart</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{S_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="sc-toolbar">
        <button type="button" className="ew-btn sm" onClick={addTable}>Add table</button>
        <select className="sc-zonesel" defaultValue="" onChange={(e) => { if (e.target.value) { addZone(e.target.value); e.target.value = ''; } }}>
          <option value="">Add zone...</option>
          {meta?.zone_types.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
        </select>
        <span className="sc-spacer" />
        <button type="button" className="ew-btn ghost sm" onClick={exportLayout}>Export</button>
        <button type="button" className="ew-btn sm" onClick={save} disabled={busy || !dirty}>{dirty ? 'Save layout' : 'Saved'}</button>
      </div>

      <div className="sc-grid">
        <div className="sc-canvaswrap">
          <svg ref={svgRef} className="sc-canvas" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
            <rect x={0} y={0} width={W} height={H} fill="#f7f4ee" stroke="#e7e1d6" />
            {fp?.file_url && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(fp.file_url)
              ? <image href={fp.file_url} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" opacity={0.35} />
              : null}
            {layout.zones.map((z) => (
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.width ?? 140} height={z.height ?? 90} rx={8}
                  fill="rgba(201,163,91,.12)" stroke="#C9A35B" strokeDasharray="6 4" />
                <text x={z.x + 8} y={z.y + 18} className="sc-zonelabel">{z.label}</text>
                <text x={(z.x + (z.width ?? 140)) - 6} y={z.y + 16} className="sc-zonex" onClick={() => removeZone(z.id)}>x</text>
              </g>
            ))}
            {layout.tables.map((t) => {
              const r = 34;
              const isSel = t.id === selected;
              return (
                <g key={t.id} onPointerDown={(e) => onDown(e, t.id)} className="sc-table">
                  {t.shape === 'rectangle' || t.shape === 'head'
                    ? <rect x={t.x - 44} y={t.y - 22} width={88} height={44} rx={6}
                        fill={t.vip ? '#123c2e' : '#fff'} stroke={isSel ? '#C9A35B' : '#1E5D4A'} strokeWidth={isSel ? 3 : 1.5} />
                    : <circle cx={t.x} cy={t.y} r={r}
                        fill={t.vip ? '#123c2e' : '#fff'} stroke={isSel ? '#C9A35B' : '#1E5D4A'} strokeWidth={isSel ? 3 : 1.5} />}
                  <text x={t.x} y={t.y - 2} textAnchor="middle" className={`sc-tlabel${t.vip ? ' on' : ''}`}>{t.label}</text>
                  <text x={t.x} y={t.y + 12} textAnchor="middle" className={`sc-tseats${t.vip ? ' on' : ''}`}>{seatsUsed(t.id)}/{t.seats ?? 8}</text>
                </g>
              );
            })}
          </svg>
          <p className="ew-muted sc-hint">Drag tables to position them. Click a table to edit it and assign guests.</p>
        </div>

        <div className="sc-side">
          {selTable ? (
            <div className="sc-panel">
              <div className="sc-panelhead">
                <input className="sc-pname" value={selTable.label} onChange={(e) => patchTable(selTable.id, { label: e.target.value })} />
                <button type="button" className="fp-del sc-rm" onClick={() => removeTable(selTable.id)}>Remove</button>
              </div>
              <div className="sc-row">
                <label>Shape
                  <select value={selTable.shape ?? 'round'} onChange={(e) => patchTable(selTable.id, { shape: e.target.value })}>
                    {meta?.table_shapes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>Seats
                  <input type="number" min={1} max={30} value={selTable.seats ?? 8} onChange={(e) => patchTable(selTable.id, { seats: Number(e.target.value) })} />
                </label>
              </div>
              <label className="sc-viplabel">
                <input type="checkbox" checked={!!selTable.vip} onChange={(e) => patchTable(selTable.id, { vip: e.target.checked })} /> VIP table
              </label>
              <div className="sc-assigned">
                <div className="sc-subhead">Assigned guests ({seatsUsed(selTable.id)})</div>
                {guests.filter((g) => layout.assignments[g.id] === selTable.id).map((g) => (
                  <div key={g.id} className="sc-assignedrow">
                    <span>{g.name || 'Unnamed'}{g.vip ? ' (VIP)' : ''}</span>
                    <button type="button" onClick={() => assign(g.id, '')}>Unassign</button>
                  </div>
                ))}
                {seatsUsed(selTable.id) === 0 ? <p className="ew-muted">No guests at this table yet.</p> : null}
              </div>
            </div>
          ) : (
            <div className="sc-panel"><p className="ew-muted">Select a table to edit seats, mark VIP, and assign guests.</p></div>
          )}

          <div className="sc-panel">
            <div className="sc-subhead">Guests ({guests.length})</div>
            <div className="sc-guestlist">
              {guests.length === 0 ? <p className="ew-muted">No guests yet. Add them in the Guest List tab.</p> : null}
              {guests.map((g) => (
                <div key={g.id} className="sc-grow">
                  <span className="sc-gname">{g.name || 'Unnamed'}{g.vip ? <span className="gl-vip">VIP</span> : null}</span>
                  <select className="sc-gsel" value={layout.assignments[g.id] ?? ''} onChange={(e) => assign(g.id, e.target.value)}>
                    <option value="">Unassigned</option>
                    {layout.tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S_CSS = `
.sc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.sc-spacer { flex: 1 1 auto; }
.sc-zonesel { font: inherit; font-size: 12px; padding: 6px 9px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.sc-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
.sc-canvaswrap { min-width: 0; }
.sc-canvas { width: 100%; height: auto; border-radius: 12px; touch-action: none; user-select: none; display: block; }
.sc-table { cursor: grab; }
.sc-tlabel { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; fill: #123c2e; pointer-events: none; }
.sc-tlabel.on { fill: #fff; }
.sc-tseats { font-family: 'Inter', sans-serif; font-size: 9.5px; fill: #9a8a5e; pointer-events: none; }
.sc-tseats.on { fill: #C9A35B; }
.sc-zonelabel { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; fill: #9a7e3e; pointer-events: none; }
.sc-zonex { font-family: 'Inter', sans-serif; font-size: 12px; fill: #b3aa99; cursor: pointer; text-anchor: end; }
.sc-hint { margin-top: 8px; }
.sc-side { display: flex; flex-direction: column; gap: 12px; }
.sc-panel { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px; }
.sc-panelhead { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.sc-pname { flex: 1 1 auto; font: inherit; font-size: 14px; font-weight: 600; padding: 6px 8px; border: 1px solid #e7e1d6; border-radius: 8px; color: #123c2e; min-width: 0; }
.sc-rm { white-space: nowrap; }
.sc-row { display: flex; gap: 10px; margin-bottom: 8px; }
.sc-row label { flex: 1; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #9a8a5e; text-transform: uppercase; letter-spacing: .4px; font-weight: 600; }
.sc-row select, .sc-row input { font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid #e7e1d6; border-radius: 8px; color: #2c2a26; text-transform: none; }
.sc-viplabel { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #2c2a26; margin-bottom: 10px; }
.sc-subhead { font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; margin-bottom: 8px; }
.sc-assignedrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 4px 0; border-bottom: 1px solid #f0ebe0; }
.sc-assignedrow button { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; }
.sc-guestlist { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.sc-grow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sc-gname { font-size: 12.5px; color: #2c2a26; display: flex; align-items: center; gap: 5px; min-width: 0; }
.gl-vip { font-size: 9px; font-weight: 700; letter-spacing: .5px; color: #123c2e; background: rgba(201,163,91,.3); border-radius: 4px; padding: 1px 5px; }
.sc-gsel { font: inherit; font-size: 11.5px; padding: 4px 7px; border: 1px solid #e7e1d6; border-radius: 7px; background: #fff; color: #2c2a26; flex: 0 0 110px; }
.fp-del { font: inherit; font-size: 11px; color: #8a3a3a; background: transparent; border: 0; cursor: pointer; }
.fp-del:hover { text-decoration: underline; }
@media (max-width: 860px) { .sc-grid { grid-template-columns: 1fr; } }
`;
