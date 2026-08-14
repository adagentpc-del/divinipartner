import React from 'react';

/**
 * Isometric ("3D") render of the same seating layout SeatingChartTab edits in
 * plan view. Read-only (drag/position editing stays in 2D plan view, which is
 * where precise placement actually happens) -- this is the presentation /
 * export view, matching the visual polish of dedicated floor-plan tools like
 * Social Tables without pulling in a WebGL engine or a new dependency.
 *
 * Projection: standard 30/30 axonometric --
 *   ix = (x - y) * cos(30deg)
 *   iy = (x + y) * sin(30deg) - z
 * Because ix depends only on cos and iy (plus z) only on sin of the same
 * rotated angle, a circle of radius r in the plan (x,y) plane projects to an
 * AXIS-ALIGNED ellipse (no rotation needed) with semi-axes
 *   rx = r * cos(30deg) * sqrt(2)
 *   ry = r * sin(30deg) * sqrt(2)
 * -- this is exact for this projection, not an approximation, which is what
 * makes the round-table cylinders below correct rather than a stylized guess.
 * A vertical extrusion (height h) is just a translation by -h in iy, since z
 * only ever appears in the iy term -- so a cylinder's side wall is literally
 * the front half of its base ellipse's arc, copied straight up.
 */

type STable = { id: string; label: string; x: number; y: number; shape?: string; seats?: number; vip?: boolean; rotation?: number };
type SZone = { id: string; label: string; type: string; x: number; y: number; width?: number; height?: number };
type Layout = { tables: STable[]; zones: SZone[]; assignments: Record<string, string> };

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);
const SQRT2 = Math.SQRT2;

function iso(x: number, y: number, z = 0): { ix: number; iy: number } {
  return { ix: (x - y) * COS30, iy: (x + y) * SIN30 - z };
}

function ellipsePoint(cx: number, cy: number, rx: number, ry: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
}

/** A round table (or chair) as an isometric cylinder: filled top ellipse + a
 *  shaded front wall connecting it to the floor. */
function Cylinder({ x, y, r, h, fill, stroke, dark, selected }: { x: number; y: number; r: number; h: number; fill: string; stroke: string; dark: string; selected?: boolean }) {
  const rx = r * COS30 * SQRT2;
  const ry = r * SIN30 * SQRT2;
  const base = iso(x, y, 0);
  const top = iso(x, y, h);
  const left = ellipsePoint(base.ix, base.iy, rx, ry, 180);
  const right = ellipsePoint(base.ix, base.iy, rx, ry, 0);
  const leftTop = { x: left.x, y: left.y - h };
  const rightTop = { x: right.x, y: right.y - h };
  const wallPath = [
    `M ${left.x} ${left.y}`,
    `A ${rx} ${ry} 0 0 0 ${right.x} ${right.y}`,
    `L ${rightTop.x} ${rightTop.y}`,
    `A ${rx} ${ry} 0 0 1 ${leftTop.x} ${leftTop.y}`,
    'Z',
  ].join(' ');
  return (
    <g>
      <ellipse cx={base.ix} cy={base.iy} rx={rx} ry={ry} fill="#00000018" />
      <path d={wallPath} fill={dark} stroke={stroke} strokeWidth={0.75} />
      <ellipse cx={top.ix} cy={top.iy} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={selected ? 2.5 : 1} />
    </g>
  );
}

/** A rectangular table as an extruded box: a rotated top parallelogram plus
 *  one visible front wall (the two lowest-on-screen corners of the base,
 *  which are always the viewer-facing edge regardless of plan rotation). */
