import type { DocumentState, DocKind, DocStatus } from '../types';
import { STORAGE_KEYS } from '../config';
import { computeTotals } from './money';
import { migrateDocument } from './persist';

export interface ArchiveEntry {
  id: string;
  savedAt: number;
  kind: DocKind;
  client: string;
  reference: string;
  total: number;
  currency: string;
  status: DocStatus;
  doc: DocumentState;
}

const CAP = 30;

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.archive);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(entries: ArchiveEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(entries));
  } catch {
    /* quota or private mode */
  }
}

function coerceEntry(v: unknown): ArchiveEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const { doc } = migrateDocument(o.doc ?? o);
  const totals = computeTotals(doc.items, doc.discount);
  return {
    id: typeof o.id === 'string' && o.id ? o.id : doc.id,
    savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
    kind: doc.kind,
    client: doc.client.name,
    reference: doc.reference,
    total: totals.total,
    currency: doc.currency,
    status: doc.status,
    doc,
  };
}

export function loadArchive(): ArchiveEntry[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  return raw.map(coerceEntry).filter((e): e is ArchiveEntry => e !== null);
}

export function upsertArchive(doc: DocumentState): ArchiveEntry[] {
  const entry: ArchiveEntry = {
    id: doc.id,
    savedAt: Date.now(),
    kind: doc.kind,
    client: doc.client.name,
    reference: doc.reference,
    total: computeTotals(doc.items, doc.discount).total,
    currency: doc.currency,
    status: doc.status,
    doc,
  };
  const rest = loadArchive().filter((e) => e.id !== doc.id);
  const next = [entry, ...rest].slice(0, CAP);
  write(next);
  return next;
}

export function removeArchive(id: string): ArchiveEntry[] {
  const next = loadArchive().filter((e) => e.id !== id);
  write(next);
  return next;
}

export function archiveToJson(entries: ArchiveEntry[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      documents: entries.map((e) => ({
        ...e.doc,
        signature: undefined,
        signatureImage: undefined,
      })),
    },
    null,
    2,
  );
}
