/**
 * Browser end-to-end checklist. Exits non-zero on the first real failure.
 *
 * This runs against the BUILT site served from dist/, not the dev server, so
 * it exercises the same bundle, the same base path and the same lazy-chunk
 * loading that a visitor gets. Unit tests do not catch a watermark printing
 * off the edge of a page, a signature that vanishes on reload, or a Pro
 * template still selected after a licence is cleared.
 *
 * Run: npm run e2e   (after npm run build)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const shots = resolve(here, '../screenshots');

if (!existsSync(dist)) {
  console.error('e2e: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// ── a static server for dist/ ───────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = join(dist, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) path = join(path, 'index.html');
    if (!existsSync(path) && existsSync(`${path}/index.html`)) path = `${path}/index.html`;
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

const port = await new Promise((r) => server.listen(0, () => r(server.address().port)));
const origin = `http://localhost:${port}`;

// ── harness ────────────────────────────────────────────────────────────────
const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(err?.message ?? err) });
    console.log(`  FAIL  ${name}\n        ${String(err?.message ?? err).split('\n')[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Polls for a condition instead of sleeping a guessed number of milliseconds.
 * Autosave is debounced, so an assertion written as `await sleep(100)` races
 * it and fails roughly one run in ten — which is worse than no test, because
 * people learn to re-run it.
 */
async function waitFor(fn, { timeout = 5000, interval = 50, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // Element not present yet, or a transient navigation — keep polling
      // until the deadline rather than failing on the first miss.
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeout}ms waiting for ${what}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

const KEY = '38b1460a-5104-4067-a91d-77b872934d51';

/** 64x64 solid white — used to prove a blank page is refused, not guessed at. */
const BLANK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PMQ0AAAwDoPo33UrYvQQckD4XAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAYHLAMpT0sIcNbcEAAAAAElFTkSuQmCC';

/**
 * PLAYWRIGHT_CHROMIUM_PATH lets a sandbox or CI image supply its own Chromium
 * instead of having Playwright download one. Playwright pins an exact browser
 * build per version, so a mismatched image fails with "Executable doesn't
 * exist" — pointing at the installed binary is the fix, not re-downloading
 * ~400 MB. CI itself does not run this suite (see .github/workflows), which is
 * why PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set there.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
await mkdir(shots, { recursive: true });

/**
 * A fresh context per check. Console and page errors are collected per page;
 * anything logged at error level fails the check that produced it, because a
 * console error in production is a bug someone will hit.
 */
async function withPage(fn, { viewport = { width: 1440, height: 900 }, seed = null, routes = true } = {}) {
  const context = await browser.newContext({ viewport });
  const errors = [];

  if (routes) {
    // Never let a test touch the real vendor. Default: the key is valid.
    await context.route('**/api.lemonsqueezy.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, license_key: { key: KEY, status: 'active' } }),
      }),
    );
    // lemon.js is never loaded in tests; fail fast rather than hitting the CDN.
    await context.route('**/assets.lemonsqueezy.com/**', (route) => route.abort());
  }

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  if (seed) {
    // TRAP: seeding storage by navigating to the app and calling
    // localStorage.setItem means the app's own `pagehide` autosave overwrites
    // the seed the moment you navigate away. addInitScript runs before any
    // page script on the NEXT navigation, so the app boots with the seed
    // already in place and nothing to race.
    await page.addInitScript(seed);
  }

  try {
    await fn(page, errors);
  } finally {
    await context.close();
  }
  return errors;
}

const assertNoConsoleErrors = (errors) =>
  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);

console.log(`\ne2e — serving dist/ at ${origin}\n`);

