import { CHECKOUT_URL, LEMON_JS_URL } from '../config';

/**
 * The buy flow, built in layers so it degrades instead of breaking.
 *
 * The naive version is nine steps: click buy, new tab, pay, wait for an email,
 * find the email, find the key inside it, copy it, find the original tab again,
 * paste. Every one of those steps sheds people who have ALREADY DECIDED TO PAY.
 * That is the most expensive place in the entire product to lose someone.
 *
 * Layer 1  Overlay checkout — they never leave the page and their half-finished
 *          quote stays visible behind the modal. If the success payload
 *          carries the key, we activate it and they never see a code at all.
 * Layer 2  Pre-opened code field, when the payload has no key.
 * Layer 3  New tab, if lemon.js cannot load (offline, ad blocker, CSP).
 * Layer 4  ?key= on load, for a post-purchase redirect that carries it —
 *          handled in lib/license.ts takeKeyFromUrl().
 */

declare global {
  interface Window {
    LemonSqueezy?: {
      Setup: (opts: { eventHandler: (event: { event: string; data?: unknown }) => void }) => void;
      Url: { Open: (url: string) => void };
      Refresh: () => void;
    };
    createLemonSqueezy?: () => void;
  }
}

export const isCheckoutConfigured = (): boolean => CHECKOUT_URL.trim().length > 0;

let scriptPromise: Promise<boolean> | null = null;

/** Loads lemon.js once. Resolves false if it cannot load, never rejects. */
function loadLemonJs(): Promise<boolean> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    if (window.LemonSqueezy) return resolve(true);

    const script = document.createElement('script');
    script.src = LEMON_JS_URL;
    script.defer = true;

    // An ad blocker fires `error`; a captive portal may do neither, so the
    // timeout is what actually guarantees we fall through to layer 3.
    const timer = window.setTimeout(() => resolve(false), 6000);

    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      try {
        window.createLemonSqueezy?.();
      } catch {
        /* older lemon.js self-initialises */
      }
      resolve(Boolean(window.LemonSqueezy));
    });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      resolve(false);
    });

    document.head.appendChild(script);
  });
  return scriptPromise;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LICENCE_FIELD_RE = /licen[cs]e|key/i;

/**
 * Walks a vendor success payload looking for the licence key.
 *
 * Deliberately a search rather than a hard-coded path like
 * `data.order.first_order_item.license_key`. Vendor payload shapes change
 * without notice and without a version bump, and a hard-coded path fails
 * silently — the buyer pays, the overlay closes, and nothing happens. A search
 * for "a UUID-shaped string under a field whose name mentions a licence"
 * survives a reshuffle.
 */
export function findLicenseKey(payload: unknown, maxDepth = 6): string | null {
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number, keyName: string): string | null => {
    if (depth > maxDepth || node === null || node === undefined) return null;

    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (UUID_RE.test(trimmed) && LICENCE_FIELD_RE.test(keyName)) return trimmed;
      return null;
    }
    if (typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = walk(child, depth + 1, keyName);
        if (hit) return hit;
      }
      return null;
    }

    // Prefer keys whose name mentions a licence, then fall back to everything.
    const entries = Object.entries(node as Record<string, unknown>);
    const preferred = entries.filter(([k]) => LICENCE_FIELD_RE.test(k));
    for (const [k, v] of [...preferred, ...entries]) {
      const hit = walk(v, depth + 1, k);
      if (hit) return hit;
    }
    return null;
  };

  return walk(payload, 0, 'root');
}

export type CheckoutResult =
  | { kind: 'key'; key: string }
  | { kind: 'closed' }
  | { kind: 'new-tab' }
  | { kind: 'unconfigured' };

/**
 * Opens the best available checkout. Resolves when the outcome is known.
 * `kind: 'closed'` means the overlay was dismissed — the caller should show
 * the pre-opened code field (layer 2) rather than assuming they did not buy.
 */
export async function openCheckout(): Promise<CheckoutResult> {
  if (!isCheckoutConfigured()) return { kind: 'unconfigured' };

  const ok = await loadLemonJs();

  if (!ok || !window.LemonSqueezy) {
    // Layer 3: no overlay available.
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer');
    return { kind: 'new-tab' };
  }

  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const finish = (r: CheckoutResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    try {
      window.LemonSqueezy!.Setup({
        eventHandler: (event) => {
          if (event.event === 'Checkout.Success') {
            const key = findLicenseKey(event.data);
            finish(key ? { kind: 'key', key } : { kind: 'closed' });
          } else if (event.event === 'PaymentMethodUpdate.Closed' || event.event === 'Checkout.Closed') {
            finish({ kind: 'closed' });
          }
        },
      });
      window.LemonSqueezy!.Url.Open(withOverlayParams(CHECKOUT_URL));
    } catch {
      window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer');
      finish({ kind: 'new-tab' });
    }

    // If the overlay is closed by a means that fires no event, do not hang the
    // UI forever waiting for one.
    window.setTimeout(() => finish({ kind: 'closed' }), 15 * 60 * 1000);
  });
}

function withOverlayParams(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('embed', '1');
    return u.toString();
  } catch {
    return url;
  }
}
