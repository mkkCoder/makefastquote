import type { DocKind, DocumentState } from '../types';

/**
 * Canonical quote document shape. `DocumentState` is the persisted model;
 * this alias is the name used in new code (there is no server InvoiceSchema).
 */
export type QuoteSchema = DocumentState;
export type QuoteId = DocumentState['id'];

export const LEGAL_DISCLAIMER =
  'This document is a commercial price estimate/quotation and does not constitute a legal tax invoice, fiscal receipt, or accounting document.';

export const NOTES_TEMPLATE =
  'Official tax invoices will be issued separately upon payment or project completion.';

export const DOC_KINDS: readonly DocKind[] = ['quote', 'estimate', 'proposal', 'proforma'];

export const KIND_LABEL: Record<DocKind, string> = {
  quote: 'Quote',
  estimate: 'Price Estimate',
  proposal: 'Proposal',
  proforma: 'Proforma',
};

export function kindLabel(kind: DocKind): string {
  return KIND_LABEL[kind];
}

export function isQuoteKind(v: unknown): v is DocKind {
  return v === 'quote' || v === 'estimate' || v === 'proposal' || v === 'proforma';
}

/** Maps legacy `invoice` (and similar) onto the quote workflow. */
export function coerceKind(v: unknown): DocKind {
  if (v === 'invoice' || v === 'bid') return 'quote';
  if (isQuoteKind(v)) return v;
  return 'quote';
}

/**
 * Printed reference: `2026-001` for the first revision, `2026-001-v2` after.
 */
export function displayReference(doc: Pick<DocumentState, 'reference' | 'revision'>): string {
  const base = (doc.reference || '').trim() || '—';
  const rev = Number.isFinite(doc.revision) && doc.revision > 1 ? Math.floor(doc.revision) : 1;
  return rev > 1 ? `${base}-v${rev}` : base;
}
