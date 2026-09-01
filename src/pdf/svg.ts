import { PAGE, type LaidOutPage, type Op } from './layout';

/**
 * Renders laid-out pages to SVG for the on-screen preview.
 *
 * SVG rather than styled HTML because the layout model is already in
 * millimetres: an SVG with viewBox="0 0 210 297" *is* an A4 page, so "true to
 * scale" is free and zooming stays crisp. It also means the preview consumes
 * the exact same op list the PDF exporter consumes — there is no second layout
 * pass that could disagree with the file the customer downloads.
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const anchor = (a: 'left' | 'right' | 'center'): string =>
  a === 'right' ? 'end' : a === 'center' ? 'middle' : 'start';

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

function opToSvg(op: Op): string {
  switch (op.t) {
    case 'text': {
      const weight = op.weight === 'bold' ? ' font-weight="700"' : '';
      const style = op.weight === 'italic' ? ' font-style="italic"' : '';
      // Sizes in the layout model are points; 1pt = 25.4/72 mm and the SVG user
      // unit is a millimetre.
      const sizeMm = op.size * (25.4 / 72);
      const tracking = op.tracking ? ` letter-spacing="${n(op.tracking)}"` : '';
      const opacity = op.opacity !== undefined ? ` fill-opacity="${n(op.opacity)}"` : '';
      return (
        `<text x="${n(op.x)}" y="${n(op.y)}" font-size="${n(sizeMm)}" fill="${op.color}"` +
        ` text-anchor="${anchor(op.align)}"${weight}${style}${tracking}${opacity}` +
        ` xml:space="preserve">${esc(op.text)}</text>`
      );
    }
    case 'line':
      return (
        `<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}"` +
        ` stroke="${op.color}" stroke-width="${n(op.w)}" />`
      );
    case 'rect': {
      const fill = op.fill ? `fill="${op.fill}"` : 'fill="none"';
      const stroke = op.stroke ? ` stroke="${op.stroke}" stroke-width="${n(op.strokeW ?? 0.2)}"` : '';
      return `<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" ${fill}${stroke} />`;
    }
    case 'image':
      return (
        `<image x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}"` +
        ` preserveAspectRatio="xMinYMid meet" href="${esc(op.src)}" />`
      );
    case 'path': {
      const pts = op.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
      return (
        `<polyline points="${pts}" fill="none" stroke="${op.color}"` +
        ` stroke-width="${n(op.w)}" stroke-linecap="round" stroke-linejoin="round" />`
      );
    }
  }
}

export function pageToSvg(page: LaidOutPage): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}"` +
    ` width="100%" style="display:block;background:#fff"` +
    ` font-family="Helvetica, Arial, 'Liberation Sans', sans-serif">` +
    `<rect x="0" y="0" width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff" />` +
    page.ops.map(opToSvg).join('') +
    `</svg>`
  );
}
