# makefastquote.com

A freelance proposal and invoice generator that runs entirely in the browser.
No backend, no database, no accounts. The only outbound calls it ever makes are
a licence check when someone activates Pro, and nothing else.

Free: unlimited proposals and invoices, A4 PDF export with real searchable text,
signatures, per-line tax, discounts, multi-page, and CSV/JSON export of your own
data. A single credit line in the document footer.

Pro, $29 once: your logo, three studio templates, and no credit line.

```bash
npm ci
npm run dev          # http://localhost:5173  (landing) and /app/ (editor)
npm run verify       # everything CI runs, plus the browser suite
```

## How it fits together

```
index.html            landing page — static, all CSS inlined, no JS
app/index.html        the editor's host page
src/
  config.ts           price, domain, licence vendor, storage keys — change here
  store.ts            zustand store + debounced autosave
  pdf/
    layout.ts         ← THE IMPORTANT ONE. Document → drawing ops in mm.
    svg.ts            ops → SVG, for the on-screen preview
    render.ts         ops → PDF, via jsPDF (dynamically imported)
    text.ts           text measurement shared by both renderers
    metrics.ts        GENERATED — font metrics, `npm run metrics`
  lib/
    money.ts          integer-cent arithmetic
    persist.ts        load / migrate / repair / save
    license.ts        validation, revalidation, fail-open rule
    checkout.ts       the layered buy flow
    exportData.ts     free CSV/JSON export
scripts/              build-time generators and the verification suite
```

**The one architectural idea:** `src/pdf/layout.ts` turns a document into a list
of primitive drawing operations in millimetres. The preview renders those ops to
SVG; the exporter renders the same ops to a PDF. There is one layout engine, so
the preview cannot drift from the file. If you add a visual feature, add it
there — never draw directly in a renderer.

---

# For whoever picks this up next

Everything below is invisible in the code and expensive to rediscover. Each item
says what breaks if you remove it.

### PDF and text measurement

**jsPDF stores font advances in 1/100 em, not the spec's 1/1000.** Adobe's
Helvetica `A` is 667; jsPDF's is 66. `scripts/gen-metrics.mjs` reads
`widths.fof` rather than assuming. Get this wrong and every measurement is 10×
off, which means text wraps in the wrong place and runs off the page.

**Kerning is not optional.** jsPDF applies kerning inside `getTextWidth` by
default. Ignoring it makes our measurement ~1–2% narrow — enough that a line we
believe fits gets drawn past the right margin. Its table is indexed
`kerning[currentChar][priorChar]` (that order), and `kerning.fof` is **negative**
(-100), so a positive stored value *tightens* the pair.

**jsPDF's width table is not limited to WinAnsi.** It carries entries above
U+00FF, including U+2014 EM DASH. An earlier version assumed the table stopped
at 255, measured every em dash as the fallback width, and wrapped any line
containing one a word too late. Hence `EXTRA_WIDTHS`.

All three are guarded by `src/test/metrics.test.ts`, which pins our
`measureText` to `jsPDF.getTextWidth()` across three weights and four sizes. If
that test fails, do not adjust the test.

**We use the standard PDF fonts (Helvetica), not an embedded one.** That is
deliberate: no font file to download, and it sidesteps two nasty traps. If you
ever *do* embed a font, know that (a) jsPDF writes an invalid CIDSystemInfo —
`/Ordering (Identity-H)` where the spec wants `/Ordering (Identity)` — and
readers then ignore the ToUnicode map, so text silently stops being selectable;
patch the output bytes with a **same-length** replacement so the xref stays
valid. And (b) Fontsource splits fonts by unicode range, and the `latin-ext`
file contains **no basic Latin at all** — subsetting from it yields a font with
no letters and headings that print blank. Merge the ranges and assert common
characters survive.

The cost of standard fonts: the character set is WinAnsi (Latin-1). Hebrew,
Arabic and CJK will not render. That is a known limitation, stated on the
landing page's FAQ.

