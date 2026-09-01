import { useCallback, useRef, useState } from 'react';
import { useApp } from '../store';
import { PRICE } from '../config';
import { LogoImportError, processLogoFile } from '../lib/logo';
import { IconLock, IconUpload, IconX } from './Icons';

export function LogoUploader() {
  const doc = useApp((s) => s.doc);
  const isPro = useApp((s) => s.isPro);
  const setLogo = useApp((s) => s.setLogo);
  const setLogoScale = useApp((s) => s.setLogoScale);
  const setLogoAlign = useApp((s) => s.setLogoAlign);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const ingest = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        const logo = await processLogoFile(file);
        setLogo(logo.src, logo.aspect);
      } catch (err) {
        setError(err instanceof LogoImportError ? err.message : 'Could not use that image.');
      } finally {
        setBusy(false);
      }
    },
    [setLogo],
  );

  return (
    <div>
      <span className="label">Logo</span>
      <p className="text-xs text-muted mb-2">
        {isPro
          ? 'Printed in the header of every document you export.'
          : `Drop one in to preview it. Exporting it with the PDF is Pro (${PRICE.display}).`}
      </p>

      {doc.logo ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <img
              src={doc.logo}
              alt="Your logo"
              className="h-12 max-w-40 object-contain bg-white rounded border border-edge p-1"
            />
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setLogo(null)}>
              <IconX className="w-3 h-3" />
              Remove
            </button>
            {!isPro && (
              <span className="ml-auto text-xs font-semibold text-brand flex items-center gap-1">
                <IconLock className="w-3 h-3" />
                Preview
              </span>
            )}
          </div>

          <label className="text-xs text-muted flex items-center gap-3">
            Scale
            <input
              type="range"
              min={0.5}
              max={1.8}
              step={0.05}
              value={doc.logoScale}
              onChange={(e) => setLogoScale(Number(e.target.value))}
              className="flex-1 accent-brand"
              aria-label="Logo scale"
            />
            <span className="tabular-nums w-10 text-right">{Math.round(doc.logoScale * 100)}%</span>
          </label>

          <div className="flex gap-1.5" role="group" aria-label="Logo alignment">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={['btn text-xs flex-1 capitalize', doc.logoAlign === align ? 'btn-primary' : 'btn-ghost'].join(
                  ' ',
                )}
                onClick={() => setLogoAlign(align)}
              >
                {align}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          data-testid="logo-button"
          className={[
            'rounded-xl border-2 border-dashed px-3 py-4 text-sm transition-colors cursor-pointer',
            over ? 'border-brand bg-brand-soft' : 'border-edge-strong bg-panel',
          ].join(' ')}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void ingest(e.dataTransfer.files[0]);
          }}
          onPaste={(e) => {
            const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
            const file = item?.getAsFile();
            if (file) {
              e.preventDefault();
              void ingest(file);
            }
          }}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
        >
          <span className="flex items-center gap-2 font-semibold">
            {isPro ? <IconUpload className="w-4 h-4" /> : <IconLock className="w-4 h-4 text-brand" />}
            {busy ? 'Processing…' : 'Drop, paste or click to add a logo'}
          </span>
          <span className="block text-xs text-muted mt-1">PNG, JPG, SVG or WebP · under 1.5 MB</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        data-testid="logo-file"
        onChange={(e) => {
          void ingest(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