// ── 1. landing page ────────────────────────────────────────────────────────
await check('landing page renders and links to the editor', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    assert(await page.locator('h1').isVisible(), 'no visible h1');
    const title = await page.title();
    assert(/quote/i.test(title), `title does not mention quotes: ${title}`);
    assert(/estimate/i.test(title), `title does not mention estimates: ${title}`);
    assert(title.length <= 60, `title is ${title.length} characters (want ≤60): ${title}`);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    assert(desc && desc.length <= 155, `meta description is ${desc?.length ?? 0} characters`);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    assert(canonical === 'https://makefastquote.com/', `canonical is ${canonical}`);
    // Relative, not absolute — the same build has to work at an apex domain
    // and at a project subpath. See the base note in vite.config.ts.
    assert(
      (await page.locator('a[href="./app/"]').count()) > 0,
      'landing page has no relative link to the editor',
    );
    assert(
      (await page.locator('a[href^="/"]').count()) === 0,
      'landing page has an absolute-rooted link, which breaks on a subpath',
    );
    // The hero must actually show a document, not an empty frame.
    const heroDoc = await page.locator('.doc-frame svg').count();
    assert(heroDoc === 1, `expected 1 hero document SVG, found ${heroDoc}`);
    const h1Count = await page.locator('h1').count();
    assert(h1Count === 1, `expected exactly 1 h1, found ${h1Count}`);
    const h1Text = (await page.locator('h1').textContent()) || '';
    assert(/estimate/i.test(h1Text) && /quote/i.test(h1Text), `h1 missing core query terms: ${h1Text}`);
    // Structured data must be valid JSON or search engines silently drop it.
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    const graph = JSON.parse(ld);
    const types = JSON.stringify(graph);
    assert(types.includes('SoftwareApplication'), 'JSON-LD missing SoftwareApplication');
    assert(types.includes('FAQPage'), 'JSON-LD missing FAQPage');
    assert(types.includes('HowTo'), 'JSON-LD missing HowTo');
    await page.screenshot({ path: join(shots, '01-landing.png'), fullPage: true });
  });
  assertNoConsoleErrors(errors);
});

// ── 1b. crawl assets ───────────────────────────────────────────────────────
await check('robots.txt and sitemap.xml are present and valid', async () => {
  const errors = await withPage(async (page) => {
    const robots = await (await page.goto(`${origin}/robots.txt`, { waitUntil: 'load' })).text();
    assert(/User-agent:\s*\*/i.test(robots), 'robots.txt missing User-agent');
    assert(/Allow:\s*\//i.test(robots), 'robots.txt does not allow /');
    assert(/Sitemap:\s*https:\/\/makefastquote\.com\/sitemap\.xml/i.test(robots), 'robots.txt missing sitemap URL');
    assert(/Disallow:\s*\/app\//i.test(robots), 'robots.txt should keep /app/ out of the index');

    const sitemapRes = await page.goto(`${origin}/sitemap.xml`, { waitUntil: 'load' });
    assert(sitemapRes.ok(), `sitemap.xml returned ${sitemapRes.status()}`);
    const sitemap = await sitemapRes.text();
    assert(sitemap.includes('https://makefastquote.com/'), 'sitemap missing homepage');
    assert(sitemap.includes('https://makefastquote.com/privacy.html'), 'sitemap missing privacy');
    assert(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap), 'sitemap missing lastmod');
  });
  assertNoConsoleErrors(errors);
});

// ── 2. editor boots and the preview reflects typing ────────────────────────
await check('typing updates the A4 preview immediately', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('#f-business-or-your-name').fill('Jane Doe Design');
    await page.locator('#f-company').fill('Acme Ltd');

    await waitFor(
      async () => (await page.locator('[data-testid="preview"] text', { hasText: 'Acme Ltd' }).count()) > 0,
      { what: 'the client name to appear in the preview' },
    );

    const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
    assert(svg.includes('Jane Doe Design'), 'issuer name missing from the preview');
    assert(svg.includes('PROPOSAL'), 'document title missing from the preview');
  });
  assertNoConsoleErrors(errors);
});

// ── 3. totals ──────────────────────────────────────────────────────────────
await check('line items compute a correct total with tax', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[aria-label="Description for line 1"]').fill('Design work');
    await page.locator('[aria-label="Quantity for line 1"]').fill('2');
    await page.locator('[aria-label="Unit price for line 1"]').fill('500');
    await page.locator('[aria-label="Tax rate for line 1"]').fill('20');

    const total = await waitFor(
      async () => {
        const t = await page.locator('[data-testid="grand-total"]').textContent();
        return t === '$1,200.00' ? t : null;
      },
      { what: 'the grand total to reach $1,200.00' },
    );
    assert(total === '$1,200.00', `total was ${total}`);
  });
  assertNoConsoleErrors(errors);
});

// ── 4. the free credit line is in the generated document ───────────────────
await check('free tier stamps the credit line into the preview itself', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
    assert(
      svg.includes('Made with makefastquote.com'),
      'the free credit line is not present in the rendered document',
    );
  });
  assertNoConsoleErrors(errors);
});