**`html2canvas`, `dompurify` and `canvg` are aliased to a throwing stub** in
`vite.config.ts`. jsPDF imports them statically for its `.html()` path, which we
never call. Removing the aliases silently adds ~58 kB gzipped to every visitor's
download. The stub throws rather than returning undefined so a future `.html()`
call fails loudly instead of producing a blank PDF.

**jsPDF is dynamically imported** in `render.ts`. It is 125 kB gzipped — larger
than the entire rest of the app. Most visitors never export. Making it a static
import would slow the first paint for everyone.

**`align: 'center'` does not compose with `angle` in jsPDF** — centring is
computed before rotation, so rotated text lands off-centre. We do not currently
rotate any text; if you add a diagonal watermark, place the anchor by hand:
step back half the measured text width along `(cos θ, −sin θ)`.

### Persistence

**Repairs are written back on load.** `loadDocument()` persists the migrated
document immediately. Skip that and the repair silently re-runs on every boot,
and what is on disk never matches what is on screen — invisible until the day a
migration is not idempotent, and then it corrupts quietly.

**Deactivation flushes synchronously**, bypassing the 400 ms autosave debounce.
Debouncing exists because typing fires a save per keystroke; a one-off click
that changes entitlement has no such problem, and a 400 ms window where storage
still says "Pro, Modern template" is a real gap.

**Signature strokes are stored in normalised 0..1 coordinates**, not pixels.
That is what lets one signature draw correctly into a 62 mm PDF box, a scaled
preview and a resized canvas. Pixel-space storage distorts the moment a
breakpoint changes.

### The licence gate

**It is client-side and bypassable in about ten minutes with a console.** That
is a deliberate trade for having no backend, no accounts and no server bill.
Spend zero hours on obfuscation — every hour there is an hour not spent on what
people actually pay for, and anyone willing to patch localStorage was never
going to buy.

**Lemon Squeezy and Gumroad both answer a bad key with HTTP 404 *and* a JSON
body.** Branch on `data.valid` / `data.success`, never on the status code.
Getting this wrong reports every wrong key as a network failure, which combined
with fail-open would hand Pro to anyone who types nonsense.

**Fail open, precisely:** only when revalidating a key that is *already stored*
and was *previously valid*. "Treat network failure as paid" read literally gives
Pro to every offline visitor. A first-time activation that cannot reach the
server is reported as unreachable, not granted. Four tests in
`src/test/license.test.ts` cover exactly this; they are the ones that must never
regress.

**We call `/validate`, not `/activate`.** Validate does not consume an
activation, so a customer can use their key on their laptop and their partner's
without getting locked out and emailing you.

**The success-payload search walks the object** looking for a UUID-shaped string
under a licence-ish field name, rather than reading a hard-coded path. Vendor
payload shapes change without notice and without a version bump, and a
hard-coded path fails *silently* — the buyer pays, the overlay closes, and
nothing happens.

**The code field is forgiving.** It accepts a whole pasted line, a redirect URL,
and strips the zero-width characters mail clients inject. An invisible character
in a good key reads to the customer as "I paid and it doesn't work".

### CSS

**Component classes live in `@layer components`.** An unlayered
`.btn { display: inline-flex }` has the same specificity as Tailwind's `.hidden`
and, being later in the file, wins — so every responsive utility silently stops
working on these components and the mobile header wraps into a broken two-line
mess. It looks like a Tailwind bug; it is a cascade-order bug.

**There are two border tokens.** `--edge` is decorative (card outlines, section
rules) and stays light. `--edge-strong` is the boundary of an interactive
control, where the border *is* the affordance, and must clear 3:1 —
`npm run audit:contrast` enforces that on `--edge-strong` only. Do not "fix" a
failing audit by switching a control back to `--edge`.

**The sidebar is split in two** (`SidebarTop` / `SidebarRest`) so that on a
phone the first thing a visitor sees is not a locked template picker and an
"Unlock Pro — $29" card before they have typed anything. Templates and the Pro
card sit below the form on mobile, and rejoin the left column on desktop.

