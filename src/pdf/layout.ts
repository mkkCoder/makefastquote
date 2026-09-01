import type { DocumentState, Stroke } from '../types';
import { computeTotals, formatMoney } from '../lib/money';
import { TEMPLATES, type Template } from './templates';
import { measureText, wrapText, truncateToWidth, fitFontSize, type FontWeight } from './text';
import { SITE } from '../config';
import { clampScale } from '../lib/logo';
import { isHexColor, mixHex } from '../lib/color';

/**
 * THE SINGLE SOURCE OF LAYOUT TRUTH.
 *
 * This module turns a DocumentState into a list of primitive drawing
 * operations in millimetres on an A4 page. The on-screen preview renders these
 * ops to SVG; the exporter renders the same ops to a PDF with jsPDF.
 *
 * That is the whole reason the preview can be trusted. The usual approach —
 * style a DOM node, then screenshot it into a PDF — gives you two renderers
 * with two layout engines and a PDF whose text is a picture of text: not
 * selectable, not searchable, several megabytes. On an invoice that means the
 * client cannot copy your bank details or your reference number.
 *
 * If you add a visual feature, add it here, once. Never draw directly in
 * either renderer.
 */

export const PAGE = { w: 210, h: 297 } as const;
export const MARGIN = { top: 18, right: 16, bottom: 18, left: 16 } as const;
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;

export type Align = 'left' | 'right' | 'center';

export type Op =
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      weight: FontWeight;
      color: string;
      align: Align;
      /** Extra letter spacing in mm, used by the tracked-out titles. */
      tracking?: number;
      opacity?: number;
    }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string }
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      strokeW?: number;
    }
  | { t: 'image'; x: number; y: number; w: number; h: number; src: string }
  /** A signature stroke, already mapped into page mm. */
  | { t: 'path'; pts: ReadonlyArray<readonly [number, number]>; w: number; color: string };

export interface LaidOutPage {
  ops: Op[];
}

export interface LayoutResult {
  pages: LaidOutPage[];
}

export interface LayoutInput {
  doc: DocumentState;
  /** Drives the credit line and paid branding in the exported file. */
  isPro: boolean;
  /**
   * The on-screen canvas may preview a logo and brand colour for free users.
   * The PDF path never sets this, so the file stays gated. See the note on
   * the gate at the bottom of this file.
   */
  preview?: boolean;
}

function resolveTemplate(doc: DocumentState, branded: boolean): Template {
  const tpl = { ...TEMPLATES[doc.template] };
  if (!branded || !isHexColor(doc.brandColor)) return tpl;
  const accent = doc.brandColor;
  return {
    ...tpl,
    accent,
    bandFill: tpl.bandHeight > 0 ? accent : tpl.bandFill,
    headFill: tpl.headFill ? mixHex(accent, '#ffffff', 0.88) : tpl.headFill,
  };
}

const COLUMNS = {
  desc: { x: MARGIN.left, w: 88 },
  qty: { x: MARGIN.left + 92, w: 16 },
  price: { x: MARGIN.left + 112, w: 28 },
  tax: { x: MARGIN.left + 142, w: 16 },
  total: { x: MARGIN.left + 160, w: CONTENT_W - 160 },
} as const;

const rightEdge = (c: { x: number; w: number }) => c.x + c.w;

/** Signature strokes are stored 0..1; map them into a box on the page. */
function strokeToPage(
  stroke: Stroke,
  box: { x: number; y: number; w: number; h: number },
): Array<readonly [number, number]> {
  return stroke.map(([nx, ny]) => [box.x + nx * box.w, box.y + ny * box.h] as const);
}

