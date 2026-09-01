import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { PRICE, SITE } from '../config';
import { isCheckoutConfigured, openCheckout } from '../lib/checkout';
import { validateKey } from '../lib/license';
import { cleanPastedKey } from '../pdf/text';
import { buildPdf, suggestedFilename } from '../pdf/render';
import { downloadBlob } from '../lib/exportData';
import { IconCheck, IconSparkle, IconX } from './Icons';

const BENEFITS = [
  ['Your logo on every document', 'Upload once. It sits in the header of every proposal and invoice you send.'],
  ['Three studio templates', 'Modern, Minimalist and Classic — different enough that clients notice.'],
  ['Your colour, no footer credit', 'Brand the table and totals. The document is yours end to end.'],
] as const;

export function UpgradeModal() {
  const reason = useApp((s) => s.upgradeReason);
  const close = useApp((s) => s.closeUpgrade);
  const setLicense = useApp((s) => s.setLicense);
  const doc = useApp((s) => s.doc);
  const isLogoExport = reason === 'logo-export';

  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'error' | 'done'>('idle');
  const [message, setMessage] = useState('');
  // Layer 2: after the overlay closes we open the code field for them rather
  // than making them hunt for it.
  const [codeFieldOpen, setCodeFieldOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!reason) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [reason, close]);

  useEffect(() => {
    if (codeFieldOpen) codeInputRef.current?.focus();
  }, [codeFieldOpen]);

  if (!reason) return null;

  const activate = async (raw: string) => {
    const cleaned = cleanPastedKey(raw);
    if (!cleaned) {
      setStatus('error');
      setMessage('Paste the code from your email.');
      return;
    }
    setStatus('checking');
    setMessage('');
    const outcome = await validateKey(cleaned);

    if (outcome.status === 'valid') {
      setLicense({
        key: cleaned,
        valid: true,
        lastCheck: Date.now(),
        ...(outcome.instanceName ? { instanceName: outcome.instanceName } : {}),
      });
      setStatus('done');
      setTimeout(close, 900);
      return;
    }
    setStatus('error');
    // A first activation that cannot reach the server is NOT granted — see the
    // fail-open rule in lib/license.ts. Telling them the truth here is what
    // stops a support email three days later.
    setMessage(
      outcome.status === 'unreachable'
        ? 'Could not reach the licence server. Check your connection and try again.'
        : outcome.message,
    );
  };

  const buy = async () => {
    setBuying(true);
    const result = await openCheckout();
    setBuying(false);

    if (result.kind === 'key') {
      await activate(result.key);
      return;
    }
    // Every other outcome ends with the code field open and focused.
    setCodeFieldOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        tabIndex={-1}
        className="bg-panel w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-edge shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between p-5 pb-0">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand bg-brand-soft px-2 py-1 rounded-full mb-2.5">
              <IconSparkle className="w-3 h-3" />
              {SITE.name} Pro
            </div>
            <h2 id="upgrade-title" className="text-xl font-bold leading-tight">
              {isLogoExport
                ? `Unlock your custom logo and remove all watermarks with Pro (${PRICE.display} one-time).`
                : 'Put your brand on it'}
            </h2>
            <p className="text-sm text-muted mt-1">
              {isLogoExport
                ? 'The canvas already shows your logo. Pro puts it on the PDF — and takes the credit line off.'
                : `Unlocks ${reason} — and everything else below, once, forever.`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1.5 -m-1 rounded-md text-faint hover:text-ink"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <ul className="p-5 pt-4 flex flex-col gap-3">
          {BENEFITS.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <IconCheck className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold leading-snug">{title}</p>
                <p className="text-xs text-muted leading-snug mt-0.5">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="px-5 pb-5">
          {status === 'done' ? (
            <p
              className="text-sm font-semibold text-brand flex items-center gap-2"
              data-testid="activation-success"
            >
              <IconCheck className="w-4 h-4" />
              Activated. Your documents are unbranded from now on.
            </p>
          ) : (
            <>
              {isCheckoutConfigured() ? (
                <button
                  type="button"
                  className="btn btn-primary w-full py-2.5 text-sm"
                  onClick={buy}
                  disabled={buying}
                  data-testid="buy-button"
                >
                  {buying ? 'Opening checkout…' : `Unlock Pro — ${PRICE.display} once`}
                </button>
              ) : (
                <p className="text-xs text-muted border border-edge rounded-lg p-3">
                  Checkout is not connected yet. Set <code>CHECKOUT_URL</code> in{' '}
                  <code>src/config.ts</code> to your Lemon Squeezy product URL.
                </p>
              )}

              {isLogoExport && (
                <button
                  type="button"
                  className="btn btn-ghost w-full mt-2 text-sm"
                  data-testid="download-plain"
                  onClick={async () => {
                    const blob = await buildPdf({ doc, isPro: false });
                    downloadBlob(blob, suggestedFilename(doc));
                    close();
                  }}
                >
                  Download without logo or brand colour
                </button>
              )}

              <p className="text-[11px] text-faint text-center mt-2">
                One payment. No subscription, no account, no email required.
              </p>

              <div className="mt-4 pt-4 border-t border-edge">
                {!codeFieldOpen ? (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-ink underline underline-offset-2"
                    onClick={() => setCodeFieldOpen(true)}
                  >
                    Already bought it? Enter your code
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void activate(key);
                    }}
                  >
                    <label className="label" htmlFor="license-code">
                      The code from your email
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="license-code"
                        ref={codeInputRef}
                        className="field font-mono text-xs"
                        placeholder="Paste the whole line — we'll find the code"
                        value={key}
                        data-testid="license-input"
                        onChange={(e) => {
                          setKey(e.target.value);
                          if (status === 'error') setStatus('idle');
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary shrink-0"
                        disabled={status === 'checking'}
                        data-testid="activate-button"
                      >
                        {status === 'checking' ? 'Checking…' : 'Activate'}
                      </button>
                    </div>
                    {status === 'error' && (
                      <p className="text-xs text-red-500 mt-2" data-testid="activation-error">
                        {message}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
