import { useEffect } from 'react';
import { useApp } from './store';
import { Header } from './components/Header';
import { SidebarTop, SidebarRest } from './components/Sidebar';
import { FormPanel } from './components/FormPanel';
import { Preview } from './components/Preview';
import { UpgradeModal } from './components/UpgradeModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { StorageBanners } from './components/StorageBanners';
import { needsRevalidation, revalidate, takeKeyFromUrl, validateKey } from './lib/license';
import { IconDownload } from './components/Icons';

export default function App() {
  const license = useApp((s) => s.license);
  const setLicense = useApp((s) => s.setLicense);
  const openUpgrade = useApp((s) => s.openUpgrade);
  const tab = useApp((s) => s.workspaceTab);
  const setTab = useApp((s) => s.setWorkspaceTab);

  useEffect(() => {
    let cancelled = false;

    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('upgrade')) {
        openUpgrade('everything below');
        url.searchParams.delete('upgrade');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      /* malformed URL */
    }

    void (async () => {
      const fromUrl = takeKeyFromUrl();
      if (fromUrl) {
        const outcome = await validateKey(fromUrl);
        if (!cancelled && outcome.status === 'valid') {
          setLicense({
            key: fromUrl,
            valid: true,
            lastCheck: Date.now(),
            ...(outcome.instanceName ? { instanceName: outcome.instanceName } : {}),
          });
          return;
        }
      }

      if (needsRevalidation(license)) {
        const next = await revalidate(license);
        if (!cancelled && next !== license) setLicense(next);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-5 pb-24 lg:pb-5">
        <h1 className="sr-only">Invoice and proposal editor</h1>
        <StorageBanners />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] gap-5 lg:gap-6 items-start">
          <div className="order-1 lg:col-start-1">
            <SidebarTop />
          </div>

          <div className={`order-2 lg:col-start-1 ${tab === 'form' ? 'block' : 'hidden lg:block'}`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              Build your document
            </h2>
            <FormPanel />
          </div>

          <div
            className={[
              tab === 'preview' ? 'block' : 'hidden lg:block',
              'order-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-16',
            ].join(' ')}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              Live preview
            </h2>
            <div className="lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1 pb-2">
              <Preview />
            </div>
          </div>

          <div className="order-4 lg:col-start-1">
            <SidebarRest />
          </div>
        </div>
      </main>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-panel/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="flex p-2 gap-2">
          <button
            type="button"
            className={['btn flex-1', tab === 'form' ? 'btn-primary' : 'btn-ghost'].join(' ')}
            onClick={() => setTab('form')}
            data-testid="tab-form"
          >
            Edit form
          </button>
          <button
            type="button"
            className={['btn flex-1', tab === 'preview' ? 'btn-primary' : 'btn-ghost'].join(' ')}
            onClick={() => setTab('preview')}
            data-testid="tab-preview"
          >
            PDF preview
          </button>
        </div>
      </div>

      <MobileDownloadFab />
      <UpgradeModal />
      <HistoryDrawer />
    </div>
  );
}

function MobileDownloadFab() {
  return (
    <button
      type="button"
      className="lg:hidden fab"
      data-testid="fab-download"
      onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="download-pdf"]')?.click()}
      aria-label="Download PDF"
    >
      <IconDownload className="w-5 h-5" />
      PDF
    </button>
  );
}
