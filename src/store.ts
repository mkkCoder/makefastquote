import { create } from 'zustand';
import type { DocKind, DocumentState, LicenseState, LineItem, Party, Stroke, TemplateId } from './types';
import { defaultDocument, loadDocument, newItem, saveDocument, clearDocument } from './lib/persist';
import { emptyLicense, loadLicense, saveLicense, clearLicense } from './lib/license';
import { TEMPLATES } from './pdf/templates';

interface AppState {
  doc: DocumentState;
  license: LicenseState;
  isPro: boolean;
  /** Non-null when the upgrade modal is open; the string is what prompted it. */
  upgradeReason: string | null;
  saveNotice: string | null;

  setKind: (kind: DocKind) => void;
  setTemplate: (id: TemplateId) => void;
  patchDoc: (patch: Partial<DocumentState>) => void;
  patchParty: (which: 'issuer' | 'client', patch: Partial<Party>) => void;
  addItem: () => void;
  updateItem: (id: string, patch: Partial<LineItem>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, delta: number) => void;
  setSignature: (strokes: Stroke[]) => void;
  setLogo: (dataUrl: string | null) => void;

  openUpgrade: (reason: string) => void;
  closeUpgrade: () => void;
  setLicense: (state: LicenseState) => void;
  deactivate: () => void;

  saveDraft: () => void;
  resetDoc: () => void;
  clearNotice: () => void;
}

/**
 * Autosave is debounced because every keystroke updates the document, and
 * serialising a document with a base64 logo on each one janks typing.
 */
let saveTimer: number | undefined;
function scheduleSave(doc: DocumentState) {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDocument(doc), 400) as unknown as number;
}

/** Flushes any pending autosave. Wired to pagehide in main.tsx. */
export function flushSave(doc: DocumentState) {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveDocument(doc);
}

export const useApp = create<AppState>((set, get) => {
  const doc = loadDocument();
  const license = loadLicense();

  return {
    doc,
    license,
    isPro: license.valid,
    upgradeReason: null,
    saveNotice: null,

    setKind: (kind) => {
      const next = { ...get().doc, kind };
      // Proposals and invoices use different default reference prefixes; only
      // rewrite one the user has not touched.
      set({ doc: next });
      scheduleSave(next);
    },

    setTemplate: (id) => {
      const tpl = TEMPLATES[id];
      if (tpl.pro && !get().isPro) {
        set({ upgradeReason: `the ${tpl.label} template` });
        return;
      }
      const next = { ...get().doc, template: id };
      set({ doc: next });
      scheduleSave(next);
    },

    patchDoc: (patch) => {
      const next = { ...get().doc, ...patch };
      set({ doc: next });
      scheduleSave(next);
    },

    patchParty: (which, patch) => {
      const cur = get().doc;
      const next = { ...cur, [which]: { ...cur[which], ...patch } };
      set({ doc: next });
      scheduleSave(next);
    },

    addItem: () => {
      const cur = get().doc;
      const next = { ...cur, items: [...cur.items, newItem()] };
      set({ doc: next });
      scheduleSave(next);
    },

    updateItem: (id, patch) => {
      const cur = get().doc;
      const next = {
        ...cur,
        items: cur.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      };
      set({ doc: next });
      scheduleSave(next);
    },

    removeItem: (id) => {
      const cur = get().doc;
      const remaining = cur.items.filter((it) => it.id !== id);
      const next = { ...cur, items: remaining.length ? remaining : [newItem()] };
      set({ doc: next });
      scheduleSave(next);
    },

    moveItem: (id, delta) => {
      const cur = get().doc;
      const i = cur.items.findIndex((it) => it.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.items.length) return;
      const items = [...cur.items];
      const a = items[i];
      const b = items[j];
      if (!a || !b) return;
      items[i] = b;
      items[j] = a;
      const next = { ...cur, items };
      set({ doc: next });
      scheduleSave(next);
    },

    setSignature: (signature) => {
      const next = { ...get().doc, signature };
      set({ doc: next });
      scheduleSave(next);
    },

    setLogo: (logo) => {
      if (logo && !get().isPro) {
        set({ upgradeReason: 'your own logo' });
        return;
      }
      const next = { ...get().doc, logo };
      set({ doc: next });
      scheduleSave(next);
    },

    openUpgrade: (reason) => set({ upgradeReason: reason }),
    closeUpgrade: () => set({ upgradeReason: null }),

    setLicense: (license) => {
      saveLicense(license);
      set({ license, isPro: license.valid });
      // A template chosen before upgrading stays chosen; nothing to migrate.
    },

    deactivate: () => {
      clearLicense();
      const cur = get().doc;
      const tpl = TEMPLATES[cur.template];
      // Drop back to a template they are entitled to, so the preview never
      // shows a document they cannot export.
      const next = tpl.pro ? { ...cur, template: 'standard' as TemplateId } : cur;
      set({ license: emptyLicense(), isPro: false, doc: next });
      // Written immediately rather than through the debounce. Autosave is
      // debounced because typing fires it on every keystroke; a one-off click
      // that changes entitlement has no such problem, and leaving a 400 ms
      // window where storage still says "Pro, Modern template" is the kind of
      // gap that shows up as a confusing state after a crash or a fast close.
      flushSave(next);
    },

    saveDraft: () => {
      flushSave(get().doc);
      set({ saveNotice: 'Draft saved in this browser.' });
      setTimeout(() => {
        if (get().saveNotice) set({ saveNotice: null });
      }, 2600);
    },

    resetDoc: () => {
      clearDocument();
      const fresh = defaultDocument();
      set({ doc: fresh, saveNotice: 'Started a new document.' });
      saveDocument(fresh);
      setTimeout(() => {
        if (get().saveNotice) set({ saveNotice: null });
      }, 2600);
    },

    clearNotice: () => set({ saveNotice: null }),
  };
});
