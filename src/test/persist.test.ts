import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateDocument, loadDocument, defaultDocument, saveDocument } from '../lib/persist';
import { STORAGE_KEYS } from '../config';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('migrateDocument', () => {
  it('produces a valid document from null', () => {
    const { doc, changed } = migrateDocument(null);
    expect(doc.items).toHaveLength(1);
    expect(changed).toBe(true);
  });

  it('produces a valid document from complete garbage', () => {
    const { doc } = migrateDocument({ items: 'not an array', issuer: 42, kind: 'nonsense' });
    expect(doc.kind).toBe('quote');
    expect(Array.isArray(doc.items)).toBe(true);
    expect(doc.issuer.name).toBe('');
  });

  it('gives id-less legacy rows a stable id', () => {
    // A v0 save had no ids. Without one React keys rows by index, and the
    // inputs reorder under the user's cursor when a row is removed.
    const { doc } = migrateDocument({
      items: [{ qty: 1, description: 'a', unitPrice: 5, taxRate: 0 }],
    });
    expect(doc.items[0]?.id).toBeTruthy();
    expect(doc.items[0]?.description).toBe('a');
  });

  it('clamps signature points that came from a differently sized canvas', () => {
    const { doc } = migrateDocument({
      signature: [
        [
          [-3, 0.5],
          [4, 2],
        ],
      ],
    });
    expect(doc.signature[0]).toEqual([
      [0, 0.5],
      [1, 1],
    ]);
  });

  it('drops a logo that is not an image data URL', () => {
    expect(migrateDocument({ logo: 'javascript:alert(1)' }).doc.logo).toBeNull();
    expect(migrateDocument({ logo: 'data:image/png;base64,AAA' }).doc.logo).toBe(
      'data:image/png;base64,AAA',
    );
  });

  it('reports changed=false for a document that is already current', () => {
    const doc = defaultDocument();
    const round = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(round.changed).toBe(false);
  });

  it('migrates sender tax id, bank details and brand colour', () => {
    const { doc } = migrateDocument({
      issuer: { name: 'A', taxId: 'GB123', bank: 'IBAN 1' },
      brandColor: '#2563eb',
      logoAlign: 'center',
      logoScale: 1.2,
    });
    expect(doc.issuer.taxId).toBe('GB123');
    expect(doc.issuer.bank).toBe('IBAN 1');
    expect(doc.brandColor).toBe('#2563eb');
    expect(doc.logoAlign).toBe('center');
    expect(doc.logoScale).toBe(1.2);
    expect(doc.status).toBe('draft');
    expect(doc.id).toBeTruthy();
  });

  it('drops a brand colour that is not a hex value', () => {
    expect(migrateDocument({ brandColor: 'red' }).doc.brandColor).toBeNull();
  });

  it('migrates legacy invoice kind and paid status onto the quote workflow', () => {
    const { doc } = migrateDocument({
      kind: 'invoice',
      status: 'paid',
      reference: '101',
    });
    expect(doc.kind).toBe('quote');
    expect(doc.status).toBe('accepted');
    expect(doc.revision).toBe(1);
  });

  it('maps unpaid and overdue onto sent and expired', () => {
    expect(migrateDocument({ status: 'unpaid' }).doc.status).toBe('sent');
    expect(migrateDocument({ status: 'overdue' }).doc.status).toBe('expired');
  });

  it('rejects an unknown template rather than rendering nothing', () => {
    expect(migrateDocument({ template: 'neon' }).doc.template).toBe('standard');
  });

  it('keeps a well-formed uploaded signature', () => {
    const img = { src: 'data:image/png;base64,AAAA', aspect: 3.5 };
    expect(migrateDocument({ signatureImage: img }).doc.signatureImage).toEqual(img);
  });

  it('drops an uploaded signature whose src is not an image data URL', () => {
    // It is handed straight to an <image href>; a javascript: URL must not
    // survive a round-trip through storage.
    expect(
      migrateDocument({ signatureImage: { src: 'javascript:alert(1)', aspect: 2 } }).doc
        .signatureImage,
    ).toBeNull();
  });

  it('drops an uploaded signature with an unusable aspect ratio', () => {
    // The layout divides by it.
    for (const aspect of [0, -1, 'wide', undefined, Number.NaN]) {
      expect(
        migrateDocument({ signatureImage: { src: 'data:image/png;base64,AA', aspect } }).doc
          .signatureImage,
      ).toBeNull();
    }
  });

  it('tolerates a signatureImage that is not an object at all', () => {
    for (const v of ['x', 42, [], null]) {
      expect(migrateDocument({ signatureImage: v }).doc.signatureImage).toBeNull();
    }
  });
});

describe('loadDocument', () => {
  it('writes the repaired document straight back to storage', () => {
    // TRAP: if a load-time repair is not persisted, it silently runs again on
    // every single boot and what is on disk never matches what is on screen.
    localStorage.setItem(
      STORAGE_KEYS.doc,
      JSON.stringify({ items: [{ qty: 2, description: 'legacy', unitPrice: 10 }] }),
    );

    const doc = loadDocument();
    expect(doc.items[0]?.id).toBeTruthy();

    const onDisk = JSON.parse(localStorage.getItem(STORAGE_KEYS.doc) ?? 'null');
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(doc)));

    // And the second load must be a no-op, i.e. the repair is idempotent.
    const before = localStorage.getItem(STORAGE_KEYS.doc);
    loadDocument();
    expect(localStorage.getItem(STORAGE_KEYS.doc)).toBe(before);
  });

  it('falls back to a fresh document when storage holds invalid JSON', () => {
    localStorage.setItem(STORAGE_KEYS.doc, '{not json');
    expect(loadDocument().items).toHaveLength(1);
  });
});

describe('saveDocument', () => {
  it('does not throw when the quota is exceeded', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    // Losing autosave is survivable; taking the editor down with it is not.
    expect(() => saveDocument(defaultDocument())).not.toThrow();
  });
});