// ── 5. the biggest realistic input ─────────────────────────────────────────
await check('a 60-line document paginates and stays inside the page', async () => {
  const errors = await withPage(
    async (page) => {
      await page.goto(`${origin}/app/`, { waitUntil: 'load' });
      const pages = await waitFor(
        async () => {
          const n = await page.locator('[data-testid^="preview-page-"]').count();
          return n > 1 ? n : null;
        },
        { what: 'the document to paginate', timeout: 10000 },
      );
      assert(pages >= 2, `expected multiple pages, got ${pages}`);

      // Every drawn element must be inside the A4 box.
      const overflow = await page.evaluate(() => {
        const bad = [];
        for (const svg of document.querySelectorAll('[data-testid^="preview-page-"] svg')) {
          for (const el of svg.querySelectorAll('text')) {
            const box = el.getBBox();
            if (box.x < -0.5 || box.x + box.width > 210.5 || box.y > 297.5 || box.y < -0.5) {
              bad.push(`${el.textContent?.slice(0, 30)} @ ${box.x.toFixed(1)},${box.y.toFixed(1)} w${box.width.toFixed(1)}`);
            }
          }
        }
        return bad;
      });
      assert(overflow.length === 0, `text outside the page: ${overflow.slice(0, 3).join(' / ')}`);

      await page.screenshot({ path: join(shots, '05-long-document.png'), fullPage: false });
    },
    {
      seed: () => {
        const items = Array.from({ length: 60 }, (_, i) => ({
          id: `seed-${i}`,
          qty: 1 + (i % 4),
          description: `Line item ${i + 1} — a description long enough to wrap onto a second line in the table`,
          unitPrice: 125.5,
          taxRate: 20,
        }));
        localStorage.setItem(
          'mfq.document.v1',
          JSON.stringify({
            version: 1,
            kind: 'quote',
            template: 'standard',
            currency: 'USD',
            reference: '2026-BIG',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            issuer: { name: 'Jane Doe Design', contact: '', email: 'jane@example.com', phone: '', address: '' },
            client: { name: 'Acme Ltd', contact: 'Sam', email: 's@acme.com', phone: '', address: '' },
            items,
            notes: 'Payment due within 30 days.',
            discount: 5,
            logo: null,
            signature: [],
            signatureName: 'Jane Doe',
          }),
        );
      },
    },
  );
  assertNoConsoleErrors(errors);
});

// ── 6. a v0 save file migrates and is written back ─────────────────────────
await check('an old save file loads through migration and is repaired on disk', async () => {
  const errors = await withPage(
    async (page) => {
      await page.goto(`${origin}/app/`, { waitUntil: 'load' });

      // The repaired document must be written straight back, so the repair
      // does not silently re-run on every boot.
      const stored = await waitFor(
        async () => {
          const raw = await page.evaluate(() => localStorage.getItem('mfq.document.v1'));
          if (!raw) return null;
          const doc = JSON.parse(raw);
          return doc.items?.[0]?.id ? doc : null;
        },
        { what: 'the migrated document to be written back' },
      );

      assert(stored.version === 3, `version not stamped: ${stored.version}`);
      assert(typeof stored.items[0].id === 'string', 'legacy row did not get an id');
      assert(stored.items[0].description === 'Legacy row', 'legacy content lost in migration');
      assert(stored.logo === null, 'a non-image logo URL survived migration');

      const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
      assert(svg.includes('Legacy row'), 'migrated row is not rendered');
    },
    {
      seed: () => {
        // A v0 shape: no version, no ids, a bad logo, out-of-range signature.
        localStorage.setItem(
          'mfq.document.v1',
          JSON.stringify({
            kind: 'quote',
            items: [{ qty: 3, description: 'Legacy row', unitPrice: 20 }],
            logo: 'javascript:alert(1)',
            signature: [[[-5, 0.5], [9, 9]]],
            discount: 500,
          }),
        );
      },
    },
  );
  assertNoConsoleErrors(errors);
});

