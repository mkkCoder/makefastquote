/**
 * Generates static niche landing pages at /{slug}/index.html and rewrites
 * public/sitemap.xml from src/data/niches.json.
 *
 * Source of truth is niches.json — re-run whenever niches change.
 * Invoked automatically as the first step of `npm run build`.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const nichesPath = join(root, 'src/data/niches.json');
const sitemapPath = join(root, 'public/sitemap.xml');
const markerPath = join(root, '.niche-pages.json');

const SITE = 'https://makefastquote.com';
const today = new Date().toISOString().slice(0, 10);

/** @typedef {{ title: string, slug: string, industry: string, kind: string, description: string, prefilledItems: Array<{description: string, qty: number, unitPrice: number, taxRate: number}>, faq: Array<{question: string, answer: string}> }} Niche */

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function metaDescription(niche, max = 155) {
  const raw = niche.description.trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 80 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

function pageTitle(niche) {
  const suffix = ' | MakeFastQuote';
  if (niche.title.length + suffix.length <= 60) return `${niche.title}${suffix}`;
  if (niche.title.length <= 60) return niche.title;
  return `${niche.title.slice(0, 59).trimEnd()}…`;
}

function money(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function faqHtml(niche) {
  return niche.faq
    .map(
      (f) => `
          <details>
            <summary>${esc(f.question)}</summary>
            <p>${esc(f.answer)}</p>
          </details>`,
    )
    .join('');
}

function faqJsonLd(niche) {
  return niche.faq.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  }));
}

function itemsHtml(niche) {
  return niche.prefilledItems
    .map(
      (it) => `
              <li>
                <span>${esc(it.description)}</span>
                <span>${esc(String(it.qty))} × ${esc(money(it.unitPrice))}</span>
              </li>`,
    )
    .join('');
}

function jsonLd(niche) {
  const url = `${SITE}/${niche.slug}/`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['SoftwareApplication', 'WebApplication'],
        '@id': `${url}#app`,
        name: `MakeFastQuote — ${niche.title}`,
        url,
        image: `${SITE}/og.png`,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: `${niche.industry} quote and estimate generator`,
        operatingSystem: 'Web browser',
        isAccessibleForFree: true,
        description: niche.description,
        featureList: [
          `Prefilled ${niche.industry.toLowerCase()} line items`,
          'Searchable A4 PDF export',
          'Live preview in the browser',
          'No account required',
          'Client-side only — documents never leave the browser',
          'Quotation disclaimer on every PDF',
        ],
        offers: [
          {
            '@type': 'Offer',
            url: `${SITE}/app/?niche=${encodeURIComponent(niche.slug)}`,
            price: '0',
            priceCurrency: 'USD',
            name: 'Free',
            category: 'Free',
          },
          {
            '@type': 'Offer',
            url: `${SITE}/app/?upgrade=1`,
            price: '29',
            priceCurrency: 'USD',
            name: 'Pro — one-time lifetime unlock',
            category: 'One-time purchase',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faqJsonLd(niche),
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: pageTitle(niche),
        description: niche.description,
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${url}#app` },
      },
    ],
  };
  return JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
}

function pageHtml(niche) {
  const title = pageTitle(niche);
  const desc = metaDescription(niche);
  const url = `${SITE}/${niche.slug}/`;
  const editorHref = `../app/?niche=${encodeURIComponent(niche.slug)}`;
  const kindLabel =
    niche.kind === 'estimate'
      ? 'estimate'
      : niche.kind === 'proposal'
        ? 'proposal'
        : niche.kind === 'proforma'
          ? 'proforma'
          : 'quote';
  const firstItem = niche.prefilledItems[0]?.description ?? '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="../favicon.svg" />
    <meta name="theme-color" content="#4f46e5" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="author" content="MakeFastQuote" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="MakeFastQuote" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(niche.title)} — MakeFastQuote" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${SITE}/og.png" />
    <meta name="twitter:url" content="${url}" />

    <script type="application/ld+json">
