import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Project } from '../domain/schema';
import { allItems, type Item } from '../domain/edits';
import type { View } from './view';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

/** Live drag preview: the selection drawn shifted by dx/dy until the drag is committed. */
export interface DragPreview {
  ids: string[];
  dx: number;
  dy: number;
}

export interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  selection: string[];
  levelId: string;
  view: View;
  mode: 'select' | 'pan';
  showOtherLevels: boolean;
  drag: DragPreview | null;
  saveState: SaveState;
  saveError: string;
  clipboard: Item[];
  /** Canvas size in CSS pixels. */
  viewport: { width: number; height: number };
  /** Pointer position in studs on the active level (mouse only), for the status bar. */
  pointer: { x: number; y: number } | null;

  /** Apply one undoable change. */
  commit: (change: (p: Project) => Project, selection?: string[]) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setView: (view: View) => void;
  set: (patch: Partial<Pick<EditorState, 'mode' | 'showOtherLevels' | 'drag' | 'levelId' | 'clipboard' | 'viewport' | 'pointer'>>) => void;
  /** Called by autosave once a revision is stored. Not an undoable change. */
  markSaved: (saved: Pick<Project, 'revision' | 'revisionId' | 'updatedAt'>) => void;
  setSaveState: (state: SaveState, error?: string) => void;
}

const HISTORY_LIMIT = 200;

/** Revision metadata belongs to storage, not to an undo step. */
const keepMeta = (doc: Project, current: Project): Project => ({
  ...doc,
  revision: current.revision,
  revisionId: current.revisionId,
  updatedAt: current.updatedAt,
});

/** Drop selected IDs that no longer exist (e.g. after undoing an add). */
const existing = (p: Project, ids: string[]) => {
  const all = new Set(allItems(p).map((i) => i.id));
  return ids.filter((id) => all.has(id));
};

export type EditorStore = StoreApi<EditorState>;

export function createEditorStore(project: Project): EditorStore {
  const firstLevel = [...project.levels].sort((a, b) => a.order - b.order)[0]!;
  return createStore<EditorState>((set, get) => ({
    project,
    past: [],
    future: [],
    selection: [],
    levelId: firstLevel.id,
    view: { scale: 1, x: 0, y: 0 },
    mode: 'select',
    showOtherLevels: false,
    drag: null,
    saveState: 'saved',
    saveError: '',
    clipboard: [],
    viewport: { width: 0, height: 0 },
    pointer: null,

    commit: (change, selection) => {
      const { project: before, past, saveState } = get();
      const after = change(before);
      if (after === before) return;
      set({
        project: after,
        past: [...past, before].slice(-HISTORY_LIMIT),
        future: [],
        selection: existing(after, selection ?? get().selection),
        saveState: saveState === 'conflict' ? 'conflict' : 'pending',
      });
    },
    undo: () => {
      const { past, future, project: current, selection } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      const doc = keepMeta(prev, current);
      set({ project: doc, past: past.slice(0, -1), future: [current, ...future], selection: existing(doc, selection), saveState: 'pending' });
    },
    redo: () => {
      const { past, future, project: current, selection } = get();
      const next = future[0];
      if (!next) return;
      const doc = keepMeta(next, current);
      set({ project: doc, past: [...past, current], future: future.slice(1), selection: existing(doc, selection), saveState: 'pending' });
    },
    select: (ids) => set({ selection: [...new Set(ids)] }),
    setView: (view) => set({ view }),
    set: (patch) => set(patch),
    markSaved: (saved) => set({ project: { ...get().project, ...saved } }),
    setSaveState: (saveState, saveError = '') => set({ saveState, saveError }),
  }));
}