// ── 7. a refresh mid-gesture keeps the signature ───────────────────────────
await check('a signature survives a refresh taken right after drawing', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    const canvas = page.locator('[data-testid="signature-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + 10, box.y + box.height * 0.7);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        box.x + 10 + (box.width - 20) * (i / 12),
        box.y + box.height * (0.7 - 0.35 * Math.sin((i / 12) * Math.PI)),
      );
    }
    await page.mouse.up();

    await waitFor(
      async () => {
        const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return svg.includes('<polyline') ? true : null;
      },
      { what: 'the signature to reach the document' },
    );

    // Reload immediately — this is the case where a debounced autosave that is
    // not flushed on pagehide loses the last gesture.
    await page.reload({ waitUntil: 'load' });

    const svg = await waitFor(
      async () => {
        const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return s.includes('<polyline') ? s : null;
      },
      { what: 'the signature to survive the reload' },
    );
    assert(svg.includes('<polyline'), 'signature lost across reload');
    await page.screenshot({ path: join(shots, '07-signature.png') });
  });
  assertNoConsoleErrors(errors);
});

// ── 7b. importing a signature from a photo ─────────────────────────────────
await check('an uploaded signature photo lands on the document, background removed', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });

    await page.locator('[data-testid="signature-upload"]').click();
    await page
      .locator('[data-testid="signature-file"]')
      .setInputFiles(resolve(here, '../src/test/fixtures-signature.png'));

    // The processed preview must appear, and it must be a PNG — a JPEG would
    // have put the paper background straight back.
    const src = await waitFor(
      async () => {
        const el = page.locator('[data-testid="signature-image"]');
        return (await el.count()) ? await el.getAttribute('src') : null;
      },
      { what: 'the processed signature to appear', timeout: 15000 },
    );
    assert(src.startsWith('data:image/png'), `signature is not a PNG: ${src.slice(0, 30)}`);

    // The background really is transparent: sample the corner of the decoded
    // image. Asserting "an image appeared" would pass on an opaque rectangle,
    // which is precisely the bug this feature exists to avoid.
    const cornerAlpha = await page.evaluate(async (dataUrl) => {
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, 1, 1).data[3];
    }, src);
    assert(cornerAlpha === 0, `the paper was not removed — corner alpha is ${cornerAlpha}`);

    // And it reaches the actual document, not just the form.
    const svg = await waitFor(
      async () => {
        const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return s.includes('<image') ? s : null;
      },
      { what: 'the signature to reach the preview' },
    );
    assert(svg.includes('<image'), 'signature image missing from the document');

    // The preview must stay inside its frame. A percentage max-height in an
    // auto-sized grid row silently resolves to `none`, and the signature grew
    // out of the box and over the caption — visible in a screenshot, invisible
    // to any assertion that only checks the image exists.
    const overflow = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="signature-image"]');
      const frame = img.parentElement;
      const a = img.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      return { over: Math.round(a.bottom - b.bottom), right: Math.round(a.right - b.right) };
    });
    assert(overflow.over <= 1, `signature overflows its frame by ${overflow.over}px`);
    assert(overflow.right <= 1, `signature overflows its frame by ${overflow.right}px sideways`);

    // And it survives into the actual PDF as an embedded image.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-pdf"]').click(),
    ]);
    const bytes = await readFile(await download.path());
    assert(bytes.subarray(0, 5).toString() === '%PDF-', 'not a PDF');
    const body = bytes.toString('latin1');
    assert(body.includes('/Image'), 'the PDF has no embedded image — the signature was dropped');

    await page.screenshot({ path: join(shots, '07b-signature-upload.png') });
  });
  assertNoConsoleErrors(errors);
});

await check('uploading replaces a drawn signature rather than stacking both', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    const canvas = page.locator('[data-testid="signature-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 15, box.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 15 + i * 20, box.y + 40 + i * 3);
    await page.mouse.up();

    await waitFor(
      async () => {
        const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return s.includes('<polyline') ? true : null;
      },
      { what: 'the drawn signature to reach the document' },
    );

    await page.locator('[data-testid="signature-upload"]').click();
    await page
      .locator('[data-testid="signature-file"]')
      .setInputFiles(resolve(here, '../src/test/fixtures-signature.png'));

    const svg = await waitFor(
      async () => {
        const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return s.includes('<image') ? s : null;
      },
      { what: 'the uploaded signature to take over', timeout: 15000 },
    );
    // One signature line, one signature.
    assert(!svg.includes('<polyline'), 'the drawn strokes are still on the document too');
  });
  assertNoConsoleErrors(errors);
});

