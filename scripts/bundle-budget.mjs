/**
 * Fails the build when the shipped JavaScript exceeds its budget.
 *
 * A budget that is only a number in a README is not a budget. This runs as the
 * last step of `npm run build`, so the day someone adds a date library "just
 * for one format call" the build says so instead of the site quietly getting
 * slower for every visitor.
 *
 * The budget counts what a visitor actually downloads to use the editor:
 * entry chunks plus anything statically imported from them. jsPDF is
 * dynamically imported and therefore excluded — it is fetched only when
 * somebody exports, which most sessions never do. That exclusion is the whole
 * reason the dynamic import exists, so it is checked separately.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');

const BUDGET_KB = 500;
const LAZY_BUDGET_KB = 220;

if (!existsSync(dist)) {
  console.error('bundle-budget: dist/ not found — run the build first.');
  process.exit(1);
}

/** jsPDF's chunk is recognisable by size and by name; everything else is eager. */
const isLazy = (name) => /jspdf|jsPDF/i.test(name);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(dist).filter((f) => f.endsWith('.js') || f.endsWith('.css'));

let eager = 0;
let lazy = 0;
const rows = [];

for (const file of files) {
  const raw = readFileSync(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  const name = file.slice(dist.length + 1);
  const lazyChunk = isLazy(name);
  if (lazyChunk) lazy += gz;
  else eager += gz;
  rows.push({ name, gz, lazyChunk });
}

rows.sort((a, b) => b.gz - a.gz);
console.log('\nbundle-budget — gzipped sizes');
for (const r of rows.slice(0, 12)) {
  console.log(
    `  ${(r.gz / 1024).toFixed(1).padStart(7)} kB  ${r.lazyChunk ? '[lazy] ' : '       '}${r.name}`,
  );
}

const eagerKb = eager / 1024;
const lazyKb = lazy / 1024;
console.log(`\n  eager total: ${eagerKb.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB)`);
console.log(`  lazy  total: ${lazyKb.toFixed(1)} kB gzipped (budget ${LAZY_BUDGET_KB} kB)`);

let failed = false;
if (eagerKb > BUDGET_KB) {
  console.error(`\nFAIL: eager bundle ${eagerKb.toFixed(1)} kB exceeds ${BUDGET_KB} kB.`);
  failed = true;
}
if (lazyKb > LAZY_BUDGET_KB) {
  console.error(
    `\nFAIL: lazy bundle ${lazyKb.toFixed(1)} kB exceeds ${LAZY_BUDGET_KB} kB. ` +
      'Check the html2canvas/dompurify aliases in vite.config.ts are still in place.',
  );
  failed = true;
}

if (failed) process.exit(1);
console.log('\nbundle-budget: OK\n');
