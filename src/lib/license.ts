import type { LicenseState } from '../types';
import { LICENSE_VENDOR, REVALIDATE_AFTER_DAYS, STORAGE_KEYS } from '../config';
import { cleanPastedKey } from '../pdf/text';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS GATE IS CLIENT-SIDE AND TRIVIALLY BYPASSABLE.
 *
 * Anyone who opens devtools can set `valid: true` in localStorage and have Pro
 * in about ten minutes. That is a deliberate trade, not an oversight: the
 * alternative is a server, which means a bill, a database of customers, an
 * attack surface and something to maintain forever — for a $29 one-time
 * product.
 *
 * So: spend zero hours on obfuscation. Minified checks, hashed flags and
 * split-brain validation all lose to one breakpoint, and every hour spent on
 * them is an hour not spent on the thing people actually pay for. The people
 * who would bypass this were never going to buy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const emptyLicense = (): LicenseState => ({ key: null, valid: false, lastCheck: 0 });

export function loadLicense(): LicenseState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.license);
    if (!raw) return emptyLicense();
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      key: typeof o.key === 'string' ? o.key : null,
      valid: o.valid === true,
      lastCheck: typeof o.lastCheck === 'number' ? o.lastCheck : 0,
      ...(typeof o.instanceName === 'string' ? { instanceName: o.instanceName } : {}),
    };
  } catch {
    return emptyLicense();
  }
}

export function saveLicense(state: LicenseState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.license, JSON.stringify(state));
  } catch {
    /* storage disabled — the customer will have to re-enter after a reload */
  }
}

export function clearLicense(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.license);
  } catch {
    /* storage disabled */
  }
}

export type ValidationOutcome =
  | { status: 'valid'; instanceName?: string }
  | { status: 'invalid'; message: string }
  | { status: 'unreachable'; message: string };

/**
 * Asks the vendor whether a key is good.
 *
 * TRAP: Lemon Squeezy and Gumroad both answer a bad key with **HTTP 404 and a
 * JSON body**. Branching on `res.ok` alone therefore reports every invalid key
 * as a network failure — which, combined with fail-open, would hand Pro to
 * anyone who typed nonsense. Always parse the body and read the vendor's own
 * validity field.
 */
export async function validateKey(rawKey: string, signal?: AbortSignal): Promise<ValidationOutcome> {
  const key = cleanPastedKey(rawKey);
  if (!key) return { status: 'invalid', message: 'Paste the code from your email.' };

  try {
    const res =
      LICENSE_VENDOR.kind === 'gumroad'
        ? await fetch(LICENSE_VENDOR.gumroadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              product_id: LICENSE_VENDOR.gumroadProductId,
              license_key: key,
            }),
            ...(signal ? { signal } : {}),
          })
        : await fetch(LICENSE_VENDOR.validateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ license_key: key }),
            ...(signal ? { signal } : {}),
          });

    // Read the body regardless of status — see the trap note above.
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return { status: 'unreachable', message: 'Could not reach the licence server.' };
    }

    if (LICENSE_VENDOR.kind === 'gumroad') {
      if (body.success === true) return { status: 'valid' };
      return { status: 'invalid', message: readMessage(body) };
    }

    if (body.valid === true) {
      const instance = body.instance as Record<string, unknown> | undefined;
      const name = typeof instance?.name === 'string' ? instance.name : undefined;
      return name ? { status: 'valid', instanceName: name } : { status: 'valid' };
    }
    return { status: 'invalid', message: readMessage(body) };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'unreachable', message: 'Cancelled.' };
    }
    return { status: 'unreachable', message: 'Could not reach the licence server.' };
  }
}

function readMessage(body: Record<string, unknown>): string {
  const raw = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : '';
  if (!raw) return "That code was not recognised. Check it's the whole line from your email.";
  // Vendor wording is aimed at developers ("license_key not found").
  if (/not found|invalid/i.test(raw)) {
    return "That code was not recognised. Check it's the whole line from your email.";
  }
  if (/expired/i.test(raw)) return 'That code has expired.';
  if (/disabled|revoked/i.test(raw)) return 'That code has been deactivated.';
  return raw;
}

const DAY_MS = 86_400_000;

export function needsRevalidation(state: LicenseState, now = Date.now()): boolean {
  if (!state.key || !state.valid) return false;
  return now - state.lastCheck > REVALIDATE_AFTER_DAYS * DAY_MS;
}

/**
 * Re-checks a stored key in the background.
 *
 * FAIL OPEN, PRECISELY. "Treat network failure as paid" read literally hands
 * Pro to every visitor who happens to be offline. The correct rule, and what
 * this implements:
 *
 *   fail open ONLY when revalidating a key that is already stored AND was
 *   previously valid.
 *
 * No stored key means free tier, offline or not. A first-time activation that
 * cannot reach the server is not granted — it is reported as unreachable, so
 * the customer knows to try again rather than believing they are Pro and
 * finding out later that they are not.
 */
export async function revalidate(state: LicenseState, now = Date.now()): Promise<LicenseState> {
  if (!state.key || !state.valid) return state;

  const outcome = await validateKey(state.key);

  if (outcome.status === 'valid') {
    return {
      ...state,
      valid: true,
      lastCheck: now,
      ...(outcome.instanceName ? { instanceName: outcome.instanceName } : {}),
    };
  }

  if (outcome.status === 'invalid') {
    // The vendor actively said no — refunded, revoked, or a subscription that
    // lapsed. This is the one case where we take Pro away.
    return { ...state, valid: false, lastCheck: now };
  }

  // Unreachable: keep Pro, do not advance lastCheck, try again next boot.
  return state;
}

/**
 * Reads a licence key handed over in the URL, e.g. a post-purchase redirect to
 * /app/?key=xxxx. Strips it from the address bar afterwards so it does not end
 * up in a screenshot, a bookmark or a shared link.
 */
export function takeKeyFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('key') ?? url.searchParams.get('license_key');
    if (!key) return null;
    url.searchParams.delete('key');
    url.searchParams.delete('license_key');
    window.history.replaceState({}, '', url.toString());
    return cleanPastedKey(key);
  } catch {
    return null;
  }
}
