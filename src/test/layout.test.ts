import { describe, expect, it } from 'vitest';
import { layoutDocument, PAGE, MARGIN } from '../pdf/layout';
import { defaultDocument, newItem } from '../lib/persist';
import { measureText } from '../pdf/text';
import { SITE } from '../config';
import type { Op } from '../pdf/layout';
import type { DocumentState } from '../types';

const doc = (over: Partial<DocumentState> = {}): DocumentState => ({
  ...defaultDocument(),
  issuer: { name: 'Jane Doe Design', contact: '', email: 'j@d.com', phone: '', address: '', taxId: '', bank: '' },
  client: { name: 'Acme Ltd', contact: 'Sam', email: 's@a.com', phone: '', address: '', taxId: '', bank: '' },
  items: [{ ...newItem(), qty: 2, description: 'Design work', unitPrice: 500, taxRate: 20 }],
  ...over,
});

const allOps = (pages: { ops: Op[] }[]): Op[] => pages.flatMap((p) => p.ops);
const texts = (ops: Op[]): string[] =>
  ops.filter((o): o is Extract<Op, { t: 'text' }> => o.t === 'text').map((o) => o.text);

describe('layoutDocument', () => {
  it('draws a proposal titled PROPOSAL and a quote titled QUOTE', () => {
    expect(texts(allOps(layoutDocument({ doc: doc({ kind: 'proposal' }), isPro: false }).pages))).toContain(
      'PROPOSAL',
    );
    expect(
      texts(allOps(layoutDocument({ doc: doc({ kind: 'quote' }), isPro: false }).pages)),
    ).toContain('QUOTE');
  });

  it('puts the document title on the left and the issuer on the right', () => {
    const ops = allOps(layoutDocument({ doc: doc(), isPro: false }).pages);
    const title = ops.find((o): o is Extract<Op, { t: 'text' }> => o.t === 'text' && o.text === 'QUOTE');
    const issuer = ops.find(
      (o): o is Extract<Op, { t: 'text' }> => o.t === 'text' && o.text === 'Jane Doe Design',
    );
    expect(title).toBeDefined();
    expect(issuer).toBeDefined();
    expect(title!.x).toBe(MARGIN.left);
    expect(title!.align).toBe('left');
    expect(issuer!.x).toBe(PAGE.w - MARGIN.right);
    expect(issuer!.align).toBe('right');
  });

  it('keeps every drawn element inside the page', () => {
    const { pages } = layoutDocument({ doc: doc(), isPro: false });
    for (const op of allOps(pages)) {
      if (op.t === 'text') {
        expect(op.y).toBeGreaterThan(0);
        expect(op.y).toBeLessThanOrEqual(PAGE.h);
        expect(op.x).toBeGreaterThanOrEqual(0);
        expect(op.x).toBeLessThanOrEqual(PAGE.w);
      }
    }
  });

  it('never lets a text run overflow the right margin', () => {
    // The failure this catches is the one you only see in the PDF: a long
    // value silently printed off the edge of the paper.
    const long = 'Wolfeschlegelsteinhausenbergerdorff Consulting International Limited';
    const { pages } = layoutDocument({
      doc: doc({
        issuer: { name: long, contact: '', email: `${long}@example.com`, phone: '', address: '', taxId: '', bank: '' },
        client: { name: long, contact: long, email: '', phone: '', address: long, taxId: '', bank: '' },
        items: [{ ...newItem(), qty: 1, description: long.repeat(3), unitPrice: 1234567.89 }],
      }),
      isPro: false,
    });

    for (const op of allOps(pages)) {
      if (op.t !== 'text') continue;
      const w = measureText(op.text, op.size, op.weight);
      const left = op.align === 'right' ? op.x - w : op.align === 'center' ? op.x - w / 2 : op.x;
      const right = left + w;
      expect(left).toBeGreaterThanOrEqual(-0.5);
      expect(right).toBeLessThanOrEqual(PAGE.w + 0.5);
    }
  });

  it('paginates a long document and repeats the table head', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      ...newItem(),
      qty: 1,
      description: `Line item number ${i + 1} with a reasonably long description`,
      unitPrice: 100,
      taxRate: 20,
    }));
    const { pages } = layoutDocument({ doc: doc({ items }), isPro: false });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(texts(page.ops)).toContain('Description');
    }
  });

  it('numbers pages only when there is more than one', () => {
    const single = layoutDocument({ doc: doc(), isPro: false });
    expect(texts(allOps(single.pages)).some((t) => t.startsWith('Page '))).toBe(false);

    const items = Array.from({ length: 60 }, () => ({
      ...newItem(),
      qty: 1,
      description: 'x'.repeat(60),
      unitPrice: 10,
    }));
    const many = layoutDocument({ doc: doc({ items }), isPro: false });
    expect(texts(allOps(many.pages)).filter((t) => t.startsWith('Page '))).toHaveLength(
      many.pages.length,
    );
  });
});

