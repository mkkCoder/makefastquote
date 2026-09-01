export type DocKind = 'proposal' | 'invoice';

export type TemplateId = 'standard' | 'modern' | 'minimalist' | 'classic';

export interface Party {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
}

export interface LineItem {
  id: string;
  qty: number;
  description: string;
  unitPrice: number;
  taxRate: number;
}

/** A signature stroke: a run of points in normalised 0..1 canvas coordinates. */
export type Stroke = ReadonlyArray<readonly [number, number]>;

export interface DocumentState {
  version: number;
  kind: DocKind;
  template: TemplateId;
  currency: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  issuer: Party;
  client: Party;
  items: LineItem[];
  notes: string;
  discount: number;
  /** Data URL of an uploaded logo. Pro only — see lib/license.ts. */
  logo: string | null;
  signature: Stroke[];
  signatureName: string;
}

export interface LicenseState {
  key: string | null;
  /** True only after the vendor said so at least once. */
  valid: boolean;
  /** ms epoch of the last successful vendor round-trip. */
  lastCheck: number;
  instanceName?: string;
}