await check('a photo with no signature in it is refused with a readable reason', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[data-testid="signature-upload"]').click();
    // A blank white square — no ink to find.
    await page.locator('[data-testid="signature-file"]').setInputFiles({
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: Buffer.from(BLANK_PNG_BASE64, 'base64'),
    });
    const msg = await page.locator('[data-testid="signature-error"]').textContent();
    assert(/no signature found/i.test(msg ?? ''), `unhelpful error: ${msg}`);
    // And nothing was written to the document.
    const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
    assert(!svg.includes('<image'), 'a failed import still put something on the page');
  });
  assertNoConsoleErrors(errors);
});

// ── 8. the paywall ─────────────────────────────────────────────────────────
await check('a Pro template opens the upgrade modal instead of applying', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[data-testid="template-modern"]').click();
    await page.locator('[role="dialog"]').waitFor({ state: 'visible' });

    // Checkout must be wired: with CHECKOUT_URL empty the modal quietly shows
    // a "not connected yet" note instead of a buy button, which is easy to
    // ship and means nobody can pay.
    assert(
      (await page.locator('[data-testid="buy-button"]').count()) === 1,
      'no buy button — CHECKOUT_URL is not set in src/config.ts',
    );

    // The document must NOT have switched to the locked template.
    const stored = await page.evaluate(() => localStorage.getItem('mfq.document.v1'));
    assert(!stored || JSON.parse(stored).template !== 'modern', 'locked template was applied');
    await page.screenshot({ path: join(shots, '08-upgrade-modal.png') });
  });
  assertNoConsoleErrors(errors);
});

await check('a free user can preview a logo; download asks to unlock Pro', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[data-testid="logo-file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(BLANK_PNG_BASE64, 'base64'),
    });
    await waitFor(
      async () => {
        const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
        return s.includes('<image') ? s : null;
      },
      { what: 'the logo to appear in the preview' },
    );
    await page.locator('[data-testid="download-pdf"]').click();
    await page.locator('[role="dialog"]').waitFor({ state: 'visible' });
    assert(
      (await page.getByText(/Unlock your custom logo/i).count()) > 0,
      'unlock copy missing from the logo-export modal',
    );
  });
  assertNoConsoleErrors(errors);
});

// ── 9. activation, then clearing storage ───────────────────────────────────
await check('activating a key unlocks Pro and removes the credit line', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[data-testid="upgrade-cta"]').click();
    await page.locator('[role="dialog"]').waitFor({ state: 'visible' });
    await page.getByText('Already bought it?').click();

    // Paste a whole line with a zero-width character in it, like a real email.
    // The \u200B is deliberate: mail clients inject zero-width characters
    // into copied text, and it is written as an escape because a literal one
    // in source trips eslint's no-irregular-whitespace.
    await page
      .locator('[data-testid="license-input"]')
      .fill('Your key: 38b1460a-5104\u200B-4067-a91d-77b872934d51');
    await page.locator('[data-testid="activate-button"]').click();

    await page.locator('[data-testid="activation-success"]').waitFor({ state: 'visible' });
    await waitFor(async () => (await page.locator('[role="dialog"]').count()) === 0, {
      what: 'the modal to close after activation',
    });

    const svg = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
    assert(
      !svg.includes('Made with makefastquote.com'),
      'credit line still present after activating Pro',
    );

    const lic = JSON.parse(await page.evaluate(() => localStorage.getItem('mfq.license.v1')));
    assert(lic.valid === true, 'licence not stored as valid');
    assert(lic.key === KEY, `stored key was not cleaned: ${lic.key}`);
  });
  assertNoConsoleErrors(errors);
});