${jsonLd(niche)}
    </script>
    <style>
      :root {
        color-scheme: light;
        --ink: #0f172a; --muted: #334155; --surface: #f1f5f9; --panel: #fff;
        --edge: #e2e8f0; --brand: #4f46e5; --brand-ink: #fff; --brand-soft: #eef2ff;
        --shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 24px 60px rgb(15 23 42 / 0.14);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          color-scheme: dark;
          --ink: #f8fafc; --muted: #cbd5e1; --surface: #0f172a; --panel: #1e293b;
          --edge: #334155; --brand: #a5b4fc; --brand-ink: #0f172a; --brand-soft: #312e81;
          --shadow: 0 1px 2px rgb(0 0 0 / 0.5), 0 30px 70px rgb(0 0 0 / 0.55);
        }
      }
      *, *::before, *::after { box-sizing: border-box; }
      html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        overflow-x: hidden;
      }
      body {
        margin: 0; min-height: 100dvh; overflow-x: hidden; background: var(--surface); color: var(--ink);
        font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .wrap {
        max-width: 76rem; margin: 0 auto;
        padding: 0 clamp(1rem, 4vw, 2.5rem);
        padding-left: max(clamp(1rem, 4vw, 2.5rem), env(safe-area-inset-left));
        padding-right: max(clamp(1rem, 4vw, 2.5rem), env(safe-area-inset-right));
      }
      img, picture, video, canvas, svg { display: block; max-width: 100%; height: auto; }
      header {
        position: sticky; top: 0; z-index: 10;
        background: color-mix(in srgb, var(--surface) 88%, transparent);
        backdrop-filter: saturate(160%) blur(12px); border-bottom: 1px solid var(--edge);
        padding-top: env(safe-area-inset-top);
      }
      .bar { min-height: 4rem; display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
      .mark {
        width: 1.85rem; height: 1.85rem; border-radius: 0.55rem; background: var(--brand);
        color: var(--brand-ink); display: grid; place-items: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0;
      }
      .brand {
        font-weight: 650; font-size: 0.95rem; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .btn {
        display: inline-flex; align-items: center; justify-content: center; border-radius: 0.6rem;
        font-size: 0.95rem; font-weight: 600; padding: 0.75rem 1.3rem; border: 1px solid transparent;
        text-decoration: none; cursor: pointer; white-space: nowrap; min-height: 44px; min-width: 44px;
      }
      .btn-primary { background: var(--brand); color: var(--brand-ink); }
      .btn-primary:hover { background: color-mix(in srgb, var(--brand) 86%, black); }
      .btn-ghost { border-color: #64748b; color: var(--ink); }
      .btn-sm { padding: 0.5rem 0.95rem; font-size: 0.875rem; border-radius: 0.5rem; }
      .btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
      .hero { padding: clamp(2rem, 5vw, 3.5rem) 0 3rem; }
      .hero-grid {
        display: grid; gap: 2rem; align-items: start;
      }
      @media (min-width: 960px) {
        .hero-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3rem; }
      }
      h1 {
        font-size: clamp(1.75rem, 3.5vw, 2.45rem); letter-spacing: -0.03em;
        line-height: 1.15; margin: 0 0 0.85rem;
      }
      .lede { color: var(--muted); font-size: 1.05rem; margin: 0 0 1.25rem; max-width: 36rem; }
      .cta-row { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
      .cta-row .btn { white-space: normal; text-align: center; }
      .eyebrow {
        font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--brand); margin: 0 0 0.4rem;
      }
      .item-list {
        list-style: none; margin: 0 0 1.25rem; padding: 0; border: 1px solid var(--edge);
        border-radius: 0.75rem; background: var(--panel); overflow: hidden;
      }
      .item-list li {
        display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.35rem 1rem; padding: 0.7rem 1rem;
        border-top: 1px solid var(--edge); font-size: 0.92rem;
      }
      .item-list li:first-child { border-top: 0; }
      .item-list span:last-child { color: var(--muted); }
      .sandbox label {
        display: block; font-size: 0.75rem; font-weight: 650; margin-bottom: 0.3rem; color: var(--muted);
      }
      .sandbox input {
        width: 100%; padding: 0.55rem 0.7rem; border-radius: 0.5rem; border: 1px solid var(--edge);
        background: var(--panel); color: var(--ink); font: inherit; font-size: 16px; min-height: 44px; margin-bottom: 0.75rem;
      }
      .doc-frame {
        background: var(--panel); border-radius: 0.85rem; box-shadow: var(--shadow);
        border: 1px solid var(--edge); overflow: hidden; min-height: 18rem;
      }
      .doc-frame svg { display: block; width: 100%; height: auto; }
      .doc-caption { font-size: 0.85rem; color: var(--muted); margin: 0.65rem 0 0; }
      section.wrap { padding-top: clamp(2rem, 5vw, 2.5rem); padding-bottom: clamp(2rem, 5vw, 2.5rem); }
      h2 { font-size: clamp(1.25rem, 1.1rem + 1vw, 1.45rem); letter-spacing: -0.02em; margin: 0 0 0.75rem; }
      h3 { font-size: 1.05rem; margin: 0 0 0.35rem; }
      .points {
        display: grid; gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
      }
      .point {
        background: var(--panel); border: 1px solid var(--edge); border-radius: 0.75rem; padding: 1rem 1.1rem;
      }
      .point p { margin: 0; color: var(--muted); font-size: 0.95rem; }
      .faq-list details {
        background: var(--panel); border: 1px solid var(--edge); border-radius: 0.65rem;
        padding: 0.85rem 1rem; margin-bottom: 0.65rem;
      }
      .faq-list summary { cursor: pointer; font-weight: 650; min-height: 44px; display: flex; align-items: center; }
      .faq-list p { margin: 0.55rem 0 0; color: var(--muted); }
      footer {
        border-top: 1px solid var(--edge); padding: 2rem 0 max(2.5rem, env(safe-area-inset-bottom)); color: var(--muted); font-size: 0.9rem;
      }
      footer a { color: var(--brand); display: inline-flex; align-items: center; min-height: 44px; }
      .foot-links { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin-top: 0.75rem; }
      .skip {
        position: absolute; left: -999px; top: 0;
      }
      .skip:focus { left: 1rem; top: 1rem; z-index: 20; }
    </style>
  </head>
  <body data-niche-slug="${esc(niche.slug)}">
    <a class="skip btn btn-primary btn-sm" href="#main">Skip to content</a>
    <header>
      <div class="wrap bar">
        <span class="mark" aria-hidden="true">Q</span>
        <a class="brand" href="../" style="color: inherit; text-decoration: none">makefastquote.com</a>
        <a class="btn btn-primary btn-sm" href="${editorHref}" style="margin-left: auto; flex-shrink: 0">Open editor</a>
      </div>
    </header>

    <main id="main">
      <section class="hero">
        <div class="wrap hero-grid">
          <div>
            <p class="eyebrow">${esc(niche.industry)} · Free ${esc(kindLabel)}</p>
            <h1>${esc(niche.title)}</h1>
            <p class="lede">${esc(niche.description)}</p>
            <div class="cta-row">
              <a class="btn btn-primary" href="${editorHref}">Customize this in the editor</a>
              <a class="btn btn-ghost" href="../">All quote tools</a>
            </div>
            <p class="eyebrow" style="margin-top: 1.25rem">Prefilled line items</p>
            <ul class="item-list">
              ${itemsHtml(niche)}
            </ul>
          </div>
          <div>
            <form class="sandbox" onsubmit="return false">
              <label for="niche-item">Tweak the first line item</label>
              <input id="niche-item" value="${esc(firstItem)}" autocomplete="off" aria-label="Edit first line item for live preview" />
            </form>
            <div class="doc-frame" aria-live="polite">
              <p style="margin: 1.5rem; color: #64748b; font-size: 0.9rem">
                Live ${esc(niche.industry.toLowerCase())} ${esc(kindLabel)} preview loads here from the same layout engine as the PDF.
              </p>
            </div>
            <p class="doc-caption">Interactive preview — same renderer as the downloaded file.</p>
          </div>
        </div>
      </section>

      <section class="wrap" id="benefits">
        <p class="eyebrow">Why this template</p>
        <h2>${esc(niche.industry)} documents without starting from a blank page.</h2>
        <div class="points">
          <div class="point">
            <h3>High-intent starters</h3>
            <p>Line items match real ${esc(niche.industry.toLowerCase())} work so you edit prices instead of inventing structure.</p>
          </div>
          <div class="point">
            <h3>Preview equals PDF</h3>
            <p>One layout model draws the on-page preview and the searchable A4 export.</p>
          </div>
          <div class="point">
            <h3>Private by design</h3>
            <p>Nothing you type is uploaded. The editor runs entirely in your browser.</p>
          </div>
        </div>
      </section>

      <section class="wrap" id="faq">
        <p class="eyebrow">FAQ</p>
        <h2>${esc(niche.industry)} quote and estimate questions.</h2>
        <div class="faq-list">
          ${faqHtml(niche)}
        </div>
        <div class="cta-row" style="margin-top: 1.5rem">
          <a class="btn btn-primary" href="${editorHref}">Customize this in the editor</a>
        </div>
      </section>
    </main>

    <footer>
      <div class="wrap">
        <p>MakeFastQuote — free quote, estimate, and proposal PDFs for ${esc(niche.industry.toLowerCase())} and other trades. Documents are quotations, not tax invoices.</p>
        <div class="foot-links">
          <a href="../">Home</a>
          <a href="../privacy.html">Privacy</a>
          <a href="../terms.html">Terms</a>
          <a href="../contact.html">Contact</a>
          <a href="${editorHref}">Open editor</a>
        </div>
      </div>
    </footer>

    <script type="module" src="../src/niche.ts"></script>
  </body>
</html>
`;
}

function staticUrls() {
  return [
    { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/privacy.html`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE}/terms.html`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE}/contact.html`, changefreq: 'yearly', priority: '0.4' },
  ];
}

