import { useMemo } from 'react';
import { useApp } from '../store';
import { layoutDocument } from '../pdf/layout';
import { pageToSvg } from '../pdf/svg';

/**
 * The A4 preview.
 *
 * It renders the very same op list the PDF exporter renders, so what is on
 * screen is not an approximation of the file — it is the file, drawn with a
 * different backend. Including the free-tier credit line, which is emitted by
 * the layout function rather than overlaid here.
 */
export function Preview() {
  const doc = useApp((s) => s.doc);
  const isPro = useApp((s) => s.isPro);

  const pages = useMemo(() => {
    const { pages } = layoutDocument({ doc, isPro });
    return pages.map(pageToSvg);
  }, [doc, isPro]);

  return (
    <div className="flex flex-col gap-5" data-testid="preview">
      {pages.map((svg, i) => (
        <div
          key={i}
          className="sheet"
          data-testid={`preview-page-${i + 1}`}
          // The SVG is built from our own layout model with all text escaped in
          // svg.ts. No user string reaches this as markup.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ))}
      <p className="text-xs text-faint text-center">
        {pages.length === 1 ? '1 page' : `${pages.length} pages`} · A4 · exports as real,
        searchable text
      </p>
    </div>
  );
}
