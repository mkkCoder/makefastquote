import { describe, expect, it } from 'vitest';
import { extractInk, type Bitmap } from '../lib/signature';

/** Builds a synthetic image: `paint(x, y)` returns [r, g, b]. */
function bitmap(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): Bitmap {
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

const alphaAt = (bm: Bitmap, x: number, y: number): number =>
  bm.data[(y * bm.width + x) * 4 + 3] ?? 0;
const rgbAt = (bm: Bitmap, x: number, y: number): [number, number, number] => {
  const p = (y * bm.width + x) * 4;
  return [bm.data[p] ?? 0, bm.data[p + 1] ?? 0, bm.data[p + 2] ?? 0];
};

/** White paper with a dark horizontal stroke across the middle third. */
const paperWithStroke = (w = 80, h = 60, paper = 245, ink = 30) =>
  bitmap(w, h, (x, y) => {
    const onStroke = y >= 28 && y <= 32 && x >= 20 && x <= 60;
    const v = onStroke ? ink : paper;
    return [v, v, v];
  });

describe('extractInk', () => {
  it('makes the paper fully transparent and keeps the ink opaque', () => {
    // This is the whole feature: a photographed signature carries its paper
    // with it, and pasting an opaque rectangle onto an invoice looks broken.
    const out = extractInk(paperWithStroke());
    expect(out).not.toBeNull();

    // After cropping, the stroke fills the result; sample its middle.
    const cx = Math.floor(out!.width / 2);
    const cy = Math.floor(out!.height / 2);
    expect(alphaAt(out!, cx, cy)).toBeGreaterThan(200);

    // The padding ring around the crop is paper, and must be see-through.
    expect(alphaAt(out!, 0, 0)).toBe(0);
  });

  it('crops to the ink instead of keeping the whole sheet', () => {
    // Without cropping, a signature photographed on A4 arrives as a stamp in
    // the middle of a mostly-empty image and prints microscopically small.
    const out = extractInk(paperWithStroke(80, 60));
    expect(out).not.toBeNull();
    // Stroke is 41x5 px; allow the 2px padding on each side.
    expect(out!.width).toBeLessThanOrEqual(41 + 4);
    expect(out!.height).toBeLessThanOrEqual(5 + 4);
    expect(out!.width).toBeGreaterThanOrEqual(41);
  });

  it('preserves the pen colour rather than forcing everything to black', () => {
    const blue = bitmap(60, 40, (x, y) => {
      const onStroke = y >= 18 && y <= 22 && x >= 10 && x <= 50;
      return onStroke ? [20, 30, 160] : [246, 246, 248];
    });
    const out = extractInk(blue)!;
    const [r, g, b] = rgbAt(out, Math.floor(out.width / 2), Math.floor(out.height / 2));
    expect(b).toBeGreaterThan(r + 60);
    expect(b).toBeGreaterThan(g + 60);
  });

  it('ramps alpha at the stroke edge rather than hard-thresholding', () => {
    // A hard cutoff makes the signature look like a fax. A mid-grey pixel
    // should come out partly transparent, not fully on or fully off.
    const soft = bitmap(60, 40, (x, y) => {
      if (y >= 18 && y <= 22 && x >= 10 && x <= 50) return [20, 20, 20]; // core
      if (y >= 16 && y <= 24 && x >= 8 && x <= 52) return [140, 140, 140]; // edge
      return [246, 246, 248];
    });
    const out = extractInk(soft)!;
    const alphas = new Set<number>();
    for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i] ?? 0);
    const partial = [...alphas].filter((a) => a > 10 && a < 245);
    expect(partial.length).toBeGreaterThan(0);
  });

  it('returns null for a blank page rather than a rectangle of noise', () => {
    expect(extractInk(bitmap(40, 40, () => [250, 250, 250]))).toBeNull();
  });

  it('returns null when ink and paper are the same brightness', () => {
    // A washed-out photo. Guessing here would produce a grey smear that the
    // user then has to notice on their own invoice.
    expect(extractInk(bitmap(40, 40, (x) => (x < 20 ? [128, 128, 128] : [138, 138, 138])))).toBeNull();
  });

  it('handles an empty image without throwing', () => {
    expect(extractInk({ data: new Uint8ClampedArray(new ArrayBuffer(0)), width: 0, height: 0 })).toBeNull();
  });

  it('survives a photo with an uneven background', () => {
    // A phone photo has a shadow gradient across the paper. The stroke must
    // still be found, and the lighter paper must still drop out.
    const shadowed = bitmap(90, 60, (x, y) => {
      const onStroke = y >= 28 && y <= 32 && x >= 20 && x <= 70;
      if (onStroke) return [25, 25, 25];
      const shade = 250 - Math.round((x / 90) * 45); // 250 → 205 across the sheet
      return [shade, shade, shade];
    });
    const out = extractInk(shadowed);
    expect(out).not.toBeNull();
    expect(alphaAt(out!, Math.floor(out!.width / 2), Math.floor(out!.height / 2))).toBeGreaterThan(
      200,
    );
    expect(out!.height).toBeLessThan(20);
  });

  it('flattens the colour of fully transparent pixels so the PNG compresses', () => {
    // Keeping the paper's RGB behind alpha=0 means PNG still encodes a shadow
    // gradient it can never show. That pushed a normal phone photo past the
    // size guard and the import failed outright. Transparent pixels must all
    // carry the same colour.
    const out = extractInk(paperWithStroke(90, 70))!;
    const seen = new Set<string>();
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) seen.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`);
    }
    expect(seen.size).toBeLessThanOrEqual(1);
  });

  it('fills transparent pixels with the ink colour, not black or white', () => {
    // Renderers that interpolate in straight alpha pull neighbouring RGB into
    // the soft edge of a stroke; a black or white fringe around handwriting is
    // the artefact that makes a signature look pasted on.
    const blue = bitmap(60, 40, (x, y) => {
      const onStroke = y >= 18 && y <= 22 && x >= 10 && x <= 50;
      return onStroke ? [20, 30, 160] : [246, 246, 248];
    });
    const out = extractInk(blue)!;
    let fill: [number, number, number] | null = null;
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) {
        fill = [out.data[i] ?? 0, out.data[i + 1] ?? 0, out.data[i + 2] ?? 0];
        break;
      }
    }
    expect(fill).not.toBeNull();
    const [r, g, b] = fill!;
    expect(b).toBeGreaterThan(r + 40); // it is the blue ink, not #000 or #fff
    expect(b).toBeGreaterThan(g + 40);
  });

  it('finds a small signature on a large sheet', () => {
    // THE REGRESSION THIS PINS: the first implementation took "the darkest 4%
    // of pixels" as ink. A signature photographed on a full sheet is one or
    // two percent of the image, so that percentile landed in the paper, ink
    // and paper came out identical, and a perfectly good photo was rejected
    // with "no signature found". Otsu's method has no such assumption.
    const big = bitmap(400, 300, (x, y) => {
      const onStroke = y >= 148 && y <= 152 && x >= 180 && x <= 240;
      const v = onStroke ? 35 : 244;
      return [v, v, v];
    });
    const inkFraction = (5 * 61) / (400 * 300);
    expect(inkFraction).toBeLessThan(0.01); // well under any plausible percentile

    const out = extractInk(big);
    expect(out).not.toBeNull();
    expect(out!.width).toBeLessThan(80); // cropped to the stroke, not the sheet
    expect(alphaAt(out!, Math.floor(out!.width / 2), Math.floor(out!.height / 2))).toBeGreaterThan(
      200,
    );
  });

  it('produces an aspect ratio the layout can use', () => {
    const out = extractInk(paperWithStroke())!;
    const aspect = out.width / out.height;
    expect(Number.isFinite(aspect)).toBe(true);
    expect(aspect).toBeGreaterThan(1); // a wide stroke stays wide
  });
});
