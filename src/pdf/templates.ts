import type { TemplateId } from '../types';

export interface Template {
  id: TemplateId;
  label: string;
  blurb: string;
  pro: boolean;
  /** Accent used for rules, the title and the total row. */
  accent: string;
  ink: string;
  muted: string;
  /** Fill behind the table head; empty string means no fill. */
  headFill: string;
  /** A solid colour band across the top of page 1. */
  bandHeight: number;
  bandFill: string;
  /** Title treatment. */
  titleSize: number;
  titleWeight: 'normal' | 'bold';
  titleTracking: number;
  titleUpper: boolean;
  /** Rule weight under the table head and above the total. */
  rule: number;
  /** Serif-ish feel is faked with italics for the classic template's labels. */
  labelStyle: 'normal' | 'italic';
  /** Zebra striping on body rows. */
  zebra: string;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  // The free template. Deliberately good — a free tier that looks broken sells
  // nothing, it just makes people leave.
  standard: {
    id: 'standard',
    label: 'Standard',
    blurb: 'Clean and neutral. Free forever.',
    pro: false,
    accent: '#1f2937',
    ink: '#111827',
    muted: '#6b7280',
    headFill: '#f3f4f6',
    bandHeight: 0,
    bandFill: '',
    titleSize: 26,
    titleWeight: 'bold',
    titleTracking: 0,
    titleUpper: true,
    rule: 0.4,
    labelStyle: 'normal',
    zebra: '',
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    blurb: 'Colour band, generous space, confident numerals.',
    pro: true,
    accent: '#4f46e5',
    ink: '#0f172a',
    muted: '#64748b',
    headFill: '#eef2ff',
    bandHeight: 6,
    bandFill: '#4f46e5',
    titleSize: 30,
    titleWeight: 'bold',
    titleTracking: 0.6,
    titleUpper: true,
    rule: 0.5,
    labelStyle: 'normal',
    zebra: '#f8fafc',
  },
  minimalist: {
    id: 'minimalist',
    label: 'Minimalist',
    blurb: 'Hairlines, no fills, everything earns its place.',
    pro: true,
    accent: '#111111',
    ink: '#111111',
    muted: '#8a8a8a',
    headFill: '',
    bandHeight: 0,
    bandFill: '',
    titleSize: 20,
    titleWeight: 'normal',
    titleTracking: 3.2,
    titleUpper: true,
    rule: 0.2,
    labelStyle: 'normal',
    zebra: '',
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'Double rules and small caps. Reads like a law firm.',
    pro: true,
    accent: '#7c2d12',
    ink: '#1c1917',
    muted: '#78716c',
    headFill: '#faf6f2',
    bandHeight: 0,
    bandFill: '',
    titleSize: 24,
    titleWeight: 'bold',
    titleTracking: 1.4,
    titleUpper: true,
    rule: 0.6,
    labelStyle: 'italic',
    zebra: '',
  },
};

/**
 * Pro templates are listed FIRST on purpose. The paid deliverable should be
 * seen before the paywall is — putting the locked options at the bottom of a
 * list means most people never scroll far enough to want them.
 */
export const TEMPLATE_ORDER: TemplateId[] = ['modern', 'minimalist', 'classic', 'standard'];
