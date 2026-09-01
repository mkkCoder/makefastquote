import { useCallback, useEffect, useRef, useState } from 'react';
import type { SignatureImage, Stroke } from '../types';
import { processSignatureFile, SignatureImportError } from '../lib/signature';
import { IconEraser, IconUpload, IconX } from './Icons';

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
  image: SignatureImage | null;
  onImageChange: (image: SignatureImage | null) => void;
}

export function SignaturePad({ strokes, onChange, image, onImageChange }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onImageChange(await processSignatureFile(file));
    } catch (err) {
      // Only our own messages are safe to show; anything else is a bug and
      // would surface as a stack-flavoured string in the middle of a form.
      if (err instanceof SignatureImportError) {
        // An expected, handled outcome — a blank page, a photo with no
        // contrast. Logging it as an error trains people to ignore the
        // console, and it is not a bug.
        setError(err.message);
      } else {
        setError("That image couldn't be processed. Try another one.");
        console.error('signature import failed', err);
      }
    } finally {
      setBusy(false);
    }
  };

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

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      data-testid="signature-file"
      onChange={(e) => {
        void importFile(e.target.files?.[0]);
        // Reset so picking the same file twice still fires a change event.
        e.target.value = '';
      }}
    />
  );

  // An uploaded signature replaces the canvas entirely. Showing both at once
  // invites the question "which one is on my document?", and the honest answer
  // has to be visible rather than explained.
  if (image) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="label mb-0">Signature</span>
          <button
            type="button"
            onClick={() => onImageChange(null)}
            data-testid="signature-remove"
            className="text-xs px-2 py-1 rounded-md border border-edge-strong text-muted hover:text-ink inline-flex items-center gap-1"
          >
            <IconX className="w-3 h-3" />
            Remove
          </button>
        </div>
        <div
          className="w-full h-28 rounded-lg border border-edge-strong grid place-items-center p-2"
          /* A light check so a transparent signature is visibly transparent —
             on a plain panel you cannot tell the background was removed. */
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgba(128,128,128,.14) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.14) 75%),' +
              'linear-gradient(45deg, rgba(128,128,128,.14) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.14) 75%)',
            backgroundSize: '14px 14px',
            backgroundPosition: '0 0, 7px 7px',
          }}
        >
          <img
            src={image.src}
            alt="Your uploaded signature"
            data-testid="signature-image"
            /* An ABSOLUTE max-height, not max-h-full. A percentage height
               inside an auto-sized grid row resolves against a track that is
               itself sized by the content, which browsers treat as `none` —
               so the signature grew past its frame and printed over the
               caption underneath. h-28 minus p-2 on both sides is 6rem. */
            className="max-w-full max-h-24 object-contain"
          />
        </div>
        <p className="text-xs text-faint mt-1.5">
          Background removed and cropped. Nothing was uploaded anywhere — this ran in your browser.
        </p>
        {fileInput}
      </div>
    );
  }

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
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <p className="text-xs text-faint">Draw with a mouse, finger or stylus.</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          data-testid="signature-upload"
          className="text-xs text-brand hover:underline underline-offset-2 inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
        >
          <IconUpload className="w-3 h-3" />
          {busy ? 'Reading…' : 'Upload a photo instead'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 mt-1.5" data-testid="signature-error">
          {error}
        </p>
      )}
      {fileInput}
    </div>
  );
}
