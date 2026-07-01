/**
 * Native signature capture (blueprint 30.2). A small canvas pad the signer draws
 * on with mouse or touch, plus a "type instead" mode. Exposes the result via
 * onChange as either a PNG data URL (drawn) or the typed name. Self-contained
 * styles, brand colors, zero em dashes.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export type SignatureValue =
  | { mode: 'draw'; dataUrl: string | null }
  | { mode: 'type'; typedName: string };

export default function SignaturePad({
  onChange,
  defaultName,
}: {
  onChange: (value: SignatureValue) => void;
  defaultName?: string;
}) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState(defaultName ?? '');
  const [hasDrawing, setHasDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const emitDraw = useCallback(() => {
    const c = canvasRef.current;
    onChange({ mode: 'draw', dataUrl: c && hasDrawing ? c.toDataURL('image/png') : null });
  }, [onChange, hasDrawing]);

  // Initialize canvas backing store at device resolution.
  useEffect(() => {
    if (mode !== 'draw') return;
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#123c2e';
    }
  }, [mode]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasDrawing) setHasDrawing(true);
  }
  function onUp() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    emitDraw();
  }

  // Re-emit when drawing toggles to "has content".
  useEffect(() => {
    if (mode === 'draw') emitDraw();
  }, [hasDrawing, mode, emitDraw]);

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawing(false);
    onChange({ mode: 'draw', dataUrl: null });
  }

  function pickType() {
    setMode('type');
    onChange({ mode: 'type', typedName: typed });
  }
  function pickDraw() {
    setMode('draw');
    emitDraw();
  }
  function onTypedChange(v: string) {
    setTyped(v);
    onChange({ mode: 'type', typedName: v });
  }

  return (
    <div className="dpsig">
      <style>{CSS}</style>
      <div className="dpsig-tabs">
        <button type="button" className={mode === 'draw' ? 'on' : ''} onClick={pickDraw}>Draw signature</button>
        <button type="button" className={mode === 'type' ? 'on' : ''} onClick={pickType}>Type instead</button>
      </div>

      {mode === 'draw' ? (
        <div className="dpsig-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="dpsig-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
          {!hasDrawing ? <span className="dpsig-hint">Draw your signature here</span> : null}
          <div className="dpsig-actions">
            <button type="button" className="dpsig-clear" onClick={clear}>Clear</button>
          </div>
        </div>
      ) : (
        <div className="dpsig-type">
          <input
            type="text"
            value={typed}
            onChange={(e) => onTypedChange(e.target.value)}
            placeholder="Type your full legal name"
            aria-label="Typed signature"
          />
          <div className="dpsig-typed-preview">{typed || 'Your signature'}</div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.dpsig {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dpsig-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.dpsig-tabs button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--dp-line); background: #fff; color: var(--dp-muted); cursor: pointer; }
.dpsig-tabs button.on { background: var(--dp-emerald); color: #fff; border-color: var(--dp-emerald); }
.dpsig-canvas-wrap { position: relative; }
.dpsig-canvas { width: 100%; height: 150px; background: #fff; border: 1px solid var(--dp-line); border-radius: 12px; touch-action: none; display: block; cursor: crosshair; }
.dpsig-hint { position: absolute; left: 14px; top: 62px; color: var(--dp-muted); font-size: 13px; pointer-events: none; }
.dpsig-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.dpsig-clear { font: inherit; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 8px; border: 1px solid var(--dp-line); background: var(--dp-ivory); color: var(--dp-ink); cursor: pointer; }
.dpsig-type input { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--dp-line); border-radius: 10px; background: #fff; }
.dpsig-type input:focus { outline: none; border-color: var(--dp-emerald-2); }
.dpsig-typed-preview { margin-top: 10px; padding: 14px 16px; border: 1px solid var(--dp-line); border-radius: 12px; background: #fff; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 30px; color: var(--dp-emerald-2); min-height: 32px; }
`;
