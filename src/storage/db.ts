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

export type BrickwoodDb = Dexie & {
  projects: EntityTable<ProjectRow, 'id'>;
  checkpoints: EntityTable<CheckpointRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

export const DEFAULT_DB_NAME = 'brickwood-layout-designer';

export function openDb(name = DEFAULT_DB_NAME): BrickwoodDb {
  const db = new Dexie(name) as BrickwoodDb;
  db.version(1).stores({
    projects: 'id, updatedAt',
    checkpoints: 'id, projectId, [projectId+createdAt]',
    meta: 'key',
  });
  return db;
}
