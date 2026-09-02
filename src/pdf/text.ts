import {
  WIDTHS,
  FALLBACK_WIDTH,
  EXTRA_WIDTHS,
  KERNING,
  METRIC_LOW,
  METRIC_HIGH,
  WIDTH_DIVISOR,
  KERNING_DIVISOR,
  type FaceKey,
} from './metrics';
import {
  UNICODE_FALLBACK_WIDTH,
  UNICODE_WIDTH_DIVISOR,
  UNICODE_WIDTHS,
  type UnicodeFace,
} from './unicode-metrics';
import { needsUnicodeFont } from './unicodeFont';

export { needsUnicodeFont } from './unicodeFont';

/**
 * Text measurement shared by the on-screen preview and the PDF exporter.
 *
 * Both renderers call these functions, so a line that wraps at word seven on
 * screen wraps at word seven in the file. If you ever add a second measurement
 * path, the preview stops being a preview.
 */

export type FontWeight = 'normal' | 'bold' | 'italic';

const faceKey = (weight: FontWeight): FaceKey => `helvetica-${weight}` as FaceKey;

/**
 * Width of `text` in mm at `sizePt`.
 *
 * This replicates jsPDF's getCharWidthsArray exactly, including kerning, which
 * jsPDF applies by default. Ignoring kerning makes the measurement ~1-2% narrow
 * — enough that a line we believe fits gets drawn past the right margin in the
 * exported file, which is invisible on screen and obvious on paper.
 *
 * 1 pt = 25.4/72 mm; advances are in 1/WIDTH_DIVISOR em.
 */
function measureUnicode(text: string, sizePt: number, weight: FontWeight): number {
  const face: UnicodeFace = weight === 'bold' ? 'bold' : 'normal';
  const table = UNICODE_WIDTHS[face];
  const fallback = UNICODE_FALLBACK_WIDTH[face];
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    units += (table[String(code)] ?? fallback) / UNICODE_WIDTH_DIVISOR;
  }
  return units * sizePt * (25.4 / 72);
}

export function measureText(
  text: string,
  sizePt: number,
  weight: FontWeight = 'normal',
  forceUnicode = false,
): number {
  if (forceUnicode || needsUnicodeFont(text)) return measureUnicode(text, sizePt, weight);

  const face = faceKey(weight);
  const table = WIDTHS[face];
  const extra = EXTRA_WIDTHS[face];
  const fallback = FALLBACK_WIDTH[face];
  const kerning = KERNING[face];

  let units = 0;
  let priorCode = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const advance =
      code >= METRIC_LOW && code <= METRIC_HIGH
        ? (table[code - METRIC_LOW] ?? fallback)
        : (extra[String(code)] ?? fallback);

    // jsPDF indexes kerning[currentChar][priorChar], and KERNING_DIVISOR is
    // negative, so a positive stored value tightens the pair.
    const pair = kerning[String(code)]?.[String(priorCode)];
    units += advance / WIDTH_DIVISOR + (pair === undefined ? 0 : pair / KERNING_DIVISOR);

    priorCode = code;
  }

  return units * sizePt * (25.4 / 72);
}

/**
 * Greedy word wrap to `maxWidthMm`. A single word longer than the line (a URL,
 * a German compound, a pasted account number) is broken by character rather
 * than allowed to run off the page.
 */
export function wrapText(
  text: string,
  maxWidthMm: number,
  sizePt: number,
  weight: FontWeight = 'normal',
  forceUnicode = false,
): string[] {
  if (!text) return [];
  const out: string[] = [];
  const width = (s: string) => measureText(s, sizePt, weight, forceUnicode);

  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= maxWidthMm) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (width(word) <= maxWidthMm) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        if (width(chunk + ch) > maxWidthMm && chunk) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Truncates with an ellipsis so a long single-line value never overruns its column. */
export function truncateToWidth(
  text: string,
  maxWidthMm: number,
  sizePt: number,
  weight: FontWeight = 'normal',
  forceUnicode = false,
): string {
  if (measureText(text, sizePt, weight, forceUnicode) <= maxWidthMm) return text;
  const ellipsis = '...';
  let out = '';
  for (const ch of text) {
    if (measureText(out + ch + ellipsis, sizePt, weight, forceUnicode) > maxWidthMm) break;
    out += ch;
  }
  return out ? out + ellipsis : '';
}

/**
 * Largest font size at or below `maxPt` at which `text` fits `maxWidthMm`.
 *
 * TRAP THIS EXISTS FOR: any text containing a variable will overflow the day
 * the variable gets longer. The footer credit line embeds a domain; a business
 * name goes in the document header. Guessing a size that "looks fine" ships a
 * layout that breaks for one customer with a long name, and you never hear
 * about it. Measure, do not guess. Unit-tested in text.test.ts.
 */
export function fitFontSize(
  text: string,
  maxWidthMm: number,
  maxPt: number,
  minPt = 4,
  forceUnicode = false,
): number {
  if (!text) return maxPt;
  const naturalWidth = measureText(text, maxPt, 'normal', forceUnicode);
  if (naturalWidth <= maxWidthMm) return maxPt;
  const scaled = (maxPt * maxWidthMm) / naturalWidth;
  return Math.max(minPt, Math.floor(scaled * 100) / 100);
}

/**
 * Strips the debris that arrives when someone pastes a licence key out of an
 * email. Mail clients inject zero-width joiners and BOMs into copied text, and
 * an invisible character in the key means the vendor answers "invalid" for a
 * key that is perfectly good — which reads to the customer as "I paid and it
 * does not work".
 *
 * The zero-width characters are written as escapes on purpose: real ones in
 * source trip eslint's no-irregular-whitespace.
 */
export function cleanPastedKey(raw: string): string {
  const stripped = raw
    // zero-width space, ZWNJ, ZWJ, LRM, RLM, word joiner, BOM
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    // non-breaking and other unicode spaces
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .trim();

  // Accept a whole pasted line: "Your key: ABCD-1234-..." or a URL carrying it.
  const uuid = stripped.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  if (uuid) return uuid[0];

  // Gumroad-style grouped keys.
  const grouped = stripped.match(/[0-9A-Za-z]{6,}(?:-[0-9A-Za-z]{6,}){2,}/);
  if (grouped) return grouped[0];

  return stripped;
}
