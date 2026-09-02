import { describe, expect, it } from 'vitest';
import { computeTotals, formatMoney, parseNumber, rowNet } from '../lib/money';
import type { LineItem } from '../types';

const item = (qty: number, unitPrice: number, taxRate = 0): LineItem => ({
  id: Math.random().toString(36).slice(2),
  qty,
  description: 'x',
  unitPrice,
  taxRate,
});

describe('money', () => {
  it('sums rows without float drift', () => {
    // The classic: 0.1 + 0.2. Twelve of these must land on exactly 3.60.
    const items = Array.from({ length: 12 }, () => item(1, 0.3));
    expect(computeTotals(items).subtotal).toBe(360);
  });

  it('keeps the printed total equal to the sum of the printed rows', () => {
    // The failure this guards against: rows print rounded, the total is
    // computed from unrounded values, and the invoice is a cent off — which is
    // exactly the kind of thing a client's bookkeeper queries.
    const items = [item(3, 33.335), item(7, 12.005), item(1, 0.005)];
    const printedRows = items.reduce((sum, it) => sum + rowNet(it), 0);
    expect(computeTotals(items).subtotal).toBe(printedRows);
  });

  it('applies tax per row and groups by rate', () => {
    const totals = computeTotals([item(1, 100, 20), item(2, 50, 20), item(1, 100, 7)]);
    expect(totals.subtotal).toBe(30000);
    expect(totals.taxByRate).toEqual([
      { rate: 7, amount: 700 },
      { rate: 20, amount: 4000 },
    ]);
    expect(totals.tax).toBe(4700);
    expect(totals.total).toBe(34700);
  });

  it('reduces the taxable base proportionally when a discount is applied', () => {
    const totals = computeTotals([item(1, 100, 20)], 10);
    expect(totals.subtotal).toBe(10000);
    expect(totals.discount).toBe(1000);
    // Tax is charged on 90, not on 100.
    expect(totals.tax).toBe(1800);
    expect(totals.total).toBe(10800);
  });

  it('never produces NaN from garbage input', () => {
    const bad = { id: 'x', qty: NaN, description: '', unitPrice: Infinity, taxRate: NaN };
    const totals = computeTotals([bad as LineItem]);
    expect(Number.isFinite(totals.total)).toBe(true);
    expect(totals.total).toBe(0);
  });

  it('clamps an out-of-range discount instead of inverting the total', () => {
    expect(computeTotals([item(1, 100)], 500).total).toBe(0);
    expect(computeTotals([item(1, 100)], -50).total).toBe(10000);
  });

  it('formats ILS with a real shekel sign', () => {
    expect(formatMoney(32400, 'ILS')).toBe('₪324.00');
  });

  it('formats negatives with the sign before the symbol', () => {
    expect(formatMoney(-500, 'EUR')).toBe('-€5.00');
  });

  it('parses partial keystrokes without yielding NaN', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('.')).toBe(0);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('$1,200')).toBe(1200);
    expect(parseNumber('abc')).toBe(0);
  });
});
