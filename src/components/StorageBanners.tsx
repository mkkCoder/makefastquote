import { useState } from 'react';
import { useApp } from '../store';
import { archiveToJson } from '../lib/archive';
import { downloadBlob } from '../lib/exportData';
import { isStorageUnusable } from '../lib/privateMode';
import { IconX } from './Icons';

export function StorageBanners() {
  const archive = useApp((s) => s.archive);
  const [privateMode] = useState(() => isStorageUnusable());
  const [backupDismissed, setBackupDismissed] = useState(false);

  return (
    <div className="flex flex-col gap-2 mb-4">
      {privateMode && (
        <div
          className="rounded-xl border border-amber-600/40 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 px-3 py-2.5 text-sm"
          role="status"
          data-testid="incognito-banner"
        >
          Private browsing is on, or this browser is blocking storage. Anything you type will
          vanish when this tab closes — export a JSON copy before you leave.
        </div>
      )}
      {!backupDismissed && archive.length >= 3 && (
        <div
          className="rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm flex items-start gap-3"
          role="status"
          data-testid="backup-banner"
        >
          <p className="flex-1 text-muted">
            You have {archive.length} invoices stored in this browser.{' '}
            <button
              type="button"
              className="font-semibold text-brand underline underline-offset-2"
              onClick={() =>
                downloadBlob(
                  new Blob([archiveToJson(archive)], { type: 'application/json' }),
                  `makefastquote-backup-${new Date().toISOString().slice(0, 10)}.json`,
                )
              }
            >
              Download full backup (JSON)
            </button>
          </p>
          <button
            type="button"
            className="p-1 text-faint hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setBackupDismissed(true)}
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
