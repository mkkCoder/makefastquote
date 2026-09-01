/**
 * Tiny hex helpers for Pro brand-colour accents on the document.
 * Invalid values fail closed: the template's own palette is used instead.
 */

const HEX = /^#([0-9a-fA-F]{6})$/;

export function isHexColor(v: string | null | undefined): v is string {
  return typeof v === 'string' && HEX.test(v);
}

function parse(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const byte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Mix `hex` toward `toward` by `amount` in 0..1 (1 = fully toward). */
export function mixHex(hex: string, toward: string, amount: number): string {
  const a = parse(hex);
  const b = parse(toward);
  const t = Math.max(0, Math.min(1, amount));
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