function Box({ cx, cy, w, hgt, rotationDeg, h, fill, stroke, dark, selected }: { cx: number; cy: number; w: number; hgt: number; rotationDeg: number; h: number; fill: string; stroke: string; dark: string; selected?: boolean }) {
  const rot = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corners = [
    [-w / 2, -hgt / 2],
    [w / 2, -hgt / 2],
    [w / 2, hgt / 2],
    [-w / 2, hgt / 2],
  ].map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
  const baseIso = corners.map((c) => iso(c.x, c.y, 0));
  const topIso = corners.map((c) => iso(c.x, c.y, h));
  const topPath = `M ${topIso.map((p) => `${p.ix} ${p.iy}`).join(' L ')} Z`;
  // The two base corners with the largest iy are the front (viewer-facing)
  // edge under this projection, for any rotation.
  const order = baseIso.map((p, i) => ({ i, iy: p.iy })).sort((a, b) => b.iy - a.iy);
  const [fi1, fi2] = [order[0].i, order[1].i];
  const wallPath = `M ${baseIso[fi1].ix} ${baseIso[fi1].iy} L ${baseIso[fi2].ix} ${baseIso[fi2].iy} L ${topIso[fi2].ix} ${topIso[fi2].iy} L ${topIso[fi1].ix} ${topIso[fi1].iy} Z`;
  return (
    <g>
      <path d={`M ${baseIso.map((p) => `${p.ix} ${p.iy}`).join(' L ')} Z`} fill="#00000018" />
      <path d={wallPath} fill={dark} stroke={stroke} strokeWidth={0.75} />
      <path d={topPath} fill={fill} stroke={stroke} strokeWidth={selected ? 2.5 : 1} />
    </g>
  );
}

function chairPositions(count: number, cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(count, 14));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return pts;
}

export default function SeatingChart3DView({
  layout, w, h, selected, onSelect,
}: { layout: Layout; w: number; h: number; selected: string | null; onSelect: (id: string) => void }) {
  const corners = [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
  ].map((c) => iso(c.x, c.y, 0));
  const bounds = corners.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.ix), maxX: Math.max(b.maxX, p.ix), minY: Math.min(b.minY, p.iy), maxY: Math.max(b.maxY, p.iy) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const pad = 90;
  const vbX = bounds.minX - pad;
  const vbY = bounds.minY - pad - 40; // extra headroom for table/chair height
  const vbW = bounds.maxX - bounds.minX + pad * 2;
  const vbH = bounds.maxY - bounds.minY + pad * 2 + 40;

  // Painter's algorithm: draw back-to-front by plan depth (x + y ascending).
  type Item = { key: string; depth: number; render: () => React.ReactNode };
  const items: Item[] = [];

  for (const z of layout.zones) {
    const cx = z.x + (z.width ?? 140) / 2;
    const cy = z.y + (z.height ?? 90) / 2;
    const zc = [
      { x: z.x, y: z.y }, { x: z.x + (z.width ?? 140), y: z.y },
      { x: z.x + (z.width ?? 140), y: z.y + (z.height ?? 90) }, { x: z.x, y: z.y + (z.height ?? 90) },
    ].map((p) => iso(p.x, p.y, 1));
    items.push({
      key: `z-${z.id}`,
      depth: cx + cy - 1000, // zones are floor decals -- always drawn before furniture
      render: () => (
        <path d={`M ${zc.map((p) => `${p.ix} ${p.iy}`).join(' L ')} Z`} fill="rgba(201,163,91,.16)" stroke="#C9A35B" strokeDasharray="5 4" />
      ),
    });
  }

  for (const t of layout.tables) {
    const isSel = t.id === selected;
    const isRect = t.shape === 'rectangle' || t.shape === 'head';
    const seats = Math.max(0, t.seats ?? 8);
    const fill = t.vip ? '#123c2e' : '#ffffff';
    const dark = t.vip ? '#0a2419' : '#e2ddd0';
    const stroke = isSel ? '#C9A35B' : '#1E5D4A';
    items.push({
      key: `t-${t.id}`,
      depth: t.x + t.y,
      render: () => (
        <g onClick={() => onSelect(t.id)} style={{ cursor: 'pointer' }}>
          {isRect
            ? <Box cx={t.x} cy={t.y} w={88} hgt={44} rotationDeg={t.rotation ?? 0} h={26} fill={fill} stroke={stroke} dark={dark} selected={isSel} />
            : <Cylinder x={t.x} y={t.y} r={34} h={26} fill={fill} stroke={stroke} dark={dark} selected={isSel} />}
          {chairPositions(seats, t.x, t.y, isRect ? 60 : 50).map((c, i) => (
            <Cylinder key={i} x={c.x} y={c.y} r={9} h={14} fill="#fff" stroke="#C9A35B" dark="#e2ddd0" />
          ))}
        </g>
      ),
    });
  }

  items.sort((a, b) => a.depth - b.depth);

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="sc-canvas sc-3d">
      <path d={`M ${corners.map((p) => `${p.ix} ${p.iy}`).join(' L ')} Z`} fill="#f7f4ee" stroke="#e7e1d6" />
      {items.map((it) => <g key={it.key}>{it.render()}</g>)}
    </svg>
  );
}
