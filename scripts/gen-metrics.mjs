/**
 * Generates src/pdf/metrics.ts — the advance widths and kerning pairs for the
 * three standard PDF fonts we draw with.
 *
 * WHY THIS EXISTS: the on-screen A4 preview and the exported PDF are produced
 * from one shared layout model (src/pdf/layout.ts). That model wraps text and
 * right-aligns columns, which means it has to *measure* text. If the preview
 * measured with the browser's canvas metrics and the PDF measured with jsPDF's,
 * the two would wrap differently and the preview would stop being a preview.
 *
 * So we extract jsPDF's own metrics at build time and both renderers measure
 * with this one table.
 *
 * UNITS: jsPDF stores advances in 1/100 em (`widths.fof === 100`), NOT the
 * 1/1000 em that the PDF spec and Adobe's AFM files use — Adobe's Helvetica
 * 'A' is 667, jsPDF's is 66. Kerning has its own divisor (`kerning.fof`), and
 * it is NEGATIVE (-100), so a positive stored value tightens the pair.
 *
 * We keep jsPDF's own numbers rather than rescaling to the AFM values, because
 * matching what jsPDF actually draws matters more than matching the spec: the
 * preview has to agree with the PDF, and the PDF is drawn by jsPDF.
 *
 * KERNING IS NOT OPTIONAL. jsPDF applies it by default in getTextWidth, and
 * ignoring it makes our measurement ~1-2% narrow — enough that a line we
 * believe fits is drawn past the right margin in the file. Dropping it is
 * caught by src/test/metrics.test.ts.
 *
 * Regenerate with `npm run metrics` (the build does this automatically).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/pdf/metrics.ts');

const FACES = [
  ['helvetica', 'normal'],
  ['helvetica', 'bold'],
  ['helvetica', 'italic'],
];

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

/**
 * Dense range: the codes WinAnsi covers, which is nearly every character a
 * Latin-script document uses. Anything jsPDF knows about OUTSIDE this range
 * goes into a sparse EXTRA map — jsPDF's table is not limited to WinAnsi and
 * carries entries such as U+2014 EM DASH. Assuming the table stopped at 255
 * measured an em dash as the fallback width and made any line containing one
 * measure narrow; the layout then wrapped it one word too late.
 */
const LOW = 32;
const HIGH = 255;

const tables = {};
let widthDivisor = null;
let kerningDivisor = null;

for (const [family, style] of FACES) {
  doc.setFont(family, style);
  const unicode = doc.getFont().metadata.Unicode;
  const widths = unicode.widths;
  const kerning = unicode.kerning;

  // These are properties of the format, not of a face; assert they agree.
  const wf = widths.fof ?? 1;
  const kf = kerning.fof ?? 1;
  if (widthDivisor === null) widthDivisor = wf;
  if (kerningDivisor === null) kerningDivisor = kf;
  if (wf !== widthDivisor || kf !== kerningDivisor) {
    throw new Error(
      `gen-metrics: ${family}-${style} uses different divisors (${wf}/${kf}) than ` +
        `the first face (${widthDivisor}/${kerningDivisor}). The generated table ` +
        'assumes one divisor for all faces — fix this before shipping.',
    );
  }

  const row = [];
  for (let cp = LOW; cp <= HIGH; cp++) row.push(widths[cp] ?? widths[0] ?? wf);

  // Everything jsPDF knows about outside the dense range.
  const extra = {};
  for (const [code, value] of Object.entries(widths)) {
    if (code === 'fof') continue;
    const cp = Number(code);
    if (!Number.isFinite(cp) || cp === 0) continue;
    if (cp < LOW || cp > HIGH) extra[code] = value;
  }

  // jsPDF indexes kerning as kerning[currentChar][priorChar]. Keep that order.
  const kern = {};
  for (const [cur, pairs] of Object.entries(kerning)) {
    if (cur === 'fof' || typeof pairs !== 'object' || pairs === null) continue;
    const inner = {};
    for (const [prior, value] of Object.entries(pairs)) {
      if (prior === 'fof') continue;
      inner[prior] = value;
    }
    if (Object.keys(inner).length) kern[cur] = inner;
  }

  tables[`${family}-${style}`] = { widths: row, extra, fallback: widths[0] ?? wf, kern };
}

const pairCount = Object.values(tables).reduce(
  (n, t) => n + Object.values(t.kern).reduce((m, p) => m + Object.keys(p).length, 0),
  0,
);

const body = `// GENERATED FILE — do not edit. Run \`npm run metrics\` to regenerate.
// Source: jsPDF's built-in standard-font metrics. See scripts/gen-metrics.mjs
// for why the preview and the PDF must share one measurement table.
//
// Advances are in 1/${widthDivisor} em for character codes ${LOW}..${HIGH} (WinAnsi range).
// Kerning is indexed [currentChar][priorChar] and divided by KERNING_DIVISOR,
// which is negative — a positive stored value tightens the pair.
// ${pairCount} kerning pairs across ${FACES.length} faces.

export const WIDTH_DIVISOR = ${widthDivisor};
export const KERNING_DIVISOR = ${kerningDivisor};
export const METRIC_LOW = ${LOW};
export const METRIC_HIGH = ${HIGH};

export type FaceKey = ${FACES.map(([f, s]) => `'${f}-${s}'`).join(' | ')};

export const FALLBACK_WIDTH: Record<FaceKey, number> = {
${Object.entries(tables)
  .map(([k, v]) => `  '${k}': ${v.fallback},`)
  .join('\n')}
};

export const WIDTHS: Record<FaceKey, readonly number[]> = {
${Object.entries(tables)
  .map(([k, v]) => `  '${k}': [${v.widths.join(',')}],`)
  .join('\n')}
};

/** Advances jsPDF defines outside the dense ${LOW}..${HIGH} range. */
export const EXTRA_WIDTHS: Record<FaceKey, Record<string, number>> = {
${Object.entries(tables)
  .map(([k, v]) => `  '${k}': ${JSON.stringify(v.extra)},`)
  .join('\n')}
};

export const KERNING: Record<FaceKey, Record<string, Record<string, number>>> = {
${Object.entries(tables)
  .map(([k, v]) => `  '${k}': ${JSON.stringify(v.kern)},`)
  .join('\n')}
};
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
const extraCount = Object.values(tables).reduce((n, t) => n + Object.keys(t.extra).length, 0);
console.log(
  `metrics: wrote ${out} — ${FACES.length} faces, ${HIGH - LOW + 1} dense codepoints, ` +
    `${extraCount} out-of-range, ${pairCount} kerning pairs, ${(body.length / 1024).toFixed(1)} kB`,
);
