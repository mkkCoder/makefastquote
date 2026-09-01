/**
 * Client-side logo ingest. Rasterises everything to a PNG data URL so the
 * preview SVG and jsPDF see the same pixels (jsPDF does not embed SVG).
 */

const MAX_EDGE = 640;
const MAX_BYTES = 1_500_000;

export class LogoImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoImportError';
  }
}

export interface ProcessedLogo {
  src: string;
  aspect: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoImportError('That file could not be read as an image.'));
    img.src = src;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new LogoImportError('That file could not be read as an image.'));
    };
    reader.onerror = () => reject(new LogoImportError('That file could not be read as an image.'));
    reader.readAsDataURL(file);
  });
}

export async function processLogoFile(file: File): Promise<ProcessedLogo> {
  if (file.size > MAX_BYTES) {
    throw new LogoImportError('That image is over 1.5 MB. Please use a smaller logo.');
  }
  const type = file.type.toLowerCase();
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
    throw new LogoImportError('Use a PNG, JPG, WebP or SVG logo.');
  }
  const dataUrl = await readFile(file);
  return rasteriseLogo(dataUrl);
}

export async function rasteriseLogo(dataUrl: string): Promise<ProcessedLogo> {
  const img = await loadImage(dataUrl);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new LogoImportError('That image has no size.');

  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new LogoImportError('Could not process that image in this browser.');
  ctx.drawImage(img, 0, 0, w, h);

  let src: string;
  try {
    src = canvas.toDataURL('image/png');
  } catch {
    throw new LogoImportError('That image could not be converted.');
  }
  return { src, aspect: w / h };
}

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.8, Math.max(0.5, n));
}
