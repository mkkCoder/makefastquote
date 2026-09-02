import { describe, expect, it } from 'vitest';
import { measureText } from '../pdf/text';
import { needsUnicodeFont, patchCidOrdering, visualOrder } from '../pdf/unicodeFont';
import { layoutDocument, PAGE } from '../pdf/layout';
import { demoDocument } from '../lib/demoDoc';

describe('visualOrder', () => {
  it('leaves Latin alone', () => {
    expect(visualOrder('Studio Meridian')).toBe('Studio Meridian');
  });

  it('reverses a Hebrew word so LTR drawing reads correctly', () => {
    expect(visualOrder('שלום')).toBe('םולש');
  });

  it('reverses only the Hebrew run in mixed LTR text', () => {
    expect(visualOrder('Hello שלום')).toBe('Hello םולש');
  });

  it('keeps gershayim inside a Hebrew abbreviation', () => {
    expect(visualOrder('בע"מ')).toBe('מ"עב');
  });

  it('places the first Hebrew word on the right in an RTL paragraph', () => {
    expect(visualOrder('ההצעה תקפה', 'rtl')).toBe('הפקת העצהה');
  });
});

describe('Hebrew measurement', () => {
  it('gives a Hebrew word a real width, not the Latin fallback', () => {
    const he = measureText('שלום', 10);
    const en = measureText('Abcd', 10);
    expect(he).toBeGreaterThan(5);
    expect(he).toBeLessThan(15);
    expect(Math.abs(he - en)).toBeGreaterThan(0.01);
  });

  it('makes bold Hebrew wider than regular', () => {
    expect(measureText('שלום', 10, 'bold')).toBeGreaterThan(measureText('שלום', 10));
  });

  it('sends shekel amounts through the Unicode font, not Helvetica', () => {
    expect(needsUnicodeFont('₪324.00')).toBe(true);
    expect(measureText('₪324.00', 9)).toBeGreaterThan(8);
  });
});

describe('patchCidOrdering', () => {
  it('replaces Identity-H Ordering with Identity at the same byte length', () => {
    const src = new TextEncoder().encode('<< /Ordering (Identity-H) >> /Encoding /Identity-H');
    const out = patchCidOrdering(src);
    expect(out.byteLength).toBe(src.byteLength);
    const body = new TextDecoder().decode(out);
    expect(body).toContain('/Ordering (Identity)  ');
    expect(body).not.toContain('/Ordering (Identity-H)');
    expect(body).toContain('/Encoding /Identity-H');
  });
});

describe('layout emits visual Hebrew', () => {
  it('mirrors a Hebrew document to the right side of the page', () => {
    const doc = demoDocument({
      issuer: {
        name: 'שלום סטודיו',
        contact: '',
        email: '',
        phone: '',
        address: '',
        taxId: '',
        bank: '',
      },
    });
    const { pages } = layoutDocument({ doc, isPro: true });
    const name = pages[0]?.ops.find(
      (op) => op.t === 'text' && (op.text.includes('םולש') || op.text.includes('וידוטס')),
    );
    expect(name?.t).toBe('text');
    if (name?.t === 'text') {
      expect(name.x).toBeGreaterThan(PAGE.w / 2);
      expect(name.align).toBe('right');
    }
  });

  it('uses a Hebrew title on a Hebrew proposal', () => {
    const doc = demoDocument({
      kind: 'proposal',
      client: {
        name: 'אסף',
        contact: '',
        email: '',
        phone: '',
        address: '',
        taxId: '',
        bank: '',
      },
    });
    const { pages } = layoutDocument({ doc, isPro: true });
    const texts = pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.text));
    expect(texts.some((t) => t.includes('ריחמ תעצה') || t.includes('הצעת מחיר'))).toBe(true);
  });
});