await check('clearing storage drops back to free and off the Pro template', async () => {
  const errors = await withPage(
    async (page) => {
      await page.goto(`${origin}/app/`, { waitUntil: 'load' });

      // Pro is active from the seed and the Modern template is applied.
      const before = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
      assert(!before.includes('Made with makefastquote.com'), 'seeded Pro user saw the credit line');

      await page.getByText('Deactivate on this device').click();

      // The credit line must come back into the rendered document itself.
      await waitFor(
        async () => {
          const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
          return s.includes('Made with makefastquote.com') ? s : null;
        },
        { what: 'the credit line to come back after deactivating' },
      );

      // And the stored document must not still be on a template they cannot
      // export. Polled, not asserted once: autosave is debounced, so a bare
      // read here races it and fails intermittently.
      const stored = await waitFor(
        async () => {
          const raw = await page.evaluate(() => localStorage.getItem('mfq.document.v1'));
          const d = raw ? JSON.parse(raw) : null;
          return d && d.template === 'standard' ? d : null;
        },
        { what: 'the stored document to fall back to a free template' },
      );
      assert(stored.template === 'standard', `still on a Pro template: ${stored.template}`);

      const lic = await page.evaluate(() => localStorage.getItem('mfq.license.v1'));
      assert(lic === null, 'licence still in storage after deactivating');
    },
    {
      seed: () => {
        localStorage.setItem(
          'mfq.license.v1',
          JSON.stringify({ key: '38b1460a-5104-4067-a91d-77b872934d51', valid: true, lastCheck: Date.now() }),
        );
        localStorage.setItem(
          'mfq.document.v1',
          JSON.stringify({
            version: 1,
            kind: 'proposal',
            template: 'modern',
            currency: 'USD',
            reference: 'R-1',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            issuer: { name: 'Jane', contact: '', email: '', phone: '', address: '' },
            client: { name: 'Acme', contact: '', email: '', phone: '', address: '' },
            items: [{ id: 'a', qty: 1, description: 'Work', unitPrice: 100, taxRate: 0 }],
            notes: '',
            discount: 0,
            logo: null,
            signature: [],
            signatureName: '',
          }),
        );
      },
    },
  );
  assertNoConsoleErrors(errors);
});

// ── 10. free data export is never gated ────────────────────────────────────
await check('CSV export works for a free user', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[aria-label="Description for line 1"]').fill('Consulting');
    await page.locator('[aria-label="Unit price for line 1"]').fill('250');

    await page.locator('[data-testid="data-menu"]').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-csv"]').click(),
    ]);
    const path = await download.path();
    const csv = await readFile(path, 'utf8');
    assert(csv.includes('Consulting'), 'CSV does not contain the line item');
    assert(csv.includes('250.00'), 'CSV does not contain the price');
    assert(csv.charCodeAt(0) === 0xfeff, 'CSV is missing the BOM Excel needs');
  });
  assertNoConsoleErrors(errors);
});

// ── 11. the PDF, actually opened ───────────────────────────────────────────
await check('Download PDF produces a real PDF with selectable text', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('#f-business-or-your-name').fill('Jane Doe Design');
    await page.locator('#f-company').fill('Acme Ltd');
    await page.locator('[aria-label="Description for line 1"]').fill('Brand identity system');
    await page.locator('[aria-label="Quantity for line 1"]').fill('1');
    await page.locator('[aria-label="Unit price for line 1"]').fill('2400');
    await page.locator('[aria-label="Tax rate for line 1"]').fill('17');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-pdf"]').click(),
    ]);
    const tmp = await download.path();
    const bytes = await readFile(tmp);
    await writeFile(resolve(here, '../screenshots/sample.pdf'), bytes);

    assert(bytes.subarray(0, 5).toString() === '%PDF-', 'not a PDF');
    assert(bytes.length > 1000, `PDF suspiciously small: ${bytes.length} bytes`);
    // A rasterised page would be hundreds of kB for this content.
    assert(bytes.length < 200_000, `PDF is ${bytes.length} bytes — is it rasterised?`);
  });
  assertNoConsoleErrors(errors);
});

await check('Hebrew in the form is real Hebrew in the PDF, not WinAnsi garbage', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('#f-business-or-your-name').fill('שלום סטודיו');
    await page.locator('[aria-label="Description for line 1"]').fill('עיצוב זהות');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-pdf"]').click(),
    ]);
    const bytes = await readFile(await download.path());
    await writeFile(resolve(here, '../screenshots/hebrew.pdf'), bytes);
    assert(bytes.subarray(0, 5).toString() === '%PDF-', 'not a PDF');
    const body = bytes.toString('latin1');
    assert(body.includes('NotoSansHebrew'), 'the Hebrew-capable font was not embedded');
    assert(body.includes('/ToUnicode'), 'PDF has no ToUnicode map — copy-paste will be garbage');
    assert(body.includes('/Ordering (Identity)'), 'CID Ordering was not patched; copy-paste will be mojibake');
    assert(!body.includes('/Ordering (Identity-H)'), 'unpatched Identity-H Ordering left in the file');
  });
  assertNoConsoleErrors(errors);
});

