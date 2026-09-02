import type { DocumentState } from '../types';
import { layoutDocument, PAGE, type Op } from './layout';
import {
  UNICODE_FONT,
  addUnicodeFonts,
  needsUnicodeFont,
  patchCidOrdering,
} from './unicodeFont';
import regularUrl from './fonts/NotoSansHebrew-Regular.ttf?url';
import boldUrl from './fonts/NotoSansHebrew-Bold.ttf?url';

/**
 * Renders the shared layout model to a real PDF.
 *
 * jsPDF is dynamically imported: it is by far the heaviest thing in the app
 * (~90 kB gzipped after the html2canvas/dompurify aliases) and most sessions —
 * every visitor who lands, looks and leaves — never trigger an export. Loading
 * it up front would make the first paint slower for everyone to save one
 * click's latency for a few.
 *
 * Latin-only documents still use the built-in Helvetica faces (no font file).
 * Hebrew cannot be encoded in WinAnsi — those documents embed Noto Sans Hebrew
 * on export, lazily, the same way jsPDF itself is lazy.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

const styleFor = (w: 'normal' | 'bold' | 'italic'): string =>
  w === 'bold' ? 'bold' : w === 'italic' ? 'italic' : 'normal';

type PdfDoc = import('jspdf').jsPDF;

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function unicodeFontBytes(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetch(regularUrl).then((r) => r.arrayBuffer()),
    fetch(boldUrl).then((r) => r.arrayBuffer()),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

function fontFor(
  op: Extract<Op, { t: 'text' }>,
  useUnicode: boolean,
): { family: string; style: string } {
  const unicode = useUnicode || needsUnicodeFont(op.text);
  if (!unicode) return { family: 'helvetica', style: styleFor(op.weight) };
  return { family: UNICODE_FONT, style: op.weight === 'bold' ? 'bold' : 'normal' };
}

function drawOp(pdf: PdfDoc, op: Op, useUnicode: boolean): void {
  switch (op.t) {
    case 'text': {
      const [r, g, b] = hexToRgb(op.color);
      const { family, style } = fontFor(op, useUnicode);
      pdf.setTextColor(r, g, b);
      pdf.setFont(family, style);
      pdf.setFontSize(op.size);
      if (op.tracking) pdf.setCharSpace(op.tracking);
      if (op.opacity !== undefined && op.opacity < 1) {
        pdf.saveGraphicsState();
        pdf.setGState(pdf.GState({ opacity: op.opacity }));
      }
      pdf.text(op.text, op.x, op.y, {
        align: op.align,
        baseline: 'alphabetic',
      });
      if (op.opacity !== undefined && op.opacity < 1) pdf.restoreGraphicsState();
      if (op.tracking) pdf.setCharSpace(0);
      break;
    }
    case 'line': {
      const [r, g, b] = hexToRgb(op.color);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(op.w);
      pdf.line(op.x1, op.y1, op.x2, op.y2);
      break;
    }
    case 'rect': {
      if (op.fill) {
        const [r, g, b] = hexToRgb(op.fill);
        pdf.setFillColor(r, g, b);
      }
      if (op.stroke) {
        const [r, g, b] = hexToRgb(op.stroke);
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(op.strokeW ?? 0.2);
      }
      const mode = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
      pdf.rect(op.x, op.y, op.w, op.h, mode);
      break;
    }
    case 'image': {
      try {
        const fmt = op.src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(op.src, fmt, op.x, op.y, op.w, op.h, undefined, 'FAST');
      } catch {
        // A corrupt or unsupported logo must never take the whole export down.
        // The document is still worth having without it.
      }
      break;
    }
    case 'path': {
      if (op.pts.length < 2) break;
      const [r, g, b] = hexToRgb(op.color);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(op.w);
      pdf.setLineCap('round');
      pdf.setLineJoin('round');
      for (let i = 1; i < op.pts.length; i++) {
        const a = op.pts[i - 1];
        const c = op.pts[i];
        if (!a || !c) continue;
        pdf.line(a[0], a[1], c[0], c[1]);
      }
      break;
    }
  }
}

export interface RenderOptions {
  doc: DocumentState;
  isPro: boolean;
}

export async function buildPdf({ doc, isPro }: RenderOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { pages } = layoutDocument({ doc, isPro });

  const pdf = new jsPDF({
    unit: 'mm',
    format: [PAGE.w, PAGE.h],
    orientation: 'portrait',
    compress: true,
  });

  const ops = pages.flatMap((p) => p.ops);
  const unicodeOps = ops.filter(
    (op): op is Extract<Op, { t: 'text' }> => op.t === 'text' && needsUnicodeFont(op.text),
  );
  const useUnicode = unicodeOps.length > 0;
  if (useUnicode) {
    const { regular, bold } = await unicodeFontBytes();
    addUnicodeFonts(pdf, regular, bold);
  }

  pdf.setProperties({
    title: `${doc.kind === 'invoice' ? 'Invoice' : 'Proposal'} ${doc.reference}`.trim(),
    subject: doc.client.name ? `For ${doc.client.name}` : '',
    author: doc.issuer.name || '',
    creator: 'makefastquote.com',
  });

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage([PAGE.w, PAGE.h], 'portrait');
    for (const op of page.ops) drawOp(pdf, op, useUnicode);
  });

  const raw = pdf.output('arraybuffer');
  const patched = patchCidOrdering(new Uint8Array(raw));
  const copy = new ArrayBuffer(patched.byteLength);
  new Uint8Array(copy).set(patched);
  return new Blob([copy], { type: 'application/pdf' });
}

export function suggestedFilename(doc: DocumentState): string {
  const kind = doc.kind === 'invoice' ? 'Invoice' : 'Proposal';
  const who = (doc.client.name || 'document')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const ref = doc.reference.replace(/[^a-zA-Z0-9-]+/g, '');
  return [kind, who, ref].filter(Boolean).join('-') + '.pdf';
}
