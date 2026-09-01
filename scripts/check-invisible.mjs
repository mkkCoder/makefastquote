/**
 * Fails if any source file contains a literal invisible character.
 *
 * TRAP THIS GUARDS: a test *about* zero-width characters that contains real
 * ones trips eslint's no-irregular-whitespace, and the failure message points
 * at a line that looks completely normal in a diff. Write them as \u escapes —
 * visible in review, and lint-clean. This check runs in CI so the rule cannot
 * be quietly broken by a paste from a chat window.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Zero-width and unusual-space code points, built from escapes on purpose.
const BAD = new Set([
  0x00a0, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff, 0x2007, 0x202f, 0x205f, 0x3000,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2008, 0x2009, 0x200a,
]);

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'screenshots']);
const EXT = /\.(ts|tsx|js|mjs|css|html|json|yml|md)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXT.test(entry)) out.push(p);
  }
  return out;
}

let found = 0;
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (let c = 0; c < line.length; c++) {
      const cp = line.codePointAt(c);
      if (BAD.has(cp)) {
        console.error(
          `${file.slice(root.length + 1)}:${i + 1}:${c + 1} — literal U+${cp
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')}; write it as an escape instead`,
        );
        found++;
        return;
      }
    }
  });
}

if (found > 0) {
  console.error(`\ncheck-invisible: ${found} line(s) contain literal invisible characters.`);
  process.exit(1);
}
console.log('check-invisible: clean');
