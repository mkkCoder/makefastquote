/**
 * Generates the hero document shown on the landing page and injects it into
 * index.html between the HERO_DOC markers.
 *
 * WHY IT IS GENERATED RATHER THAN DRAWN: the picture on the landing page is
 * the product's single most persuasive asset, and a hand-made mockup of "what
 * the output looks like" is a promise the code does not have to keep. This
 * boots the real editor from the real build, seeds a real document, and lifts
 * the SVG the real renderer produced. If the layout engine changes, re-running
 * this updates the marketing to match. The picture cannot lie.
 *
 * Inlined rather than linked so the landing page still makes zero extra
 * requests — the whole reason its first paint is one round trip.
 *
 * Run: npm run hero   (after npm run build)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const indexPath = resolve(here, '../index.html');

const START = '<!--HERO_DOC_START-->';
const END = '<!--HERO_DOC_END-->';

if (!existsSync(dist)) {
  console.error('make-hero: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = join(dist, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));

/** A believable freelance quote — not lorem, not a joke. */
const SEED = {
  version: 3,
  kind: 'quote',
  template: 'modern',
  currency: 'USD',
  reference: '2026-014',
  revision: 1,
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  issuer: {
    name: 'Studio Meridian',
    contact: '',
    email: 'hello@studiomeridian.com',
    phone: '',
    address: '',
  },
  client: {
    name: 'Northwind Coffee Co.',
    contact: 'Dana Alvarez',
    email: 'dana@northwind.coffee',
    phone: '',
    address: '',
  },
  items: [
    { id: 'a', qty: 1, description: 'Brand identity — logo, palette, type scale', unitPrice: 2400, taxRate: 0 },
    { id: 'b', qty: 14, description: 'Packaging design (hours)', unitPrice: 95, taxRate: 0 },
    { id: 'c', qty: 1, description: 'Print-ready artwork', unitPrice: 350, taxRate: 0 },
  ],
  notes: 'Official tax invoices will be issued separately upon payment or project completion.',
  discount: 0,
  logo: null,
  signature: [],
  signatureName: 'Ana Reyes',
};

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });

// Seed before any page script runs, and grant Pro so the hero shows the
// product at its best — no credit line, a paid template.
await context.addInitScript(
  ([doc]) => {
    localStorage.setItem('mfq.document.v1', doc);
    localStorage.setItem(
      'mfq.license.v1',
      JSON.stringify({ key: 'hero', valid: true, lastCheck: Date.now() }),
    );
  },
  [JSON.stringify(SEED)],
);

const page = await context.newPage();
await page.goto(`http://localhost:${port}/app/`, { waitUntil: 'load' });
await page.locator('[data-testid="preview-page-1"] svg').waitFor({ state: 'attached' });

let svg = await page
  .locator('[data-testid="preview-page-1"] svg')
  .evaluate((el) => el.outerHTML);

await browser.close();
server.close();

if (!svg.includes('Northwind')) {
  console.error('make-hero: the rendered document does not contain the seeded client — aborting.');
  process.exit(1);
}
if (svg.includes('Made with')) {
  console.error('make-hero: the free credit line is in the hero document — the Pro seed failed.');
  process.exit(1);
}

// The live preview sizes itself to its container; the hero controls size in CSS.
svg = svg
  .replace(/\swidth="100%"/, '')
  .replace(/\sstyle="[^"]*"/, '')
  .replace('<svg ', '<svg class="doc" role="img" aria-label="An example quote produced by the tool" ');

const html = await readFile(indexPath, 'utf8');
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a === -1 || b === -1) {
  console.error(`make-hero: could not find ${START} / ${END} in index.html`);
  process.exit(1);
}

const next = html.slice(0, a + START.length) + '\n' + svg + '\n' + html.slice(b);
await writeFile(indexPath, next);

console.log(`make-hero: injected ${(svg.length / 1024).toFixed(1)} kB of SVG into index.html`);
