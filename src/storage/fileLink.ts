// "Save to a file": keep a project in step with a .brickwood.json file on this computer,
// typically inside the OneDrive folder so OneDrive's own app syncs it. Chrome/Edge only
// (File System Access API). The file uses the normal export format.
import { exportProject, parseProjectFile } from '../domain/exchange';
import type { Project } from '../domain/schema';
import type { BrickwoodDb, FileLinkRow } from './db';

/** The parts of FileSystemFileHandle we use (lets tests supply a fake). */
export interface FileHandleLike {
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface FileLink {
  projectId: string;
  handle: FileHandleLike;
  fileName: string;
  lastRevisionId: string;
}

export interface LinkStore {
  get(projectId: string): Promise<FileLink | undefined>;
  put(link: FileLink): Promise<void>;
  delete(projectId: string): Promise<void>;
}

/** The file holds a different version than the one this app last wrote or read. */
export class FileChangedError extends Error {
  constructor(readonly fileProject: Project) {
    super('The file was changed somewhere else (probably on another computer).');
    this.name = 'FileChangedError';
  }
}

export type FileState = 'in-sync' | 'changed' | 'empty';

type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (o: unknown) => Promise<FileHandleLike[]>;
};

export const fileLinksSupported = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

const PICKER_TYPES = [{ description: 'Brickwood project', accept: { 'application/json': ['.json'] } }];

export function pickSaveFile(suggestedName: string): Promise<FileHandleLike> {
  return (window as PickerWindow).showSaveFilePicker!({ suggestedName, types: PICKER_TYPES, id: 'brickwood-projects' });
}

export async function pickOpenFile(): Promise<FileHandleLike> {
  const [handle] = await (window as PickerWindow).showOpenFilePicker!({ types: PICKER_TYPES, id: 'brickwood-projects', multiple: false });
  return handle!;
}

/** Dexie-backed store. Falls back to memory if a handle can't be stored (e.g. test fakes). */
export function dbLinkStore(db: BrickwoodDb): LinkStore {
  const memory = new Map<string, FileLink>();
  return {
    async get(projectId) {
      if (memory.has(projectId)) return memory.get(projectId);
      const row = await db.fileLinks.get(projectId);
      return row ? ({ ...row, handle: row.handle as FileHandleLike } satisfies FileLink) : undefined;
    },
    async put(link) {
      memory.set(link.projectId, link);
      try {
        await db.fileLinks.put(link as FileLinkRow);
      } catch {
        // Not cloneable: keep for this session only.
      }
    },
    async delete(projectId) {
      memory.delete(projectId);
      await db.fileLinks.delete(projectId);
    },
  };
}

export class FileLinks {
  constructor(private store: LinkStore) {}

  get(projectId: string) {
    return this.store.get(projectId);
  }

  /** Link a project to a file the user just picked, writing the current version into it. */
  async link(project: Project, handle: FileHandleLike): Promise<FileLink> {
    const link: FileLink = { projectId: project.id, handle, fileName: handle.name, lastRevisionId: project.revisionId };
    await writeText(handle, exportProject(project));
    await this.store.put(link);
    return link;
  }

  /** Remember that `project` is what the file now holds (after opening or loading it). */
  async adopt(project: Project, handle: FileHandleLike): Promise<FileLink> {
    const link: FileLink = { projectId: project.id, handle, fileName: handle.name, lastRevisionId: project.revisionId };
    await this.store.put(link);
    return link;
  }

  unlink(projectId: string) {
    return this.store.delete(projectId);
  }

  /** Whether the browser still lets us write; asking needs a click (`ask`). */
  async permission(link: FileLink, ask = false): Promise<PermissionState> {
    const h = link.handle;
    if (!h.queryPermission) return 'granted';
    const state = await h.queryPermission({ mode: 'readwrite' });
    if (state === 'granted' || !ask || !h.requestPermission) return state;
    return h.requestPermission({ mode: 'readwrite' });
  }

  /** Compare the file with the version we last wrote or read. */
  async check(link: FileLink): Promise<{ state: FileState; fileProject?: Project }> {
    const text = await (await link.handle.getFile()).text();
    if (!text.trim()) return { state: 'empty' };
    const fileProject = parseProjectFile(text);
    return { state: fileProject.revisionId === link.lastRevisionId ? 'in-sync' : 'changed', fileProject };
  }

  /**
   * Write a saved version. Refuses (FileChangedError) if the file was changed elsewhere
   * since we last wrote it, unless `force` — the user chose to keep this version.
   */
  async write(link: FileLink, project: Project, force = false): Promise<FileLink> {
    if (!force) {
      const { state, fileProject } = await this.check(link);
      if (state === 'changed') throw new FileChangedError(fileProject!);
    }
    await writeText(link.handle, exportProject(project));
    const next = { ...link, lastRevisionId: project.revisionId };
    await this.store.put(next);
    return next;
  }
}

async function writeText(handle: FileHandleLike, text: string) {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}
