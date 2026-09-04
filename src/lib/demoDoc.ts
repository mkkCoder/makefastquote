import type { DocumentState, TemplateId } from '../types';

export function demoDocument(over: Partial<DocumentState> = {}): DocumentState {
  return {
    version: 3,
    id: 'demo',
    kind: 'quote',
    template: 'modern',
    currency: 'USD',
    reference: '2026-014',
    revision: 1,
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    status: 'draft',
    issuer: {
      name: 'Studio Meridian',
      contact: '',
      email: 'hello@studiomeridian.com',
      phone: '',
      address: '',
      taxId: '',
      bank: '',
    },
    client: {
      name: 'Northwind Coffee Co.',
      contact: 'Dana Alvarez',
      email: 'dana@northwind.coffee',
      phone: '',
      address: '',
      taxId: '',
      bank: '',
    },
    items: [
      {
        id: 'a',
        qty: 1,
        description: 'Brand identity — logo, palette, type scale',
        unitPrice: 2400,
        taxRate: 0,
      },
      { id: 'b', qty: 14, description: 'Packaging design (hours)', unitPrice: 95, taxRate: 0 },
      { id: 'c', qty: 1, description: 'Print-ready artwork', unitPrice: 350, taxRate: 0 },
    ],
    notes: 'Official tax invoices will be issued separately upon payment or project completion.',
    discount: 0,
    logo: null,
    logoScale: 1,
    logoAlign: 'left',
    logoAspect: null,
    brandColor: null,
    showCredit: false,
    signature: [],
    signatureImage: null,
    signatureName: 'Ana Reyes',
    ...over,
  };
}

export const SHOWCASE_TEMPLATES: Array<{ id: TemplateId; label: string }> = [
  { id: 'standard', label: 'Default' },
  { id: 'minimalist', label: 'Minimal' },
  { id: 'modern', label: 'Studio Modern' },
];
