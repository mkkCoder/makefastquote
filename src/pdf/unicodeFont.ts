import type { jsPDF } from 'jspdf';
import { EXTRA_WIDTHS, METRIC_HIGH, METRIC_LOW } from './metrics';

export const UNICODE_FONT = 'NotoSansHebrew';

const HEBREW = /[\u0590-\u05FF]/;
/** Hebrew plus gershayim/geresh so בע"מ stays one run. */
const HEBREW_RUN = /[\u0590-\u05FF]+(?:["\u05F3\u05F4\u201C\u201D][\u0590-\u05FF]+)*/gu;

export function hasHebrew(text: string): boolean {
  return HEBREW.test(text);
}

export function helveticaCanEncode(text: string): boolean {
  const extra = EXTRA_WIDTHS['helvetica-normal'];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= METRIC_LOW && c <= METRIC_HIGH) continue;
    if (extra[String(c)] !== undefined) continue;
    return false;
  }
  return true;
}

export function needsUnicodeFont(text: string): boolean {
  return !helveticaCanEncode(text);
}

/**
 * Visual order for a left-to-right draw call (jsPDF and SVG with bidi-override).
 *
 * The invoice/proposal chrome is LTR (title and amounts on the right, body
 * starting on the left). Reverse each Hebrew run so ש sits on the right of
 * שלום, but keep typed word order so the first word stays on the left —
 * not at the line end, which is what a full-line RTL flip would do.
 */
export function visualOrder(text: string): string {
  if (!HEBREW.test(text)) return text;
  return text.replace(HEBREW_RUN, reverseGraphemes);
}

function reverseGraphemes(run: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(run)]
      .map((s) => s.segment)
      .reverse()
      .join('');
  }
  return Array.from(run).reverse().join('');
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 8192;
  let out = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    out += String.fromCharCode(...bytes.subarray(i, end));
  }
  return out;
}

function asArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  const view = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export function addUnicodeFonts(
  pdf: jsPDF,
  regular: ArrayBuffer | Uint8Array,
  bold: ArrayBuffer | Uint8Array | null,
): void {
  pdf.addFileToVFS('NotoSansHebrew-Regular.ttf', arrayBufferToBinaryString(asArrayBuffer(regular)));
  pdf.addFont('NotoSansHebrew-Regular.ttf', UNICODE_FONT, 'normal');
  if (bold) {
    pdf.addFileToVFS('NotoSansHebrew-Bold.ttf', arrayBufferToBinaryString(asArrayBuffer(bold)));
    pdf.addFont('NotoSansHebrew-Bold.ttf', UNICODE_FONT, 'bold');
  }
}

/**
 * jsPDF writes `/Ordering (Identity-H)` on CID fonts. The PDF spec wants
 * `/Ordering (Identity)` for Identity-H fonts; several readers then skip
 * ToUnicode and Hebrew copy-paste comes out as the Latin mojibake the
 * standard fonts produced. Same-length replacement keeps the xref valid.
 */
export function patchCidOrdering(bytes: Uint8Array): Uint8Array {
  const from = latin1('/Ordering (Identity-H)');
  const to = latin1('/Ordering (Identity)  ');
  if (from.length !== to.length) {
    throw new Error('patchCidOrdering: replacement is not the same length');
  }
  const out = bytes.slice();
  for (let i = 0; i <= out.length - from.length; i++) {
    let match = true;
    for (let j = 0; j < from.length; j++) {
      if (out[i + j] !== from[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    out.set(to, i);
    i += from.length - 1;
  }
  return out;
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
