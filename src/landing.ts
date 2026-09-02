/**
 * Landing-page interactivity. Kept off the critical first paint: the hero SVG
 * is already inlined, and this module only hydrates the sandbox and template
 * previewer after load.
 */
import { layoutDocument } from './pdf/layout';
import { pageToSvg } from './pdf/svg';
import { demoDocument, SHOWCASE_TEMPLATES } from './lib/demoDoc';
import type { LogoAlign, TemplateId } from './types';

function renderDoc(
  target: Element,
  over: Parameters<typeof demoDocument>[0],
  isPro: boolean,
): void {
  const doc = demoDocument(over);
  const { pages } = layoutDocument({ doc, isPro, preview: true });
  const svg = pageToSvg(pages[0]!);
  target.innerHTML = svg;
  const el = target.querySelector('svg');
  if (el) {
    el.classList.add('doc');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Live invoice preview generated in the browser');
  }
}

function bootSandbox(): void {
  const frame = document.querySelector('.doc-frame');
  if (!frame) return;

  const name = document.querySelector<HTMLInputElement>('#sandbox-name');
  const item = document.querySelector<HTMLInputElement>('#sandbox-item');
  const tax = document.querySelector<HTMLInputElement>('#sandbox-tax');
  if (!name || !item || !tax) return;

  const paint = () => {
    const taxRate = Number.parseFloat(tax.value) || 0;
    renderDoc(
      frame,
      {
        issuer: {
          name: name.value || 'Studio Meridian',
          contact: '',
          email: 'hello@studiomeridian.com',
          phone: '',
          address: '',
          taxId: '',
          bank: '',
        },
        items: [
          {
            id: 'a',
            qty: 1,
            description: item.value || 'Brand identity — logo, palette, type scale',
            unitPrice: 2400,
            taxRate,
          },
          { id: 'b', qty: 14, description: 'Packaging design (hours)', unitPrice: 95, taxRate },
          { id: 'c', qty: 1, description: 'Print-ready artwork', unitPrice: 350, taxRate },
        ],
      },
      true,
    );
  };

  name.addEventListener('input', paint);
  item.addEventListener('input', paint);
  tax.addEventListener('input', paint);
}

function bootShowcase(): void {
  const frame = document.querySelector('#template-preview');
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-template]');
  const logoBtn = document.querySelector<HTMLButtonElement>('#toggle-logo');
  if (!frame || !toggles.length) return;

  let template: TemplateId = 'modern';
  let align: LogoAlign = 'left';
  let showLogo = true;
  const logoSrc =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" rx="6" fill="#4F46E5"/><text x="16" y="26" fill="white" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700">MERIDIAN</text></svg>`,
    );

  const paint = () => {
    renderDoc(
      frame,
      {
        template,
        logo: showLogo ? logoSrc : null,
        logoAlign: align,
        logoAspect: 3,
        logoScale: 1,
      },
      true,
    );
  };

  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.template as TemplateId;
      if (!SHOWCASE_TEMPLATES.some((t) => t.id === id)) return;
      template = id;
      toggles.forEach((b) => {
        if (b === btn) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      paint();
    });
  });

  logoBtn?.addEventListener('click', () => {
    showLogo = !showLogo;
    logoBtn.setAttribute('aria-pressed', showLogo ? 'true' : 'false');
    logoBtn.textContent = showLogo ? 'Logo on' : 'Logo off';
    paint();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach((btn) => {
    btn.addEventListener('click', () => {
      align = (btn.dataset.align as LogoAlign) || 'left';
      document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach((b) => {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      paint();
    });
  });

  paint();
}

function bootSticky(): void {
  const hero = document.querySelector('.hero');
  const bar = document.querySelector('header');
  if (!hero || !bar || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      bar.classList.toggle('is-past-hero', Boolean(entry && !entry.isIntersecting));
    },
    { threshold: 0.15 },
  );
  io.observe(hero);
}

try {
  bootSandbox();
  bootSticky();
  bootShowcase();
} catch {
  /* Landing extras are progressive; a failure must not blank the static page. */
}