### Tooling

**`*.tsbuildinfo` is gitignored, and `tsBuildInfoFile` points into
`node_modules/.tmp/`.** Tracking a build cache guarantees a conflict every time
the tree is exchanged, and a stale one can make `tsc -b` skip type checking
altogether — so the build goes green while types are broken.

**`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'` is set in the workflow env.**
`playwright` is a devDependency, so without it every `npm ci` pulls ~400 MB of
browsers. CI runs unit tests and the build; the browser suite runs locally.

**Literal zero-width characters in source fail lint.** A test *about* zero-width
characters that contains real ones trips `no-irregular-whitespace`, and the
failure points at a line that looks completely normal in a diff. Write them as
`\u200B`-style escapes. `scripts/check-invisible.mjs` enforces this across the
whole repo, including files eslint does not cover — and it caught this very
README while it was being written.

**`PLAYWRIGHT_CHROMIUM_PATH`** lets a sandbox or CI image supply its own
Chromium. Playwright pins an exact browser build per version; a mismatched image
fails with "Executable doesn't exist", and the fix is to point at the installed
binary, not to re-download.

**The e2e suite seeds storage with `addInitScript`, not by navigating and
calling `setItem`.** The app's own `pagehide` autosave overwrites a seed the
moment you navigate away. And every assertion about stored state *polls* rather
than sleeping a guessed number of milliseconds — autosave is debounced, and a
bare read races it and fails roughly one run in ten, which is worse than no test
because people learn to re-run it.

---

## Before you announce the site

These are the things nobody else can do for you.

1. **Set `CHECKOUT_URL` in `src/config.ts`** to your Lemon Squeezy product URL
   (`https://<store>.lemonsqueezy.com/buy/<variant-uuid>`). Until you do, the
   buy button shows a "not connected yet" note instead of opening a broken
   checkout. Enable licence keys on the product in Lemon Squeezy.

2. **Buy your own product in Lemon Squeezy Test mode** with card
   `4242 4242 4242 4242`, and watch which layer of the buy flow actually fires:
   does the overlay open, does the success payload carry the key, does the code
   field pre-open. This is the one path that cannot be tested for you, and it is
   the path every paying customer walks.

3. **DNS, in this order.** Four A records for the apex to `185.199.108.153`,
   `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `www` CNAME
   to `<user>.github.io`. **Delete any existing apex A record first** —
   registrars often point it at their own site builder, and it fights
   everything.

4. **Set the custom domain by hand** in Settings → Pages. A `CNAME` file in the
   build artifact is *not* read into Pages settings for Actions-based deploys,
   only for branch-based ones. We ship the file anyway, but you must fill in the
   field.

5. **Expect a certificate warning in between.** While Pages shows "DNS Check in
   Progress", `https://` serves GitHub's `*.github.io` certificate and browsers
   report `ERR_CERT_COMMON_NAME_INVALID`. Test over `http://` until the check
   goes green, then tick Enforce HTTPS. If it stalls past an hour, remove the
   domain and re-add it.

6. **Enable Actions before the first push**, and set Settings → Pages → Source
   to "GitHub Actions". If Actions is off when the push lands, no run is created
   and enabling it afterwards does not backfill — trigger a fresh one with
   `workflow_dispatch` or an empty commit.

7. **Test on Safari by hand.** SVG text measurement differs there and no sandbox
   has it. The preview is SVG, so this is the one browser difference most likely
   to show up.

## The one number to watch

**Export attempts ÷ licence activations.** Everything else is vanity. If people
are exporting and not buying, the paywall framing or the price is wrong. If
nobody is exporting, you have a traffic problem, not a product problem, and no
amount of copy tuning fixes that.

Be honest about the ceiling: one-time-purchase conversion in single-use tools
runs **1–3% of active users** regardless of copy. The paywall framing here is
worth the afternoon it took; it is not a substitute for traffic.
