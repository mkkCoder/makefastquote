/**
 * Best-effort private-browsing detection.
 *
 * There is no standard API. The reliable signal is that writing to
 * localStorage throws (Safari, Chromium incognito when storage is blocked).
 * A false negative is acceptable; a false positive that nags a normal user
 * is not, so we only warn when a write actually fails.
 */
export function isStorageUnusable(): boolean {
  try {
    const k = '__mfq_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return false;
  } catch {
    return true;
  }
}
