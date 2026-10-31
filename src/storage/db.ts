import Dexie, { type EntityTable } from 'dexie';

/** Stored project row. `doc` is the full canonical project, validated on every read. */
export interface ProjectRow {
  id: string;
  updatedAt: string;
  doc: unknown;
}

export interface CheckpointRow {
  id: string;
  projectId: string;
  createdAt: string;
  reason: string;
  revision: number;
  doc: unknown;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** A project kept in step with a file on this computer (e.g. in the OneDrive folder). Device-specific. */
export interface FileLinkRow {
  projectId: string;
  /** FileSystemFileHandle (structured-cloneable in Chrome/Edge). */
  handle: unknown;
  fileName: string;
  /** revisionId of the version last written to (or read from) the file. */
  lastRevisionId: string;
}

export type BrickwoodDb = Dexie & {
  projects: EntityTable<ProjectRow, 'id'>;
  checkpoints: EntityTable<CheckpointRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
  fileLinks: EntityTable<FileLinkRow, 'projectId'>;
};

export const DEFAULT_DB_NAME = 'brickwood-layout-designer';

export function openDb(name = DEFAULT_DB_NAME): BrickwoodDb {
  const db = new Dexie(name) as BrickwoodDb;
  db.version(1).stores({
    projects: 'id, updatedAt',
    checkpoints: 'id, projectId, [projectId+createdAt]',
    meta: 'key',
  });
  db.version(2).stores({
    projects: 'id, updatedAt',
    checkpoints: 'id, projectId, [projectId+createdAt]',
    meta: 'key',
    fileLinks: 'projectId',
  });
  return db;
}
