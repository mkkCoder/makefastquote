import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { measureText } from '../pdf/text';

/**
 * Pins our text measurement to jsPDF's own.
 *
 * This is the test that keeps the preview honest. Everything downstream — word
 * wrap, right-aligned columns, the fitted footer credit — assumes the preview
 * and the PDF measure text identically. If the generated metrics table, its
 * divisor, or jsPDF's internal widths ever drift apart, every one of those
 * silently starts lying and the only symptom is a PDF that looks subtly
 * different from the page the customer approved.
 */
describe('measurement agrees with jsPDF', () => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  const samples = [
    'Invoice',
    'Total due',
    'Wolfeschlegelsteinhausenbergerdorff Consulting International Limited',
    '$1,234,567.89',
    'Payment is due within thirty days of the invoice date.',
    'jaguar quiz WXYZ 0123456789 (){}[]@#%&*',
    'Café Zürich Ångström — naïve façade',
  ];

  for (const weight of ['normal', 'bold', 'italic'] as const) {
    for (const size of [7.5, 9, 12, 26]) {
      it(`matches for ${weight} at ${size}pt`, () => {
        pdf.setFont('helvetica', weight);
        pdf.setFontSize(size);
        for (const s of samples) {
          expect(measureText(s, size, weight)).toBeCloseTo(pdf.getTextWidth(s), 6);
        }
      });
    }
  }

  it('measures the empty string as zero in both', () => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    expect(measureText('', 10)).toBe(pdf.getTextWidth(''));
  });
});