// ── 12. responsive breakpoints ─────────────────────────────────────────────
for (const [label, viewport] of [
  ['mobile 390x844', { width: 390, height: 844 }],
  ['tablet 834x1112', { width: 834, height: 1112 }],
  ['desktop 1440x900', { width: 1440, height: 900 }],
  ['wide 1920x1080', { width: 1920, height: 1080 }],
]) {
  await check(`no horizontal overflow at ${label}`, async () => {
    const errors = await withPage(
      async (page) => {
        await page.goto(`${origin}/app/`, { waitUntil: 'load' });
        await page.locator('#f-business-or-your-name').fill('Jane Doe Design');

        // Below the lg breakpoint the workspace is tabbed; switch to the
        // preview so we are asserting against the sheet, not an empty pane.
        const previewTab = page.locator('[data-testid="tab-preview"]');
        if (await previewTab.isVisible()) {
          await previewTab.click();
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert(overflow <= 1, `page scrolls horizontally by ${overflow}px`);

        assert(await page.locator('[data-testid="preview-page-1"]').isVisible(), 'preview not visible');
        await page.screenshot({
          path: join(shots, `12-${label.split(' ')[0]}.png`),
          fullPage: false,
        });
      },
      { viewport },
    );
    assertNoConsoleErrors(errors);
  });
}

// ── 13. every template renders ─────────────────────────────────────────────
await check('all four templates render for a Pro user', async () => {
  const errors = await withPage(
    async (page) => {
      await page.goto(`${origin}/app/`, { waitUntil: 'load' });
      for (const id of ['modern', 'minimalist', 'classic', 'standard']) {
        await page.locator(`[data-testid="template-${id}"]`).click();
        const svg = await waitFor(
          async () => {
            const s = await page.locator('[data-testid="preview-page-1"] svg').innerHTML();
            return s.includes('PROPOSAL') ? s : null;
          },
          { what: `the ${id} template to render` },
        );
        assert(svg.includes('Acme'), `${id} template lost the client name`);
        await page.screenshot({ path: join(shots, `13-template-${id}.png`) });
      }
    },
    {
      seed: () => {
        localStorage.setItem(
          'mfq.license.v1',
          JSON.stringify({ key: '38b1460a-5104-4067-a91d-77b872934d51', valid: true, lastCheck: Date.now() }),
        );
        localStorage.setItem(
          'mfq.document.v1',
          JSON.stringify({
            version: 1,
            kind: 'proposal',
            template: 'standard',
            currency: 'USD',
            reference: '2026-014',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            issuer: { name: 'Jane Doe Design', contact: '', email: 'jane@example.com', phone: '+1 555 0143', address: '12 Bridge Street\nBristol BS1 4ST' },
            client: { name: 'Acme Ltd', contact: 'Sam Rivera', email: 'sam@acme.com', phone: '', address: '400 Market Street\nSan Francisco CA' },
            items: [
              { id: 'a', qty: 1, description: 'Brand identity system — logo, palette, type scale', unitPrice: 2400, taxRate: 17 },
              { id: 'b', qty: 12, description: 'Design retainer (hours)', unitPrice: 95, taxRate: 17 },
              { id: 'c', qty: 1, description: 'Print-ready artwork', unitPrice: 350, taxRate: 0 },
            ],
            notes: 'This proposal is valid for 30 days. 50% due on acceptance, balance on delivery.',
            discount: 5,
            logo: null,
            signature: [],
            signatureName: 'Jane Doe',
          }),
        );
      },
    },
  );
  assertNoConsoleErrors(errors);
});

// ── 14. dark mode ──────────────────────────────────────────────────────────
await check('dark mode toggles and persists', async () => {
  const errors = await withPage(async (page) => {
    await page.goto(`${origin}/app/`, { waitUntil: 'load' });
    await page.locator('[data-testid="theme-toggle"]').click();
    await waitFor(
      async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
      { what: 'the dark theme to apply' },
    );
    await page.screenshot({ path: join(shots, '14-dark.png') });

    await page.reload({ waitUntil: 'load' });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(theme === 'dark', `theme did not persist, got ${theme}`);
  });
  assertNoConsoleErrors(errors);
});

// ── report ─────────────────────────────────────────────────────────────────
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\ne2e: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error('\nFailures:');
  for (const f of failed) console.error(`  ${f.name}\n    ${f.error}`);
  process.exit(1);
}
console.log(`screenshots written to screenshots/\n`);
