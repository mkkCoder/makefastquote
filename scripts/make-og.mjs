/**
 * Renders public/og.png (1200x630) from an inline SVG using the sandbox's
 * Chromium via Playwright. Run once; the PNG is committed.
 *
 * Kept as a script rather than a hand-made image so the wording can be changed
 * without opening a design tool.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/og.png');

/*
 * Everything is in normal flow — no absolute positioning.
 *
 * The first version pinned the pill row to the bottom with `position:absolute`,
 * and the subtitle grew into it: the two overlapped and the image shipped
 * looking broken. A rendered image cannot be unit-tested, so the rule here is
 * to let flow layout do the work and then LOOK at the PNG.
 *
 * Note the font stack ends at DejaVu Sans: this renders in whatever browser
 * generates it, and the output is committed, so the committed PNG is what
 * every share preview shows. Do not tune the sizes against a font the
 * generating machine does not have.
 */
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;background:#0e1014;color:#eceef2;
       font-family:ui-sans-serif,system-ui,'DejaVu Sans',Helvetica,Arial,sans-serif;
       display:flex;flex-direction:column;justify-content:center;gap:26px;
       padding:0 84px;box-sizing:border-box}
  .row{display:flex;align-items:center;gap:16px}
  .mark{width:50px;height:50px;border-radius:13px;background:#6366f1;color:#fff;
        display:grid;place-items:center;font-weight:700;font-size:27px}
  .dom{font-size:24px;font-weight:600;color:#b3b9c4}
  h1{font-size:56px;line-height:1.1;letter-spacing:-.025em;margin:0;
     max-width:19ch;font-weight:700}
  p{font-size:25px;color:#b3b9c4;margin:0;max-width:40ch;line-height:1.35}
  .pill{display:flex;gap:12px}
  .pill span{border:1px solid #2b303a;border-radius:999px;padding:9px 18px;
             font-size:18px;color:#9aa1ad;white-space:nowrap}
</style>
<div class="row"><div class="mark">Q</div><div class="dom">makefastquote.com</div></div>
<h1>Proposals and invoices that look like a real business sent them.</h1>
<p>Free, no sign-up, and nothing you type leaves your browser.</p>
<div class="pill"><span>A4 PDF</span><span>No account</span><span>$29 once for Pro</span></div>`;

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
// Guard: if a copy change makes the content taller than the card, the parts
// would be clipped or overlap. Fail loudly instead of committing a broken PNG.
const overflow = await page.evaluate(() => ({
  scroll: document.body.scrollHeight,
  client: document.body.clientHeight,
}));
if (overflow.scroll > overflow.client + 1) {
  throw new Error(
    `og: content is ${overflow.scroll}px tall in a ${overflow.client}px card — ` +
      'shorten the copy or reduce the sizes.',
  );
}

const buf = await page.screenshot({ type: 'png' });
writeFileSync(out, buf);
await browser.close();
console.log(`og: wrote ${out} (${(buf.length / 1024).toFixed(0)} kB)`);
