import type { Party } from '../types';
import { STORAGE_KEYS } from '../config';
import type { DocumentState, LogoAlign } from '../types';

export interface BusinessProfile {
  issuer: Party;
  notes: string;
  currency: string;
  logo: string | null;
  logoScale: number;
  logoAlign: LogoAlign;
  logoAspect: number | null;
  brandColor: string | null;
  signatureName: string;
}

export function profileFromDoc(doc: DocumentState): BusinessProfile {
  return {
    issuer: { ...doc.issuer },
    notes: doc.notes,
    currency: doc.currency,
    logo: doc.logo,
    logoScale: doc.logoScale,
    logoAlign: doc.logoAlign,
    logoAspect: doc.logoAspect,
    brandColor: doc.brandColor,
    signatureName: doc.signatureName,
  };
}

export function applyProfile<T extends DocumentState>(doc: T, profile: BusinessProfile): T {
  return {
    ...doc,
    issuer: { ...profile.issuer },
    notes: profile.notes,
    currency: profile.currency,
    logo: profile.logo,
    logoScale: profile.logoScale,
    logoAlign: profile.logoAlign,
    logoAspect: profile.logoAspect,
    brandColor: profile.brandColor,
    signatureName: profile.signatureName,
  };
}

export function loadProfile(): BusinessProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<BusinessProfile>;
    if (!o || typeof o !== 'object' || !o.issuer || typeof o.issuer !== 'object') return null;
    const p = o.issuer as Party;
    return {
      issuer: {
        name: p.name ?? '',
        contact: p.contact ?? '',
        email: p.email ?? '',
        phone: p.phone ?? '',
        address: p.address ?? '',
        taxId: p.taxId ?? '',
        bank: p.bank ?? '',
      },
      notes: typeof o.notes === 'string' ? o.notes : '',
      currency: typeof o.currency === 'string' ? o.currency : 'USD',
      logo: typeof o.logo === 'string' && o.logo.startsWith('data:image/') ? o.logo : null,
      logoScale: typeof o.logoScale === 'number' ? o.logoScale : 1,
      logoAlign: o.logoAlign === 'center' || o.logoAlign === 'right' ? o.logoAlign : 'left',
      logoAspect:
        typeof o.logoAspect === 'number' && o.logoAspect > 0 ? o.logoAspect : null,
      brandColor: typeof o.brandColor === 'string' ? o.brandColor : null,
      signatureName: typeof o.signatureName === 'string' ? o.signatureName : '',
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: BusinessProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  } catch {
    /* quota or private mode */
  }
}