describe('the free-tier gate is inside the generating code', () => {
  const credit = `Made with ${SITE.domain}`;

  it('stamps the credit line on every page for a free user', () => {
    const items = Array.from({ length: 60 }, () => ({
      ...newItem(),
      qty: 1,
      description: 'x'.repeat(60),
      unitPrice: 10,
    }));
    const { pages } = layoutDocument({ doc: doc({ items }), isPro: false });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(texts(page.ops)).toContain(credit);
  });

  it('omits it entirely for a Pro user — not hidden, absent', () => {
    const { pages } = layoutDocument({ doc: doc(), isPro: true });
    expect(texts(allOps(pages))).not.toContain(credit);
  });

  it('sizes the credit line to fit, so a longer domain cannot overrun', () => {
    const { pages } = layoutDocument({ doc: doc(), isPro: false });
    const op = allOps(pages).find(
      (o): o is Extract<Op, { t: 'text' }> => o.t === 'text' && o.text === credit,
    );
    expect(op).toBeDefined();
    expect(measureText(op!.text, op!.size)).toBeLessThanOrEqual(60);
    expect(op!.y).toBeLessThanOrEqual(PAGE.h - 1);
  });

  it('draws a logo for a Pro user and never for a free one', () => {
    const withLogo = doc({ logo: 'data:image/png;base64,AAAA', logoAspect: 2 });
    const pro = allOps(layoutDocument({ doc: withLogo, isPro: true }).pages);
    const free = allOps(layoutDocument({ doc: withLogo, isPro: false }).pages);
    expect(pro.some((o) => o.t === 'image')).toBe(true);
    // Even with a logo present in state, the free document does not draw it.
    expect(free.some((o) => o.t === 'image')).toBe(false);
  });

  it('lets a free user preview a logo without putting it in the export layout', () => {
    const withLogo = doc({ logo: 'data:image/png;base64,AAAA', logoAspect: 2 });
    const preview = allOps(layoutDocument({ doc: withLogo, isPro: false, preview: true }).pages);
    expect(preview.some((o) => o.t === 'image')).toBe(true);
  });

  it('applies a Pro brand colour to rules and totals', () => {
    const { pages } = layoutDocument({
      doc: doc({ brandColor: '#2563eb' }),
      isPro: true,
    });
    const lines = allOps(pages).filter((o): o is Extract<Op, { t: 'line' }> => o.t === 'line');
    expect(lines.some((l) => l.color === '#2563eb')).toBe(true);
  });

  it('prints the credit line on a Pro document only when showCredit is on', () => {
    const on = layoutDocument({ doc: doc({ showCredit: true }), isPro: true });
    const off = layoutDocument({ doc: doc({ showCredit: false }), isPro: true });
    expect(texts(allOps(on.pages))).toContain(credit);
    expect(texts(allOps(off.pages))).not.toContain(credit);
  });
});

describe('legal quotation disclaimer', () => {
  const needle = 'does not constitute a legal tax invoice';

  it('prints on every page for free and Pro documents', () => {
    const items = Array.from({ length: 60 }, () => ({
      ...newItem(),
      qty: 1,
      description: 'x'.repeat(60),
      unitPrice: 10,
    }));
    for (const isPro of [false, true]) {
      const { pages } = layoutDocument({
        doc: doc({ items, showCredit: false }),
        isPro,
      });
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        expect(texts(page.ops).join(' ')).toContain(needle);
      }
    }
  });

  it('keeps disclaimer lines inside the page and below the content band', () => {
    const { pages } = layoutDocument({ doc: doc(), isPro: true });
    const disc = allOps(pages).filter(
      (o): o is Extract<Op, { t: 'text' }> =>
        o.t === 'text' && (o.text.includes('commercial price estimate') || o.text.includes(needle)),
    );
    expect(disc.length).toBeGreaterThan(0);
    for (const op of disc) {
      expect(op.size).toBeLessThanOrEqual(7);
      expect(op.y).toBeLessThanOrEqual(PAGE.h);
      expect(op.y).toBeGreaterThan(PAGE.h - MARGIN.bottom - 16);
      const w = measureText(op.text, op.size, op.weight);
      expect(op.x + w).toBeLessThanOrEqual(PAGE.w - MARGIN.right + 0.5);
    }
  });

  it('shows revision suffix on the printed reference', () => {
    const t = texts(
      allOps(layoutDocument({ doc: doc({ reference: '101', revision: 2 }), isPro: true }).pages),
    );
    expect(t).toContain('101-v2');
  });
});

