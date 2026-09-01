import { useCallback, useEffect, useRef } from 'react';
import type { Stroke } from '../types';
import { IconEraser } from './Icons';

/**
 * Signature capture.
 *
 * Hand-rolled pointer events rather than a drawing library: this is ~80 lines,
 * a library is a dependency with its own bugs, and Pointer Events already
 * unifies mouse, touch and stylus including pressure.
 *
 * Strokes are stored as normalised 0..1 coordinates, NOT canvas pixels. That
 * is what lets the same signature be drawn into a 62 mm box on the PDF, a
 * scaled preview, and a canvas whose CSS width changes when the window
 * resizes — without the signature stretching or drifting. A pixel-space store
 * would silently distort the moment the layout breakpoint changed.
 */

interface Props {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
}

export function SignaturePad({ strokes, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const current = useRef<Array<readonly [number, number]>>([]);
  // Held in a ref as well as props so a pointermove handler never reads a
  // stale closure. Synced in an effect rather than during render: writing a
  // ref while rendering is not safe under concurrent React, which may render
  // and discard, leaving the ref describing a tree that was never committed.
  const strokesRef = useRef<Stroke[]>(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    // Size the backing store to device pixels so strokes are not fuzzy.
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = getComputedStyle(canvas).color || '#111';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const all = [...strokesRef.current, current.current].filter((s) => s.length > 1);
    for (const stroke of all) {
      ctx.beginPath();
      stroke.forEach(([nx, ny], i) => {
        const x = nx * rect.width;
        const y = ny * rect.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [redraw]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): readonly [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    current.current = [pointFrom(e)];
    redraw();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pointFrom(e);
    const last = current.current[current.current.length - 1];
    // Drop sub-pixel jitter: fewer points means a smaller localStorage payload
    // and fewer line segments in the PDF, with no visible difference.
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.004) return;
    current.current = [...current.current, p];
    redraw();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length > 1) {
      onChange([...strokesRef.current, current.current]);
    }
    current.current = [];
    redraw();
  };

  const clear = () => {
    current.current = [];
    onChange([]);
  };

  const undo = () => {
    onChange(strokesRef.current.slice(0, -1));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label mb-0">Signature</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={strokes.length === 0}
            className="text-xs px-2 py-1 rounded-md border border-edge-strong text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={strokes.length === 0}
            className="text-xs px-2 py-1 rounded-md border border-edge-strong text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <IconEraser className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        // touch-none stops the browser scrolling the page instead of drawing.
        className="w-full h-28 rounded-lg border border-edge-strong bg-panel text-ink touch-none cursor-crosshair"
        aria-label="Draw your signature"
      />
      <p className="text-xs text-faint mt-1.5">Draw with a mouse, finger or stylus.</p>
    </div>
  );
}
