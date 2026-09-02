import { describe, expect, it } from 'vitest';
import { measureText } from '../pdf/text';
import { patchCidOrdering, visualOrder } from '../pdf/unicodeFont';
import { layoutDocument } from '../pdf/layout';
import { demoDocument } from '../lib/demoDoc';

describe('visualOrder', () => {
  it('leaves Latin alone', () => {
    expect(visualOrder('Studio Meridian')).toBe('Studio Meridian');
  });

  it('reverses a Hebrew word so LTR drawing reads correctly', () => {
    expect(visualOrder('שלום')).toBe('םולש');
  });

  it('reverses only the Hebrew run in mixed text', () => {
    expect(visualOrder('Hello שלום')).toBe('Hello םולש');
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
  it('puts reversed Hebrew in the drawing ops', () => {
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
    const texts = pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.text));
    expect(texts.some((t) => t.includes('םולש'))).toBe(true);
    expect(texts.some((t) => t.includes('שלום'))).toBe(false);
  });
});