function writeSitemap(niches) {
  const urls = [
    ...staticUrls(),
    ...niches.map((n) => ({
      loc: `${SITE}/${n.slug}/`,
      changefreq: 'monthly',
      priority: '0.8',
    })),
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  writeFileSync(sitemapPath, xml);
}

function main() {
  /** @type {Niche[]} */
  const niches = JSON.parse(readFileSync(nichesPath, 'utf8'));
  if (!Array.isArray(niches) || niches.length === 0) {
    console.error('gen-niches: niches.json is empty or invalid');
    process.exit(1);
  }

  const slugs = niches.map((n) => n.slug);
  const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dup.length) {
    console.error(`gen-niches: duplicate slugs: ${dup.join(', ')}`);
    process.exit(1);
  }

  // Remove previously generated niche folders so renamed slugs do not linger.
  if (existsSync(markerPath)) {
    try {
      const prev = JSON.parse(readFileSync(markerPath, 'utf8'));
      for (const slug of prev.slugs ?? []) {
        if (!slugs.includes(slug)) {
          const dir = join(root, slug);
          if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
        }
      }
    } catch {
      /* ignore corrupt marker */
    }
  }

  for (const niche of niches) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(niche.slug)) {
      console.error(`gen-niches: invalid slug "${niche.slug}"`);
      process.exit(1);
    }
    const dir = join(root, niche.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), pageHtml(niche));
  }

  writeSitemap(niches);
  writeFileSync(markerPath, JSON.stringify({ slugs, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`gen-niches: wrote ${niches.length} pages and updated sitemap.xml`);
}

main();
