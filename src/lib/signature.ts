import type { SignatureImage } from '../types';

/**
 * Turning a photograph of a signature into something you can put on a document.
 *
 * THE PROBLEM THIS SOLVES: people sign a piece of paper and photograph it. That
 * image has a background — white paper, a grey desk, a shadow across one
 * corner. Dropping it straight onto an invoice pastes an opaque rectangle over
 * the page, and it looks exactly as bad as it sounds. Every tool that "supports
 * signature upload" without doing this produces documents with a grey box
 * floating above the signature line.
 *
 * So we separate ink from paper, make the paper transparent, and crop to what
 * is left. All of it in the browser, on a canvas — there is no server to send a
 * photograph of your signature to, which is rather the point of this product.
 */

/** Tunables, named so the test can reason about them. */
const MIN_SEPARATION = 24; // 0..255; below this the image has no usable contrast
const ALPHA_FLOOR = 0.06; // below this, treat as paper — kills JPEG speckle
const CROP_PADDING = 2; // px of breathing room around the ink

/**
 * Splits a luminance histogram into "ink" and "paper" using Otsu's method,
 * returning the mean level of each class.
 *
 * WHY NOT PERCENTILES: the obvious approach is "the darkest 4% is ink, the
 * 60th percentile is paper". That silently breaks on the most ordinary input
 * there is — a signature photographed on a full sheet of paper, where the ink
 * is only one or two percent of the pixels. The 4th percentile then lands in
 * the paper, ink and paper come out identical, and the import reports "no
 * signature found" for a photograph that plainly contains one. Guessing a
 * lower percentile just moves the cliff.
 *
 * Otsu picks the threshold that best separates two classes whatever their
 * relative sizes, which is exactly the property that was missing.
 */
function splitInkAndPaper(histogram: Int32Array, total: number): { ink: number; paper: number } | null {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (histogram[i] ?? 0);

  let sumBelow = 0;
  let countBelow = 0;
  let best = -1;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    countBelow += histogram[t] ?? 0;
    if (countBelow === 0) continue;
    const countAbove = total - countBelow;
    if (countAbove === 0) break;

    sumBelow += t * (histogram[t] ?? 0);
    const meanBelow = sumBelow / countBelow;
    const meanAbove = (sum - sumBelow) / countAbove;
    const between = countBelow * countAbove * (meanBelow - meanAbove) ** 2;

    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  if (best <= 0) return null; // a single-valued image — nothing to separate

  let inkSum = 0;
  let inkN = 0;
  let paperSum = 0;
  let paperN = 0;
  for (let i = 0; i < 256; i++) {
    const n = histogram[i] ?? 0;
    if (i <= threshold) {
      inkSum += i * n;
      inkN += n;
    } else {
      paperSum += i * n;
      paperN += n;
    }
  }
  if (inkN === 0 || paperN === 0) return null;

  return { ink: inkSum / inkN, paper: paperSum / paperN };
}

