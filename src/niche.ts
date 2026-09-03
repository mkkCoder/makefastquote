/**
 * Niche landing interactivity: live document preview from niches.json data
 * embedded on the page. Progressive — a failure must not blank static SEO HTML.
 */
import { layoutDocument } from './pdf/layout';
import { pageToSvg } from './pdf/svg';
import { demoDocument } from './lib/demoDoc';
import { getNiche, nicheDemoPatch, type Niche } from './lib/niches';

function readNiche(): Niche | undefined {
  const el = document.querySelector<HTMLElement>('[data-niche-slug]');
  return getNiche(el?.dataset.nicheSlug);
}

function renderPreview(target: Element, niche: Niche, itemOverride?: string): void {
  const patch = nicheDemoPatch(niche);
  const items = patch.items ?? [];
  if (itemOverride && items[0]) {
    patch.items = items.map((it, i) =>
      i === 0 ? { ...it, description: itemOverride } : it,
    );
  }
  const doc = demoDocument(patch);
  const { pages } = layoutDocument({ doc, isPro: true, preview: true });
  const svg = pageToSvg(pages[0]!);
  target.innerHTML = svg;
  const el = target.querySelector('svg');
  if (el) {
    el.classList.add('doc');
    el.setAttribute('role', 'img');
    el.setAttribute(
      'aria-label',
      `Live ${niche.industry.toLowerCase()} ${doc.kind} preview generated in the browser`,
    );
  }
}

function boot(): void {
  const niche = readNiche();
  const frame = document.querySelector('.doc-frame');
  if (!niche || !frame) return;

  const itemInput = document.querySelector<HTMLInputElement>('#niche-item');
  const paint = () => renderPreview(frame, niche, itemInput?.value);
  itemInput?.addEventListener('input', paint);
  paint();
}

try {
  boot();
} catch {
  /* Niche extras are progressive. */
}
