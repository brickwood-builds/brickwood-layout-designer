import { newId, nowIso } from '../domain/ids';
import { migrateProject, ProjectFormatError } from '../domain/migrations';
import { duplicateProject } from '../domain/project';
import { ProjectSchema, type Project } from '../domain/schema';
import type { BrickwoodDb, CheckpointRow } from './db';

/** A save was based on an out-of-date copy. Nothing was written. */
export class RevisionConflictError extends Error {
  constructor(readonly projectId: string, readonly expected: number, readonly actual: number) {
    super(`Project changed elsewhere (expected revision ${expected}, found ${actual}). Reload before saving.`);
    this.name = 'RevisionConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export interface DamagedProject {
  id: string;
  error: string;
  hasCheckpoint: boolean;
}

export interface CheckpointInfo {
  id: string;
  projectId: string;
  createdAt: string;
  reason: string;
  revision: number;
}

export interface SaveOptions {
  /** Snapshot the currently stored version first, with this reason. */
  checkpointReason?: string;
  /** Test hook: runs inside the transaction after writes and before commit. */
  beforeCommit?: () => void;
}

export const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;
export const MAX_CHECKPOINTS_PER_PROJECT = 25;

const STARTERS_SEEDED = 'startersSeeded';

/**
 * All persistence goes through here. Every write is a single IndexedDB transaction,
 * so an interrupted save leaves the previous version intact.
 */
export class ProjectRepository {
  constructor(readonly db: BrickwoodDb) {}

  async listProjects(opts: { includeArchived?: boolean } = {}): Promise<{ projects: Project[]; damaged: DamagedProject[] }> {
    const rows = await this.db.projects.toArray();
    const projects: Project[] = [];
    const damaged: DamagedProject[] = [];
    for (const row of rows) {
      try {
        const p = migrateProject(row.doc);
        if (opts.includeArchived || !p.archived) projects.push(p);
      } catch (e) {
        const hasCheckpoint = (await this.db.checkpoints.where('projectId').equals(row.id).count()) > 0;
        damaged.push({ id: row.id, error: describe(e), hasCheckpoint });
      }
    }
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects, damaged };
  }

  async getProject(id: string): Promise<Project> {
    const row = await this.db.projects.get(id);
    if (!row) throw new NotFoundError('Project');
    return migrateProject(row.doc);
  }

  /** Add a brand-new project. Refuses to overwrite an existing ID. */
  async createProject(project: Project): Promise<Project> {
    const valid = ProjectSchema.parse(project);
    await this.db.transaction('rw', this.db.projects, async () => {
      if (await this.db.projects.get(valid.id)) throw new Error('A project with this ID already exists.');
      await this.db.projects.add({ id: valid.id, updatedAt: valid.updatedAt, doc: valid });
    });
    return valid;
  }

  /**
   * Save a changed project. `project.revision` must equal the stored revision
   * (optimistic check); the stored copy becomes revision + 1 with a new revisionId.
   */
  async saveProject(project: Project, opts: SaveOptions = {}): Promise<Project> {
    const db = this.db;
    return db.transaction('rw', db.projects, db.checkpoints, async () => {
      const row = await db.projects.get(project.id);
      if (!row) throw new NotFoundError('Project');
      const stored = migrateProject(row.doc);
      if (stored.revision !== project.revision) {
        throw new RevisionConflictError(project.id, project.revision, stored.revision);
      }
      const next = ProjectSchema.parse({
        ...project,
        revision: stored.revision + 1,
        revisionId: newId(),
        updatedAt: nowIso(),
      });

      const reason = opts.checkpointReason ?? (await this.checkpointDue(project.id) ? 'Automatic checkpoint' : undefined);
      if (reason) await this.writeCheckpoint(stored, reason);

      await db.projects.put({ id: next.id, updatedAt: next.updatedAt, doc: next });
      opts.beforeCommit?.();
      return next;
    });
  }

  async update(id: string, change: (p: Project) => Project, opts: SaveOptions = {}): Promise<Project> {
    const current = await this.getProject(id);
    return this.saveProject(change(structuredClone(current)), opts);
  }

  rename(id: string, name: string) {
    return this.update(id, (p) => ({ ...p, name: name.trim() }));
  }

  setArchived(id: string, archived: boolean) {
    return this.update(id, (p) => ({ ...p, archived }));
  }

  async duplicate(id: string, name?: string): Promise<Project> {
    return this.createProject(duplicateProject(await this.getProject(id), name));
  }

  /** Import a validated project. An existing ID is never overwritten: it is imported as a copy. */
  async importProject(project: Project): Promise<{ project: Project; importedAsCopy: boolean }> {
    const exists = await this.db.projects.get(project.id);
    if (exists) {
      const copy = duplicateProject(project, `${project.name} (imported)`);
      return { project: await this.createProject(copy), importedAsCopy: true };
    }
    return { project: await this.createProject({ ...project, archived: false }), importedAsCopy: false };
  }

