import {
  NICHES,
  applyNicheToDocument,
  getNiche,
  nicheEditorHref,
  nicheMetaDescription,
  nichePageTitle,
  nicheItems,
} from '../lib/niches';
import { defaultDocument } from '../lib/persist';

describe('niches data', () => {
  it('has exactly 15 unique slugs', () => {
    expect(NICHES).toHaveLength(15);
    const slugs = NICHES.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(15);
  });

  it('keeps titles and meta descriptions in SERP-friendly bounds', () => {
    for (const niche of NICHES) {
      expect(nichePageTitle(niche).length).toBeLessThanOrEqual(60);
      expect(nicheMetaDescription(niche).length).toBeLessThanOrEqual(155);
      expect(niche.faq.length).toBeGreaterThanOrEqual(2);
      expect(niche.prefilledItems.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('builds editor links with niche query params', () => {
    expect(nicheEditorHref('photography-invoice')).toBe('../app/?niche=photography-invoice');
    expect(nicheEditorHref('photography-invoice', false)).toBe('./app/?niche=photography-invoice');
  });

  it('applies niche line items onto a document', () => {
    const niche = getNiche('plumbing-invoice');
    expect(niche).toBeDefined();
    const doc = applyNicheToDocument(defaultDocument(), niche!);
    expect(doc.kind).toBe('invoice');
    expect(doc.items.map((i) => i.description)).toEqual(
      nicheItems(niche!).map((i) => i.description),
    );
  });
});
