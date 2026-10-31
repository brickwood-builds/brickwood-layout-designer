import { RevisionConflictError, type ProjectRepository } from '../storage/repository';
import type { EditorStore } from './store';
import type { Project } from '../domain/schema';

export interface Autosave {
  /** Save now if anything is pending; resolves when stored. */
  flush: () => Promise<void>;
  stop: () => void;
}

/**
 * Saves the editor's project shortly after each change. One save runs at a time;
 * edits made during a save are picked up by the next one. A revision conflict
 * (the project was saved from another tab) stops autosave instead of overwriting.
 */
export function startAutosave(store: EditorStore, repo: ProjectRepository, delayMs = 600, onSaved?: (saved: Project) => void): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  const save = async (): Promise<void> => {
    if (running) {
      await running;
      if (store.getState().saveState !== 'pending') return;
    }
    const state = store.getState();
    if (state.saveState !== 'pending') return;
    const doc = state.project;
    state.setSaveState('saving');
    running = (async () => {
      try {
        const saved = await repo.saveProject(doc);
        onSaved?.(saved);
        const editedMeanwhile = store.getState().project !== doc;
        store.getState().markSaved({ revision: saved.revision, revisionId: saved.revisionId, updatedAt: saved.updatedAt });
        store.getState().setSaveState(editedMeanwhile ? 'pending' : 'saved');
        if (editedMeanwhile) schedule();
      } catch (e) {
        if (e instanceof RevisionConflictError) store.getState().setSaveState('conflict', e.message);
        else store.getState().setSaveState('error', e instanceof Error ? e.message : String(e));
      } finally {
        running = null;
      }
    })();
    await running;
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.project !== prev.project && s.saveState === 'pending') schedule();
  });

  return {
    flush: async () => {
      clearTimeout(timer);
      await save();
    },
    stop: () => {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