export interface Bitmap {
  /**
   * Explicitly ArrayBuffer-backed, not ArrayBufferLike. `new ImageData(...)`
   * rejects a SharedArrayBuffer-backed view, and the plain Uint8ClampedArray
   * type is generic over both — so allocating without saying which produces a
   * type error at the one line that has to construct an ImageData.
   */
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

const luminance = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Replaces the background with transparency and crops to the ink.
 *
 * Deliberately a pure function over pixels rather than something that reaches
 * for a canvas, so it can be unit-tested on synthetic images without a DOM and
 * without goldens.
 *
 * The alpha ramp is the important part. A hard threshold ("darker than X is
 * ink") produces a jagged, aliased signature that looks like a fax. Ramping
 * alpha between the ink level and the paper level keeps the soft edges of the
 * pen stroke, so it reads as handwriting rather than a cut-out.
 *
 * Returns null when the image has no usable contrast — a blank page, or a
 * photo so washed out that "ink" and "paper" are the same brightness. Better
 * to say so than to hand back a rectangle of noise.
 */
export function extractInk(input: Bitmap): Bitmap | null {
  const { data, width, height } = input;
  const count = width * height;
  if (count === 0) return null;

  // A 256-bin histogram, which is both cheaper than sorting a 12-megapixel
  // photo and exactly what Otsu's method consumes.
  const histogram = new Int32Array(256);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const lum = luminance(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0);
    histogram[Math.max(0, Math.min(255, Math.round(lum)))]!++;
  }

  const split = splitInkAndPaper(histogram, count);
  if (!split) return null;
  const { ink, paper } = split;

  if (paper - ink < MIN_SEPARATION) return null;

  const out = new Uint8ClampedArray(new ArrayBuffer(data.length));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  // Average pen colour, used to fill the fully-transparent pixels. See below.
  let inkR = 0;
  let inkG = 0;
  let inkB = 0;
  let inkN = 0;

  const alphaOf = (p: number): number => {
    const lum = luminance(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0);
    // 1 at the ink level, 0 at the paper level, ramped in between.
    const a = (paper - lum) / (paper - ink);
    if (a < ALPHA_FLOOR) return 0;
    return a > 1 ? 1 : a;
  };

  // First pass: alpha, bounds, and the average colour of the ink.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const alpha = alphaOf(p);
      out[p + 3] = Math.round(alpha * 255);

      if (alpha > 0.6) {
        inkR += data[p] ?? 0;
        inkG += data[p + 1] ?? 0;
        inkB += data[p + 2] ?? 0;
        inkN++;
      }
      if (alpha > 0.25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const avgR = inkN ? Math.round(inkR / inkN) : 0;
  const avgG = inkN ? Math.round(inkG / inkN) : 0;
  const avgB = inkN ? Math.round(inkB / inkN) : 0;

  // Second pass: colour.
  //
  // Visible pixels keep their original RGB, so a blue pen stays blue.
  //
  // FULLY TRANSPARENT PIXELS ARE FLOODED WITH THE AVERAGE INK COLOUR, and this
  // matters twice over. Leaving the paper's RGB behind means PNG still has to
  // encode the whole shadow gradient it can no longer show — the file came out
  // several hundred kilobytes and tripped the size guard, so the import simply
  // failed. A constant fill compresses to almost nothing. Flooding with the
  // ink colour rather than black or white also avoids a halo: renderers that
  // interpolate in straight alpha pull neighbouring RGB into the soft edge of
  // the stroke, and a black or white fringe around handwriting is exactly the
  // artefact that makes a signature look pasted on.
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) {
      out[i] = avgR;
      out[i + 1] = avgG;
      out[i + 2] = avgB;
    } else {
      out[i] = data[i] ?? 0;
      out[i + 1] = data[i + 1] ?? 0;
      out[i + 2] = data[i + 2] ?? 0;
    }
  }

  if (maxX < 0) return null; // nothing survived — no ink found

  const x0 = Math.max(0, minX - CROP_PADDING);
  const y0 = Math.max(0, minY - CROP_PADDING);
  const x1 = Math.min(width - 1, maxX + CROP_PADDING);
  const y1 = Math.min(height - 1, maxY + CROP_PADDING);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const cropped = new Uint8ClampedArray(new ArrayBuffer(cw * ch * 4));
  for (let y = 0; y < ch; y++) {
    const from = ((y + y0) * width + x0) * 4;
    cropped.set(out.subarray(from, from + cw * 4), y * cw * 4);
  }

  return { data: cropped, width: cw, height: ch };
}

/** Longest edge we keep. A signature is ~60 mm wide in print; this is plenty. */
const MAX_EDGE = 900;
/** Refuse anything that would blow the localStorage quota. */
export const MAX_RESULT_BYTES = 400_000;

export class SignatureImportError extends Error {}

/**
 * Reads a user-supplied image file and returns a clean, transparent,
 * cropped signature ready to place on the document.
 *
 * Throws SignatureImportError with a message written for the person holding
 * the phone, not for a developer.
 */
export async function processSignatureFile(file: File): Promise<SignatureImage> {
  if (!file.type.startsWith('image/')) {
    throw new SignatureImportError('That file is not an image.');
  }

  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new SignatureImportError("That image couldn't be read."));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new SignatureImportError("This browser couldn't process the image.");
  ctx.drawImage(img, 0, 0, w, h);

  let source: ImageData;
  try {
    source = ctx.getImageData(0, 0, w, h);
  } catch {
    // Cross-origin taint. Cannot happen for a file the user picked, but a
    // silent failure here would be baffling.
    throw new SignatureImportError("That image couldn't be read.");
  }

  const ink = extractInk({
    data: source.data as Uint8ClampedArray<ArrayBuffer>,
    width: w,
    height: h,
  });
  if (!ink) {
    throw new SignatureImportError(
      'No signature found in that image — it needs dark ink on a lighter background.',
    );
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = ink.width;
  outCanvas.height = ink.height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new SignatureImportError("This browser couldn't process the image.");
  outCtx.putImageData(new ImageData(ink.data, ink.width, ink.height), 0, 0);

  // PNG, because the whole point is the alpha channel — a JPEG would put the
  // background straight back.
  const src = outCanvas.toDataURL('image/png');

  if (src.length > MAX_RESULT_BYTES) {
    throw new SignatureImportError('That image is too large. Try a smaller or tighter photo.');
  }

  return { src, aspect: ink.width / ink.height };
}
