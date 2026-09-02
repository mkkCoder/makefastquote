/**
 * Generates src/pdf/unicode-metrics.ts — advance widths for the embedded
 * Noto Sans Hebrew faces, taken from jsPDF after addFont, the same way
 * gen-metrics.mjs reads Helvetica.
 *
 * Hebrew (and mixed Hebrew/Latin) is measured with this table and drawn with
 * the same TTF. Using Helvetica's fallback width for those glyphs made wrap
 * and the PDF disagree, and Helvetica cannot encode the characters at all.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');

const here = dirname(fileURLToPath(import.meta.url));
const fonts = resolve(here, '../src/pdf/fonts');
const out = resolve(here, '../src/pdf/unicode-metrics.ts');

const SIZE = 10;
const MM_PER_PT = 25.4 / 72;
const DIVISOR = 1000;

const RANGES = [
  [32, 255],
  [0x0590, 0x05ff],
  // Punctuation jsPDF Helvetica already special-cased; Noto has them too.
  [0x2013, 0x2015],
  [0x2018, 0x201e],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x20ac, 0x20ac],
  [0x20aa, 0x20aa],
  [0x20b9, 0x20b9],
];

function toBin(buf) {
  return Buffer.from(buf).toString('latin1');
}

function addFace(pdf, file, style) {
  const name = file.split(/[/\\]/).pop();
  pdf.addFileToVFS(name, toBin(readFileSync(file)));
  pdf.addFont(name, 'NotoSansHebrew', style);
}

const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
addFace(pdf, resolve(fonts, 'NotoSansHebrew-Regular.ttf'), 'normal');
addFace(pdf, resolve(fonts, 'NotoSansHebrew-Bold.ttf'), 'bold');

const tables = {};
for (const style of ['normal', 'bold']) {
  pdf.setFont('NotoSansHebrew', style);
  pdf.setFontSize(SIZE);
  const extra = {};
  for (const [lo, hi] of RANGES) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      const mm = pdf.getTextWidth(ch);
      extra[String(cp)] = Number(((mm / (SIZE * MM_PER_PT)) * DIVISOR).toFixed(4));
    }
  }
  const fallback = extra['32'] ?? 500;
  tables[style] = { extra, fallback };
}

const body = `// GENERATED FILE — do not edit. Run \`npm run metrics\` to regenerate.
// Advances are in 1/${DIVISOR} em, taken from jsPDF after embedding
// Noto Sans Hebrew. See scripts/gen-unicode-metrics.mjs.

export const UNICODE_WIDTH_DIVISOR = ${DIVISOR};

export type UnicodeFace = 'normal' | 'bold';

export const UNICODE_FALLBACK_WIDTH: Record<UnicodeFace, number> = {
${Object.entries(tables)
  .map(([k, v]) => `  ${k}: ${v.fallback},`)
  .join('\n')}
};

export const UNICODE_WIDTHS: Record<UnicodeFace, Record<string, number>> = {
${Object.entries(tables)
  .map(([k, v]) => `  ${k}: ${JSON.stringify(v.extra)},`)
  .join('\n')}
};
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
console.log(
  `unicode-metrics: wrote ${out} — ${Object.keys(tables.normal.extra).length} codepoints/face, ` +
    `${(body.length / 1024).toFixed(1)} kB`,
);
