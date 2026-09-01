import { useApp } from '../store';
import { formatMoney } from '../lib/money';
import { archiveToJson } from '../lib/archive';
import { downloadBlob } from '../lib/exportData';
import { IconX } from './Icons';
import type { DocStatus } from '../types';

const STATUS: Array<[DocStatus, string]> = [
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['paid', 'Paid'],
];

export function HistoryDrawer() {
  const open = useApp((s) => s.historyOpen);
  const setOpen = useApp((s) => s.setHistoryOpen);
  const archive = useApp((s) => s.archive);
  const loadFromArchive = useApp((s) => s.loadFromArchive);
  const deleteFromArchive = useApp((s) => s.deleteFromArchive);
  const patchDoc = useApp((s) => s.patchDoc);
  const currentId = useApp((s) => s.doc.id);
  const status = useApp((s) => s.doc.status);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <aside
        className="h-full w-full max-w-md bg-panel border-l border-edge shadow-2xl flex flex-col"
        role="dialog"
        aria-labelledby="history-title"
      >
        <div className="flex items-start justify-between p-4 border-b border-edge">
          <div>
            <h2 id="history-title" className="text-sm font-bold">
              Documents in this browser
            </h2>
            <p className="text-xs text-muted mt-0.5">Stored only on this device. Nothing is uploaded.</p>
          </div>
          <button type="button" className="p-1.5 rounded-md text-faint hover:text-ink" onClick={() => setOpen(false)} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-edge">
          <span className="label">This document</span>
          <div className="flex gap-1.5">
            {STATUS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={['btn text-xs flex-1', status === id ? 'btn-primary' : 'btn-ghost'].join(' ')}
                onClick={() => patchDoc({ status: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {archive.length === 0 ? (
            <li className="text-sm text-muted px-1 py-6 text-center">
              Saved drafts will appear here. Use Save draft to keep a copy before starting a new one.
            </li>
          ) : (
            archive.map((entry) => (
              <li key={entry.id}>
                <div
                  className={[
                    'rounded-xl border p-3',
                    entry.id === currentId ? 'border-brand bg-brand-soft' : 'border-edge',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => loadFromArchive(entry.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">
                        {entry.client || 'No client'} · {entry.reference || 'No ref'}
                      </span>
                      <span
                        className={[
                          'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                          entry.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : entry.status === 'sent'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700',
                        ].join(' ')}
                      >
                        {entry.status}
                      </span>
                    </span>
                    <span className="block text-xs text-muted mt-1">
                      {entry.kind === 'invoice' ? 'Invoice' : 'Proposal'} ·{' '}
                      {formatMoney(entry.total, entry.currency)} ·{' '}
                      {new Date(entry.savedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-faint hover:text-ink underline mt-2"
                    onClick={() => deleteFromArchive(entry.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        {archive.length > 0 && (
          <div className="p-4 border-t border-edge">
            <button
              type="button"
              className="btn btn-ghost w-full text-xs"
              onClick={() =>
                downloadBlob(
                  new Blob([archiveToJson(archive)], { type: 'application/json' }),
                  `makefastquote-backup-${new Date().toISOString().slice(0, 10)}.json`,
                )
              }
            >
              Download full backup (JSON)
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
