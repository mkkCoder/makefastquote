import { useEffect } from 'react';
import { useApp } from './store';
import { Header } from './components/Header';
import { SidebarTop, SidebarRest } from './components/Sidebar';
import { FormPanel } from './components/FormPanel';
import { Preview } from './components/Preview';
import { UpgradeModal } from './components/UpgradeModal';
import { needsRevalidation, revalidate, takeKeyFromUrl, validateKey } from './lib/license';

export default function App() {
  const license = useApp((s) => s.license);
  const setLicense = useApp((s) => s.setLicense);
  const openUpgrade = useApp((s) => s.openUpgrade);

  useEffect(() => {
    let cancelled = false;

    // The landing page's pricing CTA links to /app/?upgrade=1, so someone who
    // arrives having already decided to buy lands on the editor with the modal
    // open rather than having to find the button again.
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
      // Layer 4 of the buy flow: a post-purchase redirect carrying ?key=.
      // Handled before revalidation so a fresh purchase activates immediately.
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
    // Runs once on boot. Re-running on every licence change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-5">
        {/* Mobile order is set with `order-*`: document type, form, preview,
            then templates and the Pro card. See the note in Sidebar.tsx for
            why the paid card must not come first on a phone. On lg the two
            sidebar halves rejoin in column 1. */}
        <div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.02fr)] gap-5 items-start">
          <div className="order-1 lg:col-start-1 lg:row-start-1">
            <SidebarTop />
          </div>

          <div className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-faint mb-2.5">
              Build your document
            </h2>
            <FormPanel />
          </div>

          <div className="order-3 lg:order-none lg:col-start-3 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-19">
            <h2 className="text-xs font-bold uppercase tracking-wider text-faint mb-2.5">
              Live preview
            </h2>
            <div className="lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1 pb-2">
              <Preview />
            </div>
          </div>

          <div className="order-4 lg:order-none lg:col-start-1 lg:row-start-2">
            <SidebarRest />
          </div>
        </div>
      </main>
      <UpgradeModal />
    </div>
  );
}
