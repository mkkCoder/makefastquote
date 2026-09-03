import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { SITE, STORAGE_KEYS } from '../config';
import { buildPdf, suggestedFilename } from '../pdf/render';
import { downloadBlob, toCsv, toJson } from '../lib/exportData';
import { IconDownload, IconHistory, IconMoon, IconSave, IconSun, IconTable } from './Icons';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage disabled */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Header() {
  const doc = useApp((s) => s.doc);
  const isPro = useApp((s) => s.isPro);
  const saveDraft = useApp((s) => s.saveDraft);
  const saveNotice = useApp((s) => s.saveNotice);
  const openUpgrade = useApp((s) => s.openUpgrade);
  const setHistoryOpen = useApp((s) => s.setHistoryOpen);

  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [exporting, setExporting] = useState(false);
  const [dataMenu, setDataMenu] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* storage disabled */
    }
  }, [theme]);

  const downloadPdf = async () => {
    if (!isPro && (doc.logo || doc.brandColor)) {
      openUpgrade('logo-export');
      return;
    }
    setExporting(true);
    try {
      const blob = await buildPdf({ doc, isPro });
      downloadBlob(blob, suggestedFilename(doc));
    } catch (err) {
      console.error('PDF export failed', err);
      alert('Something went wrong building the PDF. Your work is saved — please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-panel/90 backdrop-blur border-b border-edge">
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-3">
        {/* Relative: the app lives at <base>/app/, so "../" is the landing
            page whether the site is served from an apex domain or a subpath. */}
        <a href="../" className="flex items-center gap-2 shrink-0" aria-label={`${SITE.name} home`}>
          <span
            aria-hidden
            className="w-7 h-7 rounded-lg bg-brand text-brand-ink grid place-items-center font-bold text-sm"
          >
            Q
          </span>
          <span className="font-bold text-sm hidden sm:block">{SITE.domain}</span>
        </a>

        <nav
          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-faint"
          aria-label="Legal"
        >
          <a href="../privacy.html" className="hover:text-ink underline-offset-2 hover:underline">
            Privacy
          </a>
          <span aria-hidden>·</span>
          <a href="../terms.html" className="hover:text-ink underline-offset-2 hover:underline">
            Terms
          </a>
          <span aria-hidden>·</span>
          <a href="../contact.html" className="hover:text-ink underline-offset-2 hover:underline">
            Contact
          </a>
        </nav>

          {saveNotice && (
          <span className="text-xs font-semibold text-accent hidden md:block" role="status">
            {saveNotice}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost hidden sm:inline-flex"
            onClick={saveDraft}
            data-testid="save-draft"
          >
            <IconSave className="w-3.5 h-3.5" />
            Save draft
          </button>

          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={() => setHistoryOpen(true)}
            data-testid="history-open"
            aria-label="Document history"
          >
            <IconHistory className="w-4 h-4" />
            <span className="hidden md:inline">History</span>
          </button>

          <div className="relative">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDataMenu((v) => !v)}
              aria-label="Export document data"
              aria-expanded={dataMenu}
              aria-haspopup="menu"
              data-testid="data-menu"
            >
              <IconTable className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Data</span>
            </button>
            {dataMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDataMenu(false)} />
                <div
                  role="menu"
                  className="absolute right-0 mt-1 z-20 w-56 bg-panel border border-edge rounded-lg shadow-xl p-1"
                >
                  {/* Free for everyone, always. See lib/exportData.ts. */}
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-brand-soft"
                    data-testid="export-csv"
                    onClick={() => {
                      downloadBlob(
                        new Blob([toCsv(doc)], { type: 'text/csv;charset=utf-8' }),
                        suggestedFilename(doc).replace(/\.pdf$/, '.csv'),
                      );
                      setDataMenu(false);
                    }}
                  >
                    Export as CSV
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-brand-soft"
                    data-testid="export-json"
                    onClick={() => {
                      downloadBlob(
                        new Blob([toJson(doc)], { type: 'application/json' }),
                        suggestedFilename(doc).replace(/\.pdf$/, '.json'),
                      );
                      setDataMenu(false);
                    }}
                  >
                    Export as JSON
                  </button>
                  <p className="text-[11px] text-faint px-3 py-1.5 leading-snug">
                    Your data, free, always — whether or not you buy Pro.
                  </p>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn btn-ghost px-2"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={downloadPdf}
            disabled={exporting}
            data-testid="download-pdf"
          >
            <IconDownload className="w-3.5 h-3.5" />
            {exporting ? 'Building…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </header>
  );
}