describe('signature', () => {
  it('maps normalised strokes into the signature box on the page', () => {
    const { pages } = layoutDocument({
      doc: doc({
        signature: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
      isPro: false,
    });
    const path = allOps(pages).find((o): o is Extract<Op, { t: 'path' }> => o.t === 'path');
    expect(path).toBeDefined();
    for (const [x, y] of path!.pts) {
      expect(x).toBeGreaterThanOrEqual(MARGIN.left);
      expect(x).toBeLessThanOrEqual(PAGE.w - MARGIN.right);
      expect(y).toBeLessThanOrEqual(PAGE.h - MARGIN.bottom);
    }
  });

  it('ignores a degenerate one-point stroke', () => {
    const { pages } = layoutDocument({ doc: doc({ signature: [[[0.5, 0.5]]] }), isPro: false });
    expect(allOps(pages).some((o) => o.t === 'path')).toBe(false);
  });
});

describe('an uploaded signature', () => {
  const img = { src: 'data:image/png;base64,AAAA', aspect: 4 };

  it('is drawn as an image inside the signature box', () => {
    const { pages } = layoutDocument({ doc: doc({ signatureImage: img }), isPro: false });
    const ops = allOps(pages).filter(
      (o): o is Extract<Op, { t: 'image' }> => o.t === 'image',
    );
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.x).toBeGreaterThanOrEqual(PAGE.w - MARGIN.right - 62 - 0.01);
    expect(op.x + op.w).toBeLessThanOrEqual(PAGE.w - MARGIN.right + 0.01);
    expect(op.y + op.h).toBeLessThanOrEqual(PAGE.h - MARGIN.bottom);
  });

  it('is fitted to its aspect ratio rather than stretched', () => {
    for (const aspect of [0.4, 1, 4, 12]) {
      const { pages } = layoutDocument({
        doc: doc({ signatureImage: { ...img, aspect } }),
        isPro: false,
      });
      const op = allOps(pages).find(
        (o): o is Extract<Op, { t: 'image' }> => o.t === 'image',
      )!;
      // Fitted here, not by the renderers: SVG's preserveAspectRatio and
      // jsPDF's addImage letterbox differently, so leaving it to them makes
      // the preview and the PDF disagree.
      expect(op.w / op.h).toBeCloseTo(aspect, 5);
      expect(op.w).toBeLessThanOrEqual(62 + 0.01);
    }
  });

  it('takes precedence over drawn strokes, and only one is drawn', () => {
    const { pages } = layoutDocument({
      doc: doc({
        signatureImage: img,
        signature: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
      isPro: false,
    });
    const ops = allOps(pages);
    expect(ops.some((o) => o.t === 'image')).toBe(true);
    expect(ops.some((o) => o.t === 'path')).toBe(false);
  });

  it('never divides by zero on a corrupt aspect ratio', () => {
    for (const aspect of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { pages } = layoutDocument({
        doc: doc({ signatureImage: { ...img, aspect } }),
        isPro: false,
      });
      const op = allOps(pages).find(
        (o): o is Extract<Op, { t: 'image' }> => o.t === 'image',
      )!;
      expect(Number.isFinite(op.w)).toBe(true);
      expect(Number.isFinite(op.h)).toBe(true);
      expect(op.w).toBeGreaterThan(0);
      expect(op.h).toBeGreaterThan(0);
    }
  });
});

describe('templates', () => {
  it('produces a complete document for every template', () => {
    for (const template of ['standard', 'modern', 'minimalist', 'classic'] as const) {
      const { pages } = layoutDocument({ doc: doc({ template }), isPro: true });
      const t = texts(allOps(pages));
      expect(t).toContain('QUOTE');
      expect(t).toContain('Acme Ltd');
      expect(t.some((s) => s.includes('1,000.00'))).toBe(true);
    }
  });
});
