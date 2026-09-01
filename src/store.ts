import { create } from 'zustand';
import type {
  DocKind,
  DocumentState,
  LicenseState,
  LineItem,
  LogoAlign,
  Party,
  SignatureImage,
  Stroke,
  TemplateId,
} from './types';
import { defaultDocument, loadDocument, newItem, saveDocument, clearDocument } from './lib/persist';
import { emptyLicense, loadLicense, saveLicense, clearLicense } from './lib/license';
import { TEMPLATES } from './pdf/templates';
import { loadArchive, upsertArchive, removeArchive, type ArchiveEntry } from './lib/archive';
import { loadProfile, saveProfile, profileFromDoc } from './lib/profile';
import { clampScale } from './lib/logo';

interface AppState {
  doc: DocumentState;
  license: LicenseState;
  isPro: boolean;
  /** Non-null when the upgrade modal is open; the string is what prompted it. */
  upgradeReason: string | null;
  saveNotice: string | null;
  workspaceTab: 'form' | 'preview';
  historyOpen: boolean;
  archive: ArchiveEntry[];
  lastItemId: string | null;
  profileSavedAt: number | null;

  setKind: (kind: DocKind) => void;
  setTemplate: (id: TemplateId) => void;
  patchDoc: (patch: Partial<DocumentState>) => void;
  patchParty: (which: 'issuer' | 'client', patch: Partial<Party>) => void;
  addItem: () => void;
  duplicateItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<LineItem>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, delta: number) => void;
  setSignature: (strokes: Stroke[]) => void;
  setSignatureImage: (image: SignatureImage | null) => void;
  setLogo: (logo: string | null, aspect?: number | null) => void;
  setLogoScale: (scale: number) => void;
  setLogoAlign: (align: LogoAlign) => void;

  openUpgrade: (reason: string) => void;
  closeUpgrade: () => void;
  setLicense: (state: LicenseState) => void;
  deactivate: () => void;

  saveDraft: () => void;
  resetDoc: () => void;
  rememberProfile: () => void;
  setWorkspaceTab: (tab: 'form' | 'preview') => void;
  setHistoryOpen: (open: boolean) => void;
  loadFromArchive: (id: string) => void;
  deleteFromArchive: (id: string) => void;
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
    workspaceTab: 'form',
    historyOpen: false,
    archive: loadArchive(),
    lastItemId: null,
    profileSavedAt: loadProfile() ? 1 : null,

    setKind: (kind) => {
      const next = { ...get().doc, kind };
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
      const item = newItem();
      const cur = get().doc;
      const next = { ...cur, items: [...cur.items, item] };
      set({ doc: next, lastItemId: item.id });
      scheduleSave(next);
    },

    duplicateItem: (id) => {
      const cur = get().doc;
      const i = cur.items.findIndex((it) => it.id === id);
      if (i < 0) return;
      const src = cur.items[i];
      if (!src) return;
      const copy = { ...src, id: crypto.randomUUID() };
      const items = [...cur.items.slice(0, i + 1), copy, ...cur.items.slice(i + 1)];
      const next = { ...cur, items };
      set({ doc: next, lastItemId: copy.id });
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
      const next = { ...get().doc, signature, signatureImage: null };
      set({ doc: next });
      scheduleSave(next);
    },

    setSignatureImage: (signatureImage) => {
      const next = { ...get().doc, signatureImage, signature: [] };
      set({ doc: next });
      flushSave(next);
    },

    setLogo: (logo, aspect = null) => {
      // Free users may preview a logo; the PDF gate lives in layout.ts.
      const next = { ...get().doc, logo, logoAspect: logo ? (aspect ?? get().doc.logoAspect) : null };
      set({ doc: next });
      flushSave(next);
    },

    setLogoScale: (scale) => {
      const next = { ...get().doc, logoScale: clampScale(scale) };
      set({ doc: next });
      scheduleSave(next);
    },

    setLogoAlign: (logoAlign) => {
      const next = { ...get().doc, logoAlign };
      set({ doc: next });
      scheduleSave(next);
    },

    openUpgrade: (reason) => set({ upgradeReason: reason }),
    closeUpgrade: () => set({ upgradeReason: null }),

    setLicense: (license) => {
      saveLicense(license);
      set({ license, isPro: license.valid });
    },

    deactivate: () => {
      clearLicense();
      const cur = get().doc;
      const tpl = TEMPLATES[cur.template];
      const next = tpl.pro ? { ...cur, template: 'standard' as TemplateId } : cur;
      set({ license: emptyLicense(), isPro: false, doc: next });
      flushSave(next);
    },

    saveDraft: () => {
      const cur = get().doc;
      flushSave(cur);
      const archive = upsertArchive(cur);
      set({ archive, saveNotice: 'Draft saved in this browser.' });
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

    rememberProfile: () => {
      saveProfile(profileFromDoc(get().doc));
      set({ profileSavedAt: Date.now(), saveNotice: 'Business profile saved on this device.' });
      setTimeout(() => {
        if (get().saveNotice) set({ saveNotice: null });
      }, 2600);
    },

    setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
    setHistoryOpen: (historyOpen) => set({ historyOpen }),

    loadFromArchive: (id) => {
      const entry = get().archive.find((e) => e.id === id);
      if (!entry) return;
      flushSave(get().doc);
      upsertArchive(get().doc);
      const next = entry.doc;
      set({ doc: next, historyOpen: false, archive: loadArchive() });
      flushSave(next);
    },

    deleteFromArchive: (id) => {
      set({ archive: removeArchive(id) });
    },

    clearNotice: () => set({ saveNotice: null }),
  };
});