export function layoutDocument({ doc, isPro, preview = false }: LayoutInput): LayoutResult {
  const branded = isPro || preview;
  const tpl = resolveTemplate(doc, branded);
  const showLogo = Boolean(doc.logo) && branded;
  const pages: LaidOutPage[] = [];
  let ops: Op[] = [];
  // Annotated: MARGIN is `as const`, so an inferred `y` would be the literal
  // type 18 and every later assignment a type error.
  let y: number = MARGIN.top;

  const newPage = () => {
    pages.push({ ops });
    ops = [];
    y = MARGIN.top;
  };

  const text = (
    t: string,
    x: number,
    yy: number,
    size: number,
    opts: Partial<{
      weight: FontWeight;
      color: string;
      align: Align;
      tracking: number;
      opacity: number;
    }> = {},
  ) => {
    ops.push({
      t: 'text',
      x,
      y: yy,
      text: t,
      size,
      weight: opts.weight ?? 'normal',
      color: opts.color ?? tpl.ink,
      align: opts.align ?? 'left',
      ...(opts.tracking !== undefined ? { tracking: opts.tracking } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    });
  };

  const rule = (
    yy: number,
    weight: number = tpl.rule,
    color: string = tpl.accent,
    from: number = MARGIN.left,
    to: number = PAGE.w - MARGIN.right,
  ) => {
    ops.push({ t: 'line', x1: from, y1: yy, x2: to, y2: yy, w: weight, color });
  };

  // ---------------------------------------------------------------- page 1

  if (tpl.bandHeight > 0) {
    ops.push({ t: 'rect', x: 0, y: 0, w: PAGE.w, h: tpl.bandHeight, fill: tpl.bandFill });
    y = Math.max(y, tpl.bandHeight + 12);
  }

  // Issuer identity block, top-left. Logo is a Pro feature; the free tier gets
  // the business name set large, which is a real design, not a punishment.
  const identityTop = y;
  let identityBottom: number;

  if (showLogo && doc.logo) {
    const aspect =
      Number.isFinite(doc.logoAspect) && doc.logoAspect && doc.logoAspect > 0 ? doc.logoAspect : 2.5;
    const scale = clampScale(doc.logoScale);
    const maxH = 16 * scale;
    const maxW = 52 * scale;
    let h = maxH;
    let w = h * aspect;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    const colW = CONTENT_W * 0.5;
    let x = MARGIN.left;
    if (doc.logoAlign === 'center') x = MARGIN.left + Math.max(0, (colW - w) / 2);
    if (doc.logoAlign === 'right') x = MARGIN.left + Math.max(0, colW - w);
    ops.push({ t: 'image', x, y, w, h, src: doc.logo });
    identityBottom = y + h + 4;
  } else {
    const name = doc.issuer.name || 'Your business';
    // Fit, do not guess: a long business name must not run into the title.
    const size = fitFontSize(name, CONTENT_W * 0.52, 15);
    text(name, MARGIN.left, y + 5, size, { weight: 'bold' });
    identityBottom = y + 9;
  }

  const issuerLines = [
    showLogo ? doc.issuer.name : '',
    doc.issuer.contact,
    doc.issuer.email,
    doc.issuer.phone,
    doc.issuer.taxId ? `Tax ID ${doc.issuer.taxId}` : '',
    doc.issuer.bank,
    ...(doc.issuer.address ? doc.issuer.address.split(/\r?\n/) : []),
  ].filter(Boolean);

  let iy = identityBottom + 1;
  for (const line of issuerLines) {
    text(truncateToWidth(line, CONTENT_W * 0.5, 8.5), MARGIN.left, iy, 8.5, { color: tpl.muted });
    iy += 4;
  }

  // Title + metadata, top-right.
  const title = doc.kind === 'invoice' ? 'Invoice' : 'Proposal';
  const titleText = tpl.titleUpper ? title.toUpperCase() : title;
  text(titleText, PAGE.w - MARGIN.right, identityTop + 7, tpl.titleSize, {
    weight: tpl.titleWeight,
    color: tpl.accent,
    align: 'right',
    tracking: tpl.titleTracking,
  });

  const meta: Array<[string, string]> = [
    ['Reference', doc.reference || '—'],
    [doc.kind === 'invoice' ? 'Issued' : 'Date', doc.issueDate || '—'],
    [doc.kind === 'invoice' ? 'Due' : 'Valid until', doc.dueDate || '—'],
  ];
  let my = identityTop + 14;
  for (const [label, value] of meta) {
    text(label, PAGE.w - MARGIN.right - 32, my, 8, {
      color: tpl.muted,
      align: 'right',
      weight: tpl.labelStyle === 'italic' ? 'italic' : 'normal',
    });
    text(truncateToWidth(value, 30, 8.5), PAGE.w - MARGIN.right, my, 8.5, { align: 'right' });
    my += 4.6;
  }

  y = Math.max(iy, my) + 6;

  if (tpl.id === 'classic') {
    rule(y, tpl.rule);
    rule(y + 0.9, tpl.rule * 0.4);
    y += 8;
  } else {
    rule(y, tpl.rule);
    y += 8;
  }

  // Client block.
  text(doc.kind === 'invoice' ? 'Bill to' : 'Prepared for', MARGIN.left, y, 8, {
    color: tpl.muted,
    weight: tpl.labelStyle === 'italic' ? 'italic' : 'normal',
  });
  y += 5;
  const clientLines = [
    doc.client.name,
    doc.client.contact,
    doc.client.email,
    doc.client.phone,
    ...(doc.client.address ? doc.client.address.split(/\r?\n/) : []),
  ].filter(Boolean);
  if (clientLines.length === 0) clientLines.push('—');

  const clientHeadSize = 11;
  const firstClientLine = clientLines[0] ?? '—';
  text(truncateToWidth(firstClientLine, CONTENT_W * 0.55, clientHeadSize, 'bold'), MARGIN.left, y, clientHeadSize, {
    weight: 'bold',
  });
  y += 5;
  for (const line of clientLines.slice(1)) {
    text(truncateToWidth(line, CONTENT_W * 0.55, 8.5), MARGIN.left, y, 8.5, { color: tpl.muted });
    y += 4;
  }
  y += 6;

  // ------------------------------------------------------------ line items

  const ROW_MIN_H = 7;
  const HEAD_H = 8;
  const FOOTER_RESERVE = 14;

  const drawTableHead = () => {
    if (tpl.headFill) {
      ops.push({
        t: 'rect',
        x: MARGIN.left,
        y: y - 5.2,
        w: CONTENT_W,
        h: HEAD_H,
        fill: tpl.headFill,
      });
    }
    text('Description', COLUMNS.desc.x + (tpl.headFill ? 2 : 0), y, 8, {
      weight: 'bold',
      color: tpl.ink,
    });
    text('Qty', rightEdge(COLUMNS.qty), y, 8, { weight: 'bold', color: tpl.ink, align: 'right' });
    text('Unit', rightEdge(COLUMNS.price), y, 8, {
      weight: 'bold',
      color: tpl.ink,
      align: 'right',
    });
    text('Tax', rightEdge(COLUMNS.tax), y, 8, { weight: 'bold', color: tpl.ink, align: 'right' });
    text('Amount', rightEdge(COLUMNS.total), y, 8, {
      weight: 'bold',
      color: tpl.ink,
      align: 'right',
    });
    y += 3;
    rule(y, tpl.rule);
    y += 5;
  };

  drawTableHead();

  const items = doc.items.length > 0 ? doc.items : [];
  let zebraIndex = 0;

  for (const item of items) {
    const descLines = wrapText(item.description || '—', COLUMNS.desc.w - 2, 9);
    const rowH = Math.max(ROW_MIN_H, descLines.length * 4.2 + 2.8);

    if (y + rowH > PAGE.h - MARGIN.bottom - FOOTER_RESERVE) {
      newPage();
      drawTableHead();
    }

    if (tpl.zebra && zebraIndex % 2 === 1) {
      ops.push({
        t: 'rect',
        x: MARGIN.left,
        y: y - 4.4,
        w: CONTENT_W,
        h: rowH,
        fill: tpl.zebra,
      });
    }
    zebraIndex++;

    let dy = y;
    for (const line of descLines) {
      text(line, COLUMNS.desc.x + (tpl.headFill ? 2 : 0), dy, 9);
      dy += 4.2;
    }

    const net = Math.round(item.qty * item.unitPrice * 100);
    text(formatQty(item.qty), rightEdge(COLUMNS.qty), y, 9, { align: 'right' });
    text(formatMoney(Math.round(item.unitPrice * 100), doc.currency), rightEdge(COLUMNS.price), y, 9, {
      align: 'right',
    });
    text(item.taxRate ? `${trimNum(item.taxRate)}%` : '—', rightEdge(COLUMNS.tax), y, 9, {
      align: 'right',
      color: item.taxRate ? tpl.ink : tpl.muted,
    });
    text(formatMoney(net, doc.currency), rightEdge(COLUMNS.total), y, 9, {
      align: 'right',
      weight: 'bold',
    });

    y += rowH;
  }

  if (items.length === 0) {
    text('No line items yet.', COLUMNS.desc.x, y, 9, { color: tpl.muted });
    y += ROW_MIN_H;
  }

  // ---------------------------------------------------------------- totals

  const totals = computeTotals(doc.items, doc.discount);
  const totalsRows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(totals.subtotal, doc.currency), false],
  ];
  if (totals.discount > 0) {
    totalsRows.push([
      `Discount (${trimNum(doc.discount)}%)`,
      `-${formatMoney(totals.discount, doc.currency)}`,
      false,
    ]);
  }
  for (const t of totals.taxByRate) {
    totalsRows.push([`Tax ${trimNum(t.rate)}%`, formatMoney(t.amount, doc.currency), false]);
  }
  totalsRows.push([
    doc.kind === 'invoice' ? 'Total due' : 'Total',
    formatMoney(totals.total, doc.currency),
    true,
  ]);

  const totalsH = totalsRows.length * 5.6 + 6;
  if (y + totalsH > PAGE.h - MARGIN.bottom - FOOTER_RESERVE) newPage();

  y += 2;
  rule(y, tpl.rule, tpl.accent, PAGE.w - MARGIN.right - 78, PAGE.w - MARGIN.right);
  y += 6;

  for (const [label, value, strong] of totalsRows) {
    if (strong) {
      y += 1.5;
      rule(y - 4.6, tpl.rule, tpl.accent, PAGE.w - MARGIN.right - 78, PAGE.w - MARGIN.right);
    }
    text(label, PAGE.w - MARGIN.right - 40, y, strong ? 10.5 : 9, {
      align: 'right',
      color: strong ? tpl.accent : tpl.muted,
      weight: strong ? 'bold' : 'normal',
    });
    text(value, PAGE.w - MARGIN.right, y, strong ? 12 : 9, {
      align: 'right',
      weight: strong ? 'bold' : 'normal',
      color: strong ? tpl.accent : tpl.ink,
    });
    y += strong ? 7 : 5.6;
  }

  y += 6;

  // ----------------------------------------------------------- notes + sig

  const notesLines = doc.notes ? wrapText(doc.notes, CONTENT_W * 0.58, 8.5) : [];
  const sigBoxH = 20;
  const blockH = Math.max(notesLines.length * 4 + 10, sigBoxH + 12);

  if (y + blockH > PAGE.h - MARGIN.bottom - FOOTER_RESERVE) newPage();

  if (notesLines.length) {
    text(doc.kind === 'invoice' ? 'Payment terms' : 'Notes & terms', MARGIN.left, y, 8, {
      color: tpl.muted,
      weight: tpl.labelStyle === 'italic' ? 'italic' : 'normal',
    });
    let ny = y + 5;
    for (const line of notesLines) {
      text(line, MARGIN.left, ny, 8.5, { color: tpl.ink });
      ny += 4;
    }
  }

  const sigX = PAGE.w - MARGIN.right - 62;
  const sigBox = { x: sigX, y: y + 2, w: 62, h: sigBoxH };

  if (doc.signatureImage) {
    // An uploaded signature wins over drawn strokes — the form only lets one
    // be active, and honouring both would stack two signatures on the line.
    //
    // Fitted by hand rather than left to the renderer: SVG's preserveAspectRatio
    // and jsPDF's addImage do NOT agree about how to letterbox an image into a
    // box, so leaving it to them makes the preview and the PDF disagree about
    // where the signature sits. Computing the exact rectangle here means both
    // renderers are just told where to put it.
    const aspect = Number.isFinite(doc.signatureImage.aspect) && doc.signatureImage.aspect > 0
      ? doc.signatureImage.aspect
      : 1;
    let iw = sigBox.w;
    let ih = iw / aspect;
    if (ih > sigBox.h) {
      ih = sigBox.h;
      iw = ih * aspect;
    }
    ops.push({
      t: 'image',
      // Centred over the line, and sitting ON it rather than floating.
      x: sigBox.x + (sigBox.w - iw) / 2,
      y: sigBox.y + (sigBox.h - ih),
      w: iw,
      h: ih,
      src: doc.signatureImage.src,
    });
  } else if (doc.signature.length > 0) {
    for (const stroke of doc.signature) {
      if (stroke.length < 2) continue;
      ops.push({
        t: 'path',
        pts: strokeToPage(stroke, sigBox),
        w: 0.45,
        color: tpl.ink,
      });
    }
  }
  ops.push({
    t: 'line',
    x1: sigX,
    y1: sigBox.y + sigBoxH + 1,
    x2: PAGE.w - MARGIN.right,
    y2: sigBox.y + sigBoxH + 1,
    w: 0.3,
    color: tpl.muted,
  });
  text(doc.signatureName || doc.issuer.name || 'Signature', PAGE.w - MARGIN.right, sigBox.y + sigBoxH + 5.5, 8, {
    align: 'right',
    color: tpl.muted,
  });

  pages.push({ ops });

  // ---------------------------------------------------------------- footer
  //
  // THE GATE LIVES HERE, INSIDE THE GENERATING CODE.
  //
  // The free credit line is emitted by the same function that draws the
  // document, for both the preview and the PDF. It is not a DOM overlay hidden
  // by a CSS class, and it is not stripped by the export path. A free user sees
  // on screen exactly the document they will get in the file, and flipping a
  // boolean in devtools does not produce a clean PDF — it produces a clean
  // preview of a document this function still stamps.
  //
  // Say the quiet part: this gate is client-side and anyone with a console can
  // set isPro. That is the deliberate trade for having no backend, no accounts
  // and no server bill. Spend zero hours on obfuscation; the people who would
  // bypass it were never going to pay $29.

  const footerY = PAGE.h - MARGIN.bottom + 6;
  pages.forEach((page, i) => {
    const pageOps = page.ops;
    if (pages.length > 1) {
      pageOps.push({
        t: 'text',
        x: PAGE.w - MARGIN.right,
        y: footerY,
        text: `Page ${i + 1} of ${pages.length}`,
        size: 7.5,
        weight: 'normal',
        color: tpl.muted,
        align: 'right',
      });
    }
    if (!isPro || doc.showCredit) {
      const credit = `Made with ${SITE.domain}`;
      // Fit the credit line rather than trusting a hardcoded size: the domain
      // is a variable, and the day it gets longer this would silently overrun.
      const size = fitFontSize(credit, 60, 7.5);
      pageOps.push({
        t: 'text',
        x: MARGIN.left,
        y: footerY,
        text: credit,
        size,
        weight: 'normal',
        color: tpl.muted,
        align: 'left',
        opacity: 0.75,
      });
    }
  });

  return { pages };
}

function trimNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

/** Exported for the contrast audit and for tests. */
export { measureText, CONTENT_W };
