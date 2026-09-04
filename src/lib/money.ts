import type { LineItem } from '../types';

/**
 * All money is computed in integer minor units (cents) and only converted to a
 * float at the very end. Summing floats row by row drifts: 0.1 + 0.2 is the
 * classic, but the one that actually bites a quote is a 3-decimal tax rate
 * applied to twelve rows, where the printed total ends a cent off the sum of
 * the printed rows and the client queries the bill.
 */

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Minor units (cents) for one row, before tax. */
export function rowNet(item: Pick<LineItem, 'qty' | 'unitPrice'>): number {
  const qty = Number.isFinite(item.qty) ? item.qty : 0;
  const price = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return Math.round(round(qty * price) * 100);
}

/** Tax in minor units for one row. */
export function rowTax(item: Pick<LineItem, 'qty' | 'unitPrice' | 'taxRate'>): number {
  const rate = Number.isFinite(item.taxRate) ? item.taxRate : 0;
  return Math.round((rowNet(item) * rate) / 100);
}

export interface Totals {
  /** Minor units. */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Tax broken down by rate, so a quote can show "VAT 20%" separately. */
  taxByRate: Array<{ rate: number; amount: number }>;
}

export function computeTotals(items: readonly LineItem[], discountPercent = 0): Totals {
  const subtotal = items.reduce((sum, it) => sum + rowNet(it), 0);

  const pct = Number.isFinite(discountPercent)
    ? Math.min(100, Math.max(0, discountPercent))
    : 0;
  const discount = Math.round((subtotal * pct) / 100);

  // The discount reduces the taxable base proportionally, which is what every
  // tax authority expects and what an accountant will check first.
  const scale = subtotal === 0 ? 0 : (subtotal - discount) / subtotal;

  const byRate = new Map<number, number>();
  for (const it of items) {
    const rate = Number.isFinite(it.taxRate) ? it.taxRate : 0;
    if (rate === 0) continue;
    const amount = Math.round(rowTax(it) * scale);
    byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  }

  const taxByRate = [...byRate.entries()]
    .map(([rate, amount]) => ({ rate, amount }))
    .sort((a, b) => a.rate - b.rate);

  const tax = taxByRate.reduce((sum, t) => sum + t.amount, 0);

  return {
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax,
    taxByRate,
  };
}

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
  CAD: 'CA$',
  AUD: 'A$',
  CHF: 'CHF ',
  JPY: '¥',
  INR: '₹',
  ZAR: 'R',
};

export const CURRENCIES = Object.keys(SYMBOLS);

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

/**
 * Formats minor units for display. Deliberately not Intl.NumberFormat: the PDF
 * is drawn with a WinAnsi font, and Intl emits U+00A0 and locale-specific
 * separators that have no glyph in that encoding and render as a blank or a
 * mojibake box in the exported file.
 */
export function formatMoney(minorUnits: number, code: string): string {
  const negative = minorUnits < 0;
  const abs = Math.abs(minorUnits);
  const whole = Math.floor(abs / 100).toString();
  const cents = (abs % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currencySymbol(code)}${grouped}.${cents}`;
}

/** Parses user keystrokes into a number without ever yielding NaN. */
export function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
