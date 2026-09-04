import { useApp } from '../store';
import { TEMPLATES, TEMPLATE_ORDER } from '../pdf/templates';
import { PRICE } from '../config';
import { DOC_KINDS, KIND_LABEL } from '../lib/quote';
import { IconCheck, IconFile, IconLock, IconReceipt, IconSparkle } from './Icons';
import type { DocKind } from '../types';

/**
 * The sidebar is deliberately split in two.
 *
 * On a phone the three columns stack, and if the whole sidebar stayed together
 * the first thing a visitor sees is a template picker with three locked rows
 * and an "Unlock Pro — $29" card, before they have typed a single character.
 * That asks for money before delivering anything, which is the one thing this
 * paywall is designed not to do. So only the document-type tabs stay on top;
 * templates and the Pro card move below the form, where someone has already
 * built a document and can see what branding it would apply to.
 *
 * On desktop both halves sit in the left column and the order is unchanged.
 */
const KIND_ICON: Record<DocKind, typeof IconFile> = {
  quote: IconReceipt,
  estimate: IconReceipt,
  proposal: IconFile,
  proforma: IconFile,
};

export function SidebarTop() {
  const doc = useApp((s) => s.doc);
  const setKind = useApp((s) => s.setKind);

  return (
    <aside className="flex flex-col gap-4">
      <nav aria-label="Document type">
        <span className="label">Document</span>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
          {DOC_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setKind(kind)}
                aria-current={doc.kind === kind ? 'true' : undefined}
                data-testid={`kind-${kind}`}
                className={[
                  'btn justify-start',
                  doc.kind === kind ? 'btn-primary' : 'btn-ghost',
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                {KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

export function SidebarRest() {
  const doc = useApp((s) => s.doc);
  const isPro = useApp((s) => s.isPro);
  const setTemplate = useApp((s) => s.setTemplate);
  const openUpgrade = useApp((s) => s.openUpgrade);
  const deactivate = useApp((s) => s.deactivate);
  const resetDoc = useApp((s) => s.resetDoc);

  return (
    <aside className="flex flex-col gap-4">
      <div>
        <span className="label">Template</span>
        <div className="flex flex-col gap-1.5">
          {/* Pro templates are listed first on purpose — the paid deliverable
              should be seen before the paywall is. */}
          {TEMPLATE_ORDER.map((id) => {
            const tpl = TEMPLATES[id];
            const locked = tpl.pro && !isPro;
            const active = doc.template === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTemplate(id)}
                data-testid={`template-${id}`}
                aria-current={active ? 'true' : undefined}
                className={[
                  'text-left px-3 py-2 rounded-lg border transition-colors',
                  active ? 'border-brand bg-brand-soft' : 'border-edge-strong hover:border-brand',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="w-3 h-4 rounded-[2px] border border-edge shrink-0"
                    style={{ background: tpl.accent }}
                  />
                  <span className="text-sm font-semibold">{tpl.label}</span>
                  {locked && <IconLock className="w-3 h-3 text-brand ml-auto" />}
                  {active && !locked && <IconCheck className="w-3.5 h-3.5 text-brand ml-auto" />}
                </span>
                <span className="block text-xs text-faint mt-0.5 leading-snug">{tpl.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isPro ? (
        <div className="rounded-xl border border-edge p-3.5 bg-brand-soft">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <IconSparkle className="w-3.5 h-3.5 text-brand" />
            Pro is active
          </p>
          <p className="text-xs text-muted mt-1 leading-snug">
            Your logo, all templates, no marketing credit. The quotation disclaimer always prints.
          </p>
          <button
            type="button"
            onClick={deactivate}
            className="text-xs text-faint hover:text-ink underline underline-offset-2 mt-2"
          >
            Deactivate on this device
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-edge p-3.5">
          <p className="text-sm font-bold leading-snug">Put your brand on it</p>
          <p className="text-xs text-muted mt-1 leading-snug">
            Your logo, three studio templates, and a document with nothing on it but you.
          </p>
          <button
            type="button"
            className="btn btn-primary w-full mt-3"
            onClick={() => openUpgrade('everything below')}
            data-testid="upgrade-cta"
          >
            <IconSparkle className="w-3.5 h-3.5" />
            Unlock Pro — {PRICE.display}
          </button>
          <p className="text-[11px] text-faint text-center mt-1.5">One payment, not a subscription.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (confirm('Start a new quote? This clears the current one.')) resetDoc();
        }}
        className="text-xs text-faint hover:text-ink underline underline-offset-2 text-left"
      >
        Start a new quote
      </button>
    </aside>
  );
}
