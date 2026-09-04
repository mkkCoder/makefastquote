/**
 * Every value that a future owner might want to change lives here.
 * Switching payment vendor, price or domain should not require grepping.
 */

export const SITE = {
  domain: 'makefastquote.com',
  url: 'https://makefastquote.com',
  name: 'MakeFastQuote',
  tagline: 'Free quote and estimate generator',
} as const;

/** Price in whole units of `currency`. Referenced by every piece of copy. */
export const PRICE = {
  amount: 29,
  currency: 'USD',
  display: '$29',
  /** One-time purchase. If this ever becomes a subscription, see REVALIDATE_AFTER_DAYS. */
  model: 'one-time' as 'one-time' | 'subscription',
} as const;

/**
 * How long a stored, previously-valid licence is trusted before we ask the
 * vendor again.
 *
 * One-time purchase: 30 days is plenty — the key never lapses, we are only
 * checking for refunds and revocations.
 *
 * If PRICE.model ever becomes 'subscription', drop this to 3. A subscription
 * key goes invalid the moment the sub lapses, so a 30-day window would hand a
 * month of free Pro to everyone who cancels. Revalidation still fails open
 * (see lib/license.ts) so a card that failed on a Sunday does not break
 * someone's Monday.
 */
export const REVALIDATE_AFTER_DAYS = PRICE.model === 'subscription' ? 3 : 30;

/**
 * Licence vendor. Keep the endpoint here so switching vendors — or pointing at
 * your own proxy — is a one-line change.
 *
 * Lemon Squeezy's /validate endpoint is CORS-allowed and needs no API key,
 * which is what makes a backend-free licence gate possible at all.
 *
 * `/validate` deliberately, not `/activate`: validate does not consume an
 * activation, so a customer can use their key on their laptop and their
 * partner's without getting locked out and emailing you about it.
 */
export const LICENSE_VENDOR = {
  kind: 'lemonsqueezy' as 'lemonsqueezy' | 'gumroad',
  validateUrl: 'https://api.lemonsqueezy.com/v1/licenses/validate',
  /** Fallback vendor, kept wired so a switch is config-only. */
  gumroadUrl: 'https://api.gumroad.com/v2/licenses/verify',
  /** Only needed if kind === 'gumroad'. */
  gumroadProductId: '',
} as const;

/**
 * Lemon Squeezy overlay checkout URL.
 *
 * When empty, the buy button falls back to a "not connected yet" note instead
 * of opening a broken checkout.
 * Format: https://<store>.lemonsqueezy.com/checkout/buy/<variant-id>
 *
 * Note `/checkout/buy/`, not `/buy/`. Lemon Squeezy's docs are explicit that
 * shareable checkout URLs always contain `/checkout/buy/`; copy the link
 * straight out of the product's Share dialog rather than assembling it by hand.
 * Opening such a URL converts it into a single-use cart URL, which is normal
 * and is why the link you land on does not match the one you configured.
 */
export const CHECKOUT_URL = 'https://tik-tak.lemonsqueezy.com/checkout/buy/cc0af708-13c5-4752-aa91-8165e4eb938c';

/** Loaded lazily; only ever fetched when someone actually opens the buy flow. */
export const LEMON_JS_URL = 'https://assets.lemonsqueezy.com/lemon.js';

export const STORAGE_KEYS = {
  doc: 'mfq.document.v1',
  license: 'mfq.license.v1',
  theme: 'mfq.theme.v1',
  profile: 'mfq.profile.v1',
  archive: 'mfq.archive.v1',
} as const;

/** v3: quote kinds, proposal statuses, revision field. See lib/persist.ts. */
export const DOC_SCHEMA_VERSION = 3;