  /** Snapshot the stored version of a project. */
  async checkpoint(projectId: string, reason: string): Promise<CheckpointInfo> {
    return this.db.transaction('rw', this.db.projects, this.db.checkpoints, async () => {
      const stored = await this.getProject(projectId);
      return this.writeCheckpoint(stored, reason);
    });
  }

  async listCheckpoints(projectId: string): Promise<CheckpointInfo[]> {
    const rows = await this.db.checkpoints.where('projectId').equals(projectId).toArray();
    return rows.sort(newestFirst).map(info);
  }

  /** Validated copy of a checkpoint, for previewing before restore. */
  async previewCheckpoint(checkpointId: string): Promise<Project> {
    const row = await this.db.checkpoints.get(checkpointId);
    if (!row) throw new NotFoundError('Checkpoint');
    return migrateProject(row.doc);
  }

  /**
   * Replace the project with a checkpoint's contents. The current version is
   * checkpointed first (when readable), so a restore can itself be undone.
   */
  async restoreCheckpoint(checkpointId: string): Promise<Project> {
    const db = this.db;
    return db.transaction('rw', db.projects, db.checkpoints, async () => {
      const cp = await db.checkpoints.get(checkpointId);
      if (!cp) throw new NotFoundError('Checkpoint');
      const snapshot = migrateProject(cp.doc);
      const row = await db.projects.get(cp.projectId);
      let revision = snapshot.revision;
      if (row) {
        try {
          const current = migrateProject(row.doc);
          await this.writeCheckpoint(current, 'Before restore');
          revision = current.revision;
        } catch {
          // Current copy is damaged; keep it out of the checkpoint list but continue the recovery.
        }
      }
      const restored = ProjectSchema.parse({ ...snapshot, revision: revision + 1, revisionId: newId(), updatedAt: nowIso() });
      await db.projects.put({ id: restored.id, updatedAt: restored.updatedAt, doc: restored });
      return restored;
    });
  }

  /**
   * Replace a project with another copy of itself (e.g. the newer version from its linked
   * file). The current version is checkpointed first, so nothing is lost.
   */
  async replaceWithVersion(incoming: Project, reason: string, opts: { keepRevisionId?: boolean } = {}): Promise<Project> {
    const db = this.db;
    return db.transaction('rw', db.projects, db.checkpoints, async () => {
      const row = await db.projects.get(incoming.id);
      let revision = incoming.revision;
      if (row) {
        try {
          const current = migrateProject(row.doc);
          await this.writeCheckpoint(current, reason);
          revision = Math.max(revision, current.revision);
        } catch {
          // A damaged copy is simply replaced.
        }
      }
      // keepRevisionId: the incoming copy *is* that saved revision (e.g. read from its file).
      const next = ProjectSchema.parse({
        ...incoming,
        revision: revision + 1,
        revisionId: opts.keepRevisionId ? incoming.revisionId : newId(),
        updatedAt: opts.keepRevisionId ? incoming.updatedAt : nowIso(),
      });
      await db.projects.put({ id: next.id, updatedAt: next.updatedAt, doc: next });
      return next;
    });
  }

  /** Add the bundled starter projects the first time the app runs. */
  async seedStarters(starters: Project[]): Promise<number> {
    const db = this.db;
    return db.transaction('rw', db.projects, db.meta, async () => {
      if (await db.meta.get(STARTERS_SEEDED)) return 0;
      let added = 0;
      for (const p of starters) {
        if (!(await db.projects.get(p.id))) {
          await db.projects.add({ id: p.id, updatedAt: p.updatedAt, doc: ProjectSchema.parse(p) });
          added++;
        }
      }
      await db.meta.put({ key: STARTERS_SEEDED, value: nowIso() });
      return added;
    });
  }

  private async checkpointDue(projectId: string): Promise<boolean> {
    const rows = await this.db.checkpoints.where('projectId').equals(projectId).toArray();
    const latest = rows.sort(newestFirst)[0];
    return !latest || Date.now() - Date.parse(latest.createdAt) >= CHECKPOINT_INTERVAL_MS;
  }

  private async writeCheckpoint(project: Project, reason: string): Promise<CheckpointInfo> {
    const row: CheckpointRow = {
      id: newId(),
      projectId: project.id,
      createdAt: nowIso(),
      reason,
      revision: project.revision,
      doc: project,
    };
    await this.db.checkpoints.add(row);
    const all = (await this.db.checkpoints.where('projectId').equals(project.id).toArray()).sort(newestFirst);
    const excess = all.slice(MAX_CHECKPOINTS_PER_PROJECT).map((r) => r.id);
    if (excess.length) await this.db.checkpoints.bulkDelete(excess);
    return info(row);
  }
}

function newestFirst(a: CheckpointRow, b: CheckpointRow) {
  return b.createdAt.localeCompare(a.createdAt) || b.revision - a.revision;
}

function info(r: CheckpointRow): CheckpointInfo {
  return { id: r.id, projectId: r.projectId, createdAt: r.createdAt, reason: r.reason, revision: r.revision };
}

function describe(e: unknown): string {
  if (e instanceof ProjectFormatError) return [e.message, ...e.details].join(' ');
  return e instanceof Error ? e.message : String(e);
}
