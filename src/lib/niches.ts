import nichesData from '../data/niches.json' with { type: 'json' };
import type { DocKind, DocumentState, LineItem } from '../types';

export interface NichePrefillItem {
  description: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
}

export interface NicheFaq {
  question: string;
  answer: string;
}

export interface Niche {
  title: string;
  slug: string;
  industry: string;
  kind: DocKind;
  description: string;
  prefilledItems: NichePrefillItem[];
  faq: NicheFaq[];
}

export const NICHES: readonly Niche[] = nichesData as Niche[];

export function getNiche(slug: string | null | undefined): Niche | undefined {
  if (!slug) return undefined;
  return NICHES.find((n) => n.slug === slug);
}

export function nicheItems(niche: Niche): LineItem[] {
  return niche.prefilledItems.map((item, i) => ({
    id: `niche-${niche.slug}-${i}`,
    description: item.description,
    qty: item.qty,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
  }));
}

/** Document overrides used by niche landing previews. */
export function nicheDemoPatch(niche: Niche): Partial<DocumentState> {
  return {
    kind: niche.kind,
    template: 'modern',
    items: nicheItems(niche),
    notes: `Payment due within 30 days. Prepared for ${niche.industry.toLowerCase()} work.`,
    client: {
      name: 'Acme Client Co.',
      contact: 'Alex Morgan',
      email: 'alex@acmeclient.example',
      phone: '',
      address: '',
      taxId: '',
      bank: '',
    },
    issuer: {
      name: `${niche.industry} Studio`,
      contact: '',
      email: 'hello@studio.example',
      phone: '',
      address: '',
      taxId: '',
      bank: '',
    },
  };
}

/**
 * Applies niche starter data onto an existing document while keeping the
 * visitor's saved issuer profile fields when present.
 */
export function applyNicheToDocument(doc: DocumentState, niche: Niche): DocumentState {
  const issuerName = doc.issuer.name.trim() || `${niche.industry} Studio`;
  return {
    ...doc,
    kind: niche.kind,
    items: nicheItems(niche).map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    })),
    notes: doc.notes.trim()
      ? doc.notes
      : `Payment due within 30 days. Prepared for ${niche.industry.toLowerCase()} work.`,
    issuer: {
      ...doc.issuer,
      name: issuerName,
    },
  };
}

export function nicheEditorHref(slug: string, fromNichePage = true): string {
  const base = fromNichePage ? '../app/' : './app/';
  return `${base}?niche=${encodeURIComponent(slug)}`;
}

/** Meta description capped for SERP display. */
export function nicheMetaDescription(niche: Niche, max = 155): string {
  const raw = niche.description.trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 80 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** Title tag under ~60 characters when possible. */
export function nichePageTitle(niche: Niche): string {
  const suffix = ' | MakeFastQuote';
  const max = 60;
  if (niche.title.length + suffix.length <= max) return `${niche.title}${suffix}`;
  if (niche.title.length <= max) return niche.title;
  return `${niche.title.slice(0, max - 1).trimEnd()}…`;
}
