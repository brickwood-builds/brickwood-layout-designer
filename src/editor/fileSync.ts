import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../domain/schema';
import { exportFileName } from '../domain/exchange';
import { FileChangedError, fileLinksSupported, pickSaveFile, type FileLink, type FileLinks } from '../storage/fileLink';
import type { ProjectRepository } from '../storage/repository';
import type { Autosave } from './autosave';
import type { EditorStore } from './store';

export type FileSyncState =
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'paused'; link: FileLink }
  | { kind: 'ok'; link: FileLink }
  | { kind: 'changed'; link: FileLink; fileProject: Project }
  | { kind: 'error'; link: FileLink; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Keeps the open project in step with its linked file. Never overwrites a file that was
 * changed elsewhere without the user choosing to; loading the file's version checkpoints
 * the current one first.
 */
export function useFileSync(store: EditorStore, repo: ProjectRepository, links: FileLinks, autosave: Autosave, registerOnSaved: (fn: (p: Project) => void) => void) {
  const projectId = store.getState().project.id;
  const [state, setState] = useState<FileSyncState>(fileLinksSupported() ? { kind: 'loading' } : { kind: 'unsupported' });
  const stateRef = useRef(state);
  /** Set state and the ref together, so queued writes always see the latest link. */
  const update = useCallback((next: FileSyncState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  /** File writes run one at a time (two quick saves must not race). */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>) => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  /** Check the file and settle into ok / changed / error. */
  const verify = useCallback(
    async (link: FileLink) => {
      try {
        const { state: fs, fileProject } = await links.check(link);
        if (fs === 'changed') return update({ kind: 'changed', link, fileProject: fileProject! });
        update({ kind: 'ok', link });
      } catch (e) {
        update({ kind: 'error', link, message: message(e) });
      }
    },
    [links, update],
  );

  useEffect(() => {
    if (!fileLinksSupported()) return;
    let cancelled = false;
    (async () => {
      const link = await links.get(projectId);
      // The user may already have linked a file while we were looking.
      if (cancelled || stateRef.current.kind !== 'loading') return;
      if (!link) return update({ kind: 'none' });
      if ((await links.permission(link)) !== 'granted') return update({ kind: 'paused', link });
      await verify(link);
    })();
    return () => {
      cancelled = true;
    };
  }, [links, projectId, verify, update]);

  // After every successful save, write the file too.
  useEffect(() => {
    registerOnSaved((saved) => {
      enqueue(async () => {
        const s = stateRef.current;
        if (s.kind !== 'ok') return;
        try {
          update({ kind: 'ok', link: await links.write(s.link, saved) });
        } catch (e) {
          update(e instanceof FileChangedError ? { kind: 'changed', link: s.link, fileProject: e.fileProject } : { kind: 'error', link: s.link, message: message(e) });
        }
      });
    });
  }, [links, registerOnSaved, enqueue, update]);

  /** The latest saved version (flushes pending edits first). */
  const savedProject = async () => {
    await autosave.flush();
    return store.getState().project;
  };

  return {
    state,
    /** Pick a file (e.g. in the OneDrive folder) and keep saving there. */
    async linkNow() {
      try {
        const project = await savedProject();
        const handle = await pickSaveFile(exportFileName(project));
        update({ kind: 'ok', link: await links.link(project, handle) });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') alert(`Couldn't use that file: ${message(e)}`);
      }
    },
    /** The browser forgets write permission between visits; a click brings it back. */
    async resume() {
      const s = stateRef.current;
      if (!('link' in s)) return;
      if ((await links.permission(s.link, true)) !== 'granted') return;
      await verify(s.link);
      if (stateRef.current.kind === 'ok') await this.writeNow();
    },
    async writeNow() {
      const project = await savedProject();
      await enqueue(async () => {
        const s = stateRef.current;
        if (s.kind !== 'ok' && s.kind !== 'error') return;
        try {
          update({ kind: 'ok', link: await links.write(s.link, project) });
        } catch (e) {
          update(e instanceof FileChangedError ? { kind: 'changed', link: s.link, fileProject: e.fileProject } : { kind: 'error', link: s.link, message: message(e) });
        }
      });
    },
    /** Load the file's (newer) version; this one is kept as a checkpoint. */
    async useFileVersion() {
      const s = stateRef.current;
      if (s.kind !== 'changed') return;
      await autosave.flush();
      const loaded = await repo.replaceWithVersion(s.fileProject, 'Before loading the version from its file', { keepRevisionId: true });
      await links.adopt(loaded, s.link.handle);
      window.location.reload();
    },
    /** Keep this version and overwrite the file with it (the user chose this). */
    async keepThisVersion() {
      const s = stateRef.current;
      if (s.kind !== 'changed') return;
      const project = await savedProject();
      await enqueue(async () => update({ kind: 'ok', link: await links.write(s.link, project, true) }));
    },
    async stop() {
      await links.unlink(projectId);
      update({ kind: 'none' });
    },
  };
}
