import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsRevalidation, revalidate, validateKey } from '../lib/license';
import { findLicenseKey } from '../lib/checkout';
import { REVALIDATE_AFTER_DAYS } from '../config';
import type { LicenseState } from '../types';

const DAY = 86_400_000;
const KEY = '38b1460a-5104-4067-a91d-77b872934d51';

const stored = (over: Partial<LicenseState> = {}): LicenseState => ({
  key: KEY,
  valid: true,
  lastCheck: 0,
  ...over,
});

/** Mimics a vendor reply, including the status code it really uses. */
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateKey', () => {
  it('treats a 404 with valid:true as valid — status code alone is not the answer', () => {
    // Guard against reintroducing `if (!res.ok) return unreachable`.
    vi.stubGlobal('fetch', mockFetch(200, { valid: true }));
    return expect(validateKey(KEY)).resolves.toMatchObject({ status: 'valid' });
  });

  it('reads the JSON body on a 404 rather than calling it a network error', async () => {
    // TRAP: Lemon Squeezy answers a BAD key with HTTP 404 *and* a JSON body.
    // Branching on the status code reports every wrong key as "unreachable",
    // which combined with fail-open would hand Pro to anyone typing nonsense.
    vi.stubGlobal('fetch', mockFetch(404, { valid: false, error: 'license_key not found' }));
    const out = await validateKey(KEY);
    expect(out.status).toBe('invalid');
  });

  it('reports a genuine network failure as unreachable, not invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    expect((await validateKey(KEY)).status).toBe('unreachable');
  });

  it('rejects an empty key without calling the network', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await validateKey('   ')).status).toBe('invalid');
    expect(f).not.toHaveBeenCalled();
  });

  it('cleans a pasted line before sending it', async () => {
    const f = mockFetch(200, { valid: true });
    vi.stubGlobal('fetch', f);
    await validateKey(`Your key: ${KEY}`);
    const init = f.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.license_key).toBe(KEY);
  });

  it('rewrites developer-facing vendor wording into something a buyer understands', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { valid: false, error: 'license_key not found' }));
    const out = await validateKey(KEY);
    expect(out.status === 'invalid' && out.message).toMatch(/not recognised/i);
  });
});

describe('needsRevalidation', () => {
  it('is false for someone who never bought — no stored key means free tier', () => {
    expect(needsRevalidation({ key: null, valid: false, lastCheck: 0 })).toBe(false);
  });

  it('is false inside the window', () => {
    const now = Date.now();
    expect(needsRevalidation(stored({ lastCheck: now }), now)).toBe(false);
  });

  it('is true once the window has passed', () => {
    const now = Date.now();
    expect(
      needsRevalidation(stored({ lastCheck: now - (REVALIDATE_AFTER_DAYS + 1) * DAY }), now),
    ).toBe(true);
  });
});

describe('revalidate — fail open, precisely', () => {
  it('KEEPS Pro when the network is unreachable for an already-valid stored key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const state = stored();
    const next = await revalidate(state);
    expect(next.valid).toBe(true);
    // lastCheck must NOT advance, so we try again on the next boot rather than
    // buying another 30 days of not knowing.
    expect(next.lastCheck).toBe(state.lastCheck);
  });

  it('REVOKES Pro when the vendor actively says the key is invalid', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { valid: false, error: 'license_key not found' }));
    expect((await revalidate(stored())).valid).toBe(false);
  });

  it('does NOT grant Pro to someone offline with no stored key', async () => {
    // The literal reading of "treat network failure as paid" hands Pro to
    // every offline visitor. This is the case that must never regress.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const next = await revalidate({ key: null, valid: false, lastCheck: 0 });
    expect(next.valid).toBe(false);
  });

  it('does NOT grant Pro offline for a stored key that was never valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const next = await revalidate({ key: KEY, valid: false, lastCheck: 0 });
    expect(next.valid).toBe(false);
  });

  it('advances lastCheck on a successful revalidation', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { valid: true }));
    const now = Date.now();
    expect((await revalidate(stored(), now)).lastCheck).toBe(now);
  });
});

describe('findLicenseKey', () => {
  it('finds the key in a realistic Lemon Squeezy success payload', () => {
    const payload = {
      order: {
        data: {
          id: '123',
          attributes: { total: 2900, user_email: 'a@b.com' },
        },
      },
      meta: { test_mode: true },
      license_key: { key: KEY, status: 'active' },
    };
    expect(findLicenseKey(payload)).toBe(KEY);
  });

  it('finds the key after the vendor reshuffles the payload shape', () => {
    // The point of searching rather than hard-coding a path: a reshuffle
    // breaks a hard-coded path silently, and the buyer sees nothing happen.
    expect(findLicenseKey({ data: { attributes: { licenseKey: KEY } } })).toBe(KEY);
    expect(findLicenseKey({ a: { b: { c: [{ license: { key: KEY } }] }, d: 1 } })).toBe(KEY);
  });

  it('ignores UUIDs that are not under a licence-ish field', () => {
    expect(findLicenseKey({ order_id: KEY, customer_uuid: KEY })).toBeNull();
  });

  it('returns null rather than throwing on a cyclic payload', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(findLicenseKey(a)).toBeNull();
  });

  it('returns null for junk', () => {
    expect(findLicenseKey(null)).toBeNull();
    expect(findLicenseKey('nope')).toBeNull();
  });
});
