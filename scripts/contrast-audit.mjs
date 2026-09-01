/**
 * Audits every text/background colour pair in the design tokens against WCAG.
 *
 * WHY PROGRAMMATICALLY: a brand colour that fails AA on the panel background
 * is extremely easy to ship — it looks fine to whoever picked it, on their
 * monitor — and embarrassing to be told about later. Eyeballing does not catch
 * a 4.3:1 pair. This does, in both themes, on every build.
 *
 * Thresholds are the WCAG 2.1 AA ones: 4.5:1 for body text, 3:1 for large text
 * (>=18.66px bold or >=24px) and for non-text UI boundaries.
 *
 * The tokens are parsed out of src/styles.css rather than duplicated here, so
 * the audit cannot drift from what the app actually renders.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/styles.css'), 'utf8');
const landing = readFileSync(resolve(here, '../index.html'), 'utf8');

function parseTokens(source, selector) {
  const start = source.indexOf(selector);
  if (start === -1) throw new Error(`contrast-audit: could not find "${selector}"`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const block = source.slice(open + 1, close);
  const tokens = {};
  for (const line of block.split(';')) {
    const m = line.match(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/);
    if (m) tokens[m[1]] = m[2];
  }
  return tokens;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * [foreground, background, minimum ratio, what it is]
 * Every pair here corresponds to something the UI actually renders.
 */
const PAIRS = [
  ['ink', 'surface', 4.5, 'body text on the page background'],
  ['ink', 'panel', 4.5, 'body text on a card'],
  ['muted', 'panel', 4.5, 'secondary text on a card'],
  ['muted', 'surface', 4.5, 'secondary text on the page'],
  ['muted', 'brand-soft', 4.5, 'secondary text in the Pro callout'],
  ['faint', 'panel', 4.5, 'labels and hints on a card'],
  ['faint', 'surface', 4.5, 'labels and hints on the page'],
  ['brand-ink', 'brand', 4.5, 'text on a primary button'],
  ['brand', 'panel', 4.5, 'brand-coloured text and icons on a card'],
  ['brand', 'surface', 4.5, 'brand-coloured text on the page'],
  ['brand', 'brand-soft', 4.5, 'brand text inside the brand-tinted callout'],
  ['ink', 'brand-soft', 4.5, 'text inside a selected template row'],
  // WCAG 1.4.11 covers visual information required to identify a control. A
  // text field's border is exactly that — it is what says "this is a box you
  // type in" — so --edge-strong is held to 3:1. The purely decorative
  // --edge (card outlines, section rules) is not, and is deliberately absent
  // from this list. See the note at the top of src/styles.css.
  ['edge-strong', 'panel', 3, 'text input and outline-button borders'],
  ['edge-strong', 'surface', 3, 'control borders against the page'],
  ['brand', 'brand-soft', 3, 'focus ring against its own tint'],
];

const THEMES = [
  ['light (app)', parseTokens(css, ':root {')],
  ['dark (app)', parseTokens(css, "html[data-theme='dark']")],
  ['light (landing)', parseTokens(landing, ':root {')],
  ['dark (landing)', parseTokens(landing, '@media (prefers-color-scheme: dark)')],
];

let failures = 0;
let checked = 0;

for (const [themeName, tokens] of THEMES) {
  const rows = [];
  for (const [fg, bg, min, what] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;
    checked++;
    const ratio = contrast(tokens[fg], tokens[bg]);
    const pass = ratio >= min;
    if (!pass) failures++;
    rows.push({ fg, bg, ratio, min, pass, what });
  }
  console.log(`\n${themeName}`);
  for (const r of rows) {
    console.log(
      `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.ratio.toFixed(2).padStart(6)}:1  (min ${r.min})  ` +
        `--${r.fg} on --${r.bg}  — ${r.what}`,
    );
  }
}

console.log(`\ncontrast-audit: ${checked} pairs checked, ${failures} failing`);
if (failures > 0) {
  console.error(
    '\nFAIL: fix the token values in src/styles.css (and index.html for the landing page).\n' +
      'Do not relax the thresholds — they are the WCAG AA minimums.',
  );
  process.exit(1);
}
