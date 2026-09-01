/**
 * Stands in for html2canvas, dompurify and canvg, which jsPDF imports
 * statically for its `.html()` path.
 *
 * We draw the PDF vectorially from the layout model and never call `.html()`,
 * so shipping those three to every visitor costs ~58 kB gzipped for code that
 * never runs. The aliases live in vite.config.ts.
 *
 * This throws rather than returning undefined so that if someone ever does
 * wire up a `.html()` call, it fails loudly in development instead of
 * producing a mysteriously blank PDF in production.
 */
const explain = () =>
  new Error(
    'html2canvas/dompurify/canvg are deliberately stubbed out (see vite.config.ts). ' +
      'This app draws PDFs vectorially via src/pdf/render.ts and must not use jsPDF.html().',
  );

const handler: ProxyHandler<() => never> = {
  get: () => {
    throw explain();
  },
  apply: () => {
    throw explain();
  },
  construct: () => {
    throw explain();
  },
};

const stub = new Proxy((() => {
  throw explain();
}) as () => never, handler);

export default stub;
export const sanitize = stub;
