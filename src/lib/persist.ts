import type { DocumentState, LineItem, Party, SignatureImage, Stroke } from '../types';
import { DOC_SCHEMA_VERSION, STORAGE_KEYS } from '../config';

const emptyParty = (): Party => ({ name: '', contact: '', email: '', phone: '', address: '' });

export const newItem = (): LineItem => ({
  id: crypto.randomUUID(),
  qty: 1,
  description: '',
  unitPrice: 0,
  taxRate: 0,
});

const today = (): string => new Date().toISOString().slice(0, 10);

const plusDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function defaultDocument(): DocumentState {
  return {
    version: DOC_SCHEMA_VERSION,
    kind: 'proposal',
    template: 'standard',
    currency: 'USD',
    reference: `${new Date().getFullYear()}-001`,
    issueDate: today(),
    dueDate: plusDays(30),
    issuer: emptyParty(),
    client: emptyParty(),
    items: [newItem()],
    notes: '',
    discount: 0,
    logo: null,
    signature: [],
    signatureImage: null,
    signatureName: '',
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

function coerceParty(v: unknown): Party {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    name: str(o.name),
    contact: str(o.contact),
    email: str(o.email),
    phone: str(o.phone),
    address: str(o.address),
  };
}

/**
 * An uploaded signature only survives if it is genuinely an image data URL and
 * carries a usable aspect ratio. A stored `javascript:` URL would otherwise be
 * handed straight to an <image href>, and a missing ratio would divide by zero
 * in the layout.
 */
function coerceSignatureImage(v: unknown): SignatureImage | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const src = typeof o.src === 'string' && o.src.startsWith('data:image/') ? o.src : null;
  const aspect = typeof o.aspect === 'number' && Number.isFinite(o.aspect) && o.aspect > 0
    ? o.aspect
    : null;
  return src && aspect ? { src, aspect } : null;
}

function coerceStrokes(v: unknown): Stroke[] {
  if (!Array.isArray(v)) return [];
  const out: Stroke[] = [];
  for (const stroke of v) {
    if (!Array.isArray(stroke)) continue;
    const pts: Array<readonly [number, number]> = [];
    for (const p of stroke) {
      if (Array.isArray(p) && p.length >= 2) {
        const x = num(p[0]);
        const y = num(p[1]);
        // Clamp: a stroke stored from a differently-sized canvas by an older
        // build must not draw outside its box on the page.
        pts.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
      }
    }
    if (pts.length > 1) out.push(pts);
  }
  return out;
}

/**
 * Migrates and repairs whatever is in storage into a valid DocumentState.
 *
 * Returns `changed: true` when the stored bytes did not already match the
 * result, so the caller can write the repaired document straight back.
 *
 * TRAP: if you migrate on load but do not persist the result, the repair runs
 * again on every single boot and what is on disk never matches what is on
 * screen. That stays invisible until the day a migration is not idempotent,
 * and then it corrupts quietly.
 */
export function migrateDocument(raw: unknown): { doc: DocumentState; changed: boolean } {
  const base = defaultDocument();
  if (raw === null || typeof raw !== 'object') return { doc: base, changed: true };

  const o = raw as Record<string, unknown>;

  const kind = o.kind === 'invoice' ? 'invoice' : 'proposal';
  const template =
    o.template === 'modern' || o.template === 'minimalist' || o.template === 'classic'
      ? o.template
      : 'standard';

  const items: LineItem[] = Array.isArray(o.items)
    ? o.items
        .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
        .map((it) => ({
          // v0 saves had no stable id; generate one rather than letting React
          // key rows by index, which reorders inputs mid-typing.
          id: str(it.id) || crypto.randomUUID(),
          qty: num(it.qty, 1),
          description: str(it.description),
          unitPrice: num(it.unitPrice),
          taxRate: num(it.taxRate),
        }))
    : base.items;

  const logo = typeof o.logo === 'string' && o.logo.startsWith('data:image/') ? o.logo : null;

  const doc: DocumentState = {
    version: DOC_SCHEMA_VERSION,
    kind,
    template,
    currency: str(o.currency, 'USD'),
    reference: str(o.reference, base.reference),
    issueDate: str(o.issueDate, base.issueDate),
    dueDate: str(o.dueDate, base.dueDate),
    issuer: coerceParty(o.issuer),
    client: coerceParty(o.client),
    items: items.length ? items : [newItem()],
    notes: str(o.notes),
    discount: Math.min(100, Math.max(0, num(o.discount))),
    logo,
    signature: coerceStrokes(o.signature),
    signatureImage: coerceSignatureImage(o.signatureImage),
    signatureName: str(o.signatureName),
  };

  const changed = JSON.stringify(raw) !== JSON.stringify(doc);
  return { doc, changed };
}

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.doc);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Invalid JSON, or storage disabled in a private window.
    return null;
  }
}

export function loadDocument(): DocumentState {
  const parsed = readStored();
  if (parsed === null) return defaultDocument();

  const { doc, changed } = migrateDocument(parsed);
  // Write the repaired document back immediately — see migrateDocument.
  if (changed) saveDocument(doc);
  return doc;
}

export function saveDocument(doc: DocumentState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.doc, JSON.stringify(doc));
  } catch {
    // Quota exceeded (usually a large logo) or storage disabled in a private
    // window. Losing autosave is survivable; crashing the editor is not.
  }
}

export function clearDocument(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.doc);
  } catch {
    /* storage disabled */
  }
}
