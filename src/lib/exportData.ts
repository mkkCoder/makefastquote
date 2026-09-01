import type { DocumentState } from '../types';
import { computeTotals, formatMoney } from './money';

/**
 * FREE FOREVER, FOR EVERYONE. Never put this behind the paywall.
 *
 * A tool that holds someone's own data hostage feels like a trap and gets
 * talked about that way — and "you have to pay to get your own invoice data
 * out" is the single most quotable bad review a product like this can earn.
 * This is the cheapest reputation insurance available.
 */

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(doc: DocumentState): string {
  const totals = computeTotals(doc.items, doc.discount);
  const rows: Array<Array<string | number>> = [
    ['Document', doc.kind === 'invoice' ? 'Invoice' : 'Proposal'],
    ['Reference', doc.reference],
    ['Issue date', doc.issueDate],
    [doc.kind === 'invoice' ? 'Due date' : 'Valid until', doc.dueDate],
    ['Currency', doc.currency],
    ['From', doc.issuer.name],
    ['From email', doc.issuer.email],
    ['To', doc.client.name],
    ['To contact', doc.client.contact],
    ['To email', doc.client.email],
    [],
    ['Qty', 'Description', 'Unit price', 'Tax rate %', 'Line total'],
  ];

  for (const item of doc.items) {
    rows.push([
      item.qty,
      item.description,
      item.unitPrice.toFixed(2),
      item.taxRate,
      (item.qty * item.unitPrice).toFixed(2),
    ]);
  }

  rows.push([]);
  rows.push(['Subtotal', '', '', '', (totals.subtotal / 100).toFixed(2)]);
  if (totals.discount > 0) {
    rows.push([`Discount ${doc.discount}%`, '', '', '', (-totals.discount / 100).toFixed(2)]);
  }
  for (const t of totals.taxByRate) {
    rows.push([`Tax ${t.rate}%`, '', '', '', (t.amount / 100).toFixed(2)]);
  }
  rows.push(['Total', '', '', '', (totals.total / 100).toFixed(2)]);
  rows.push(['Total (formatted)', '', '', '', formatMoney(totals.total, doc.currency)]);

  // A leading BOM so Excel opens UTF-8 currency symbols correctly instead of
  // rendering "Â£" — the single most common complaint about exported CSVs.
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function toJson(doc: DocumentState): string {
  const totals = computeTotals(doc.items, doc.discount);
  return JSON.stringify(
    {
      ...doc,
      // Signature strokes are geometry, not data anyone wants in a backup, and
      // they make the file enormous. The rest round-trips.
      signature: undefined,
      computed: {
        subtotalMinor: totals.subtotal,
        discountMinor: totals.discount,
        taxMinor: totals.tax,
        totalMinor: totals.total,
        taxByRate: totals.taxByRate,
      },
    },
    null,
    2,
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
