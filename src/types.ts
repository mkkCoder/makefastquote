export type DocKind = 'quote' | 'estimate' | 'proposal' | 'proforma';

export type TemplateId = 'standard' | 'modern' | 'minimalist' | 'classic';

/** Pre-sale proposal states. Legacy `paid` migrates to `accepted`. */
export type DocStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';

export type LogoAlign = 'left' | 'center' | 'right';

export interface Party {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  bank: string;
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

/**
 * A signature supplied as an image rather than drawn.
 *
 * `aspect` (width / height) is stored alongside the data URL because the
 * layout engine is synchronous and pure — it lays the document out without a
 * DOM, so it cannot decode the image to ask how wide it is. Keeping the ratio
 * next to the pixels is what lets the signature be fitted into its box
 * identically in the preview and in the PDF.
 */
export interface SignatureImage {
  /** PNG data URL, background removed and cropped to the ink. */
  src: string;
  /** width / height of `src`. */
  aspect: number;
}

export interface DocumentState {
  version: number;
  id: string;
  kind: DocKind;
  template: TemplateId;
  currency: string;
  reference: string;
  /** Starts at 1. Displayed as `{reference}-v2` when greater than 1. */
  revision: number;
  issueDate: string;
  dueDate: string;
  status: DocStatus;
  issuer: Party;
  client: Party;
  items: LineItem[];
  notes: string;
  discount: number;
  /**
   * Data URL of an uploaded logo. Free users can preview it; the PDF only
   * includes it when `isPro` is true. See lib/license.ts.
   */
  logo: string | null;
  logoScale: number;
  logoAlign: LogoAlign;
  logoAspect: number | null;
  /** Pro brand accent on the document. Preview-only for free users. */
  brandColor: string | null;
  /** When true, a Pro document still prints the free-tier credit line. */
  showCredit: boolean;
  /** Drawn strokes. Ignored when `signatureImage` is set. */
  signature: Stroke[];
  /** An uploaded signature. Takes precedence over `signature` when present. */
  signatureImage: SignatureImage | null;
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
