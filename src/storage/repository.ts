import { newId, nowIso } from '../domain/ids';
import { migrateProject, ProjectFormatError } from '../domain/migrations';
import { duplicateProject } from '../domain/project';
import { ProjectSchema, type Project } from '../domain/schema';
import type { BrickwoodDb, CheckpointRow, PhotoRow, VersionRow } from './db';

export type VersionInfo = Pick<VersionRow, 'id' | 'projectId' | 'createdAt' | 'name' | 'note'>;
import { InventorySchema, emptyInventory, type Inventory } from '../domain/inventory';
import { BACKUP_KIND, fromBase64, toBase64, type Backup } from '../domain/backup';

const INVENTORY = 'inventory';
const LAST_BACKUP = 'lastBackupAt';

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

/** Before per-starter tracking, one flag recorded that the starters had been added. */
const LEGACY_STARTERS_SEEDED = 'startersSeeded';
const SEEDED_STARTERS = 'seededStarters';

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

  /**
   * Add each bundled starter project once (new starters appear when the app updates).
   * A starter the user archived or changed is never re-added. `legacyIds` are starters that
   * browsers seeded before seeding was tracked per starter.
   */
  // ---- Small helpers for cloud sync ----

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    if (value === undefined) await this.db.meta.delete(key);
    else await this.db.meta.put({ key, value });
  }

  async deleteMetaPrefix(prefix: string): Promise<void> {
    await this.db.meta.where('key').startsWith(prefix).delete();
  }

  /** Store a project exactly as it came from another device (same ID and revision). */
  async putProjectAsIs(project: Project): Promise<void> {
    const p = ProjectSchema.parse(project);
    await this.db.projects.put({ id: p.id, updatedAt: p.updatedAt, doc: p });
  }

  async allVersionRows(): Promise<VersionRow[]> {
    return this.db.versions.toArray();
  }

  async putVersionRow(row: VersionRow): Promise<void> {
    await this.db.versions.put(row);
  }

  async allPhotoRows(): Promise<PhotoRow[]> {
    return this.db.photos.toArray();
  }

  async putPhotoRow(row: PhotoRow): Promise<void> {
    await this.db.photos.put(row);
  }

  /** Everything on this device in one backup: projects, versions, photos, parts book. */
  async exportAll(): Promise<Backup> {
    const projects = await this.db.projects.toArray();
    const versions = await this.db.versions.toArray();
    const photos = await this.db.photos.toArray();
    const inventory = await this.getInventory();
    const backup: Backup = {
      kind: BACKUP_KIND,
      version: 1,
      createdAt: nowIso(),
      app: 'Brickwood Layout Designer',
      projects: projects.map((r) => r.doc),
      versions: versions.map((v) => ({ id: v.id, projectId: v.projectId, createdAt: v.createdAt, name: v.name, note: v.note, doc: v.doc })),
      photos: await Promise.all(
        photos.map(async (ph) => ({ id: ph.id, projectId: ph.projectId, createdAt: ph.createdAt, caption: ph.caption, thumb: ph.thumb, type: ph.blob.type || 'image/jpeg', data: toBase64(new Uint8Array(await ph.blob.arrayBuffer())) })),
      ),
      inventory,
    };
    await this.db.meta.put({ key: LAST_BACKUP, value: backup.createdAt });
    return backup;
  }

  async lastBackupAt(): Promise<string | null> {
    const row = await this.db.meta.get(LAST_BACKUP);
    return typeof row?.value === 'string' ? row.value : null;
  }

  /**
   * Restore the chosen projects from a backup (with their versions and photos). A project
   * already here is replaced, and what was here is kept as a checkpoint. Optionally the parts
   * book is replaced too.
   */
  async restoreBackup(backup: Backup, projectIds: string[], opts: { inventory?: boolean } = {}): Promise<{ restored: number }> {
    const chosen = new Set(projectIds);
    let restored = 0;
    for (const raw of backup.projects) {
      let p: Project;
      try {
        p = migrateProject(raw);
      } catch {
        continue;
      }
      if (!chosen.has(p.id)) continue;
      if (await this.db.projects.get(p.id)) await this.replaceWithVersion(p, 'Before restoring from a backup', { keepRevisionId: true });
      else await this.db.projects.put({ id: p.id, updatedAt: p.updatedAt, doc: p });
      restored++;
    }
    await this.db.transaction('rw', this.db.versions, this.db.photos, async () => {
      for (const v of backup.versions) if (chosen.has(v.projectId)) await this.db.versions.put(v);
      for (const ph of backup.photos) {
        if (!chosen.has(ph.projectId)) continue;
        await this.db.photos.put({ id: ph.id, projectId: ph.projectId, createdAt: ph.createdAt, caption: ph.caption, thumb: ph.thumb, blob: new Blob([fromBase64(ph.data)], { type: ph.type }) });
      }
    });
    if (opts.inventory && backup.inventory) {
      const inv = InventorySchema.safeParse(backup.inventory);
      if (inv.success) await this.saveInventory(inv.data);
    }
    return { restored };
  }

  /** Save a named version of a project (a full copy, kept until deleted). */
  async saveVersion(project: Project, name: string, note = ''): Promise<VersionInfo> {
    const row: VersionRow = { id: newId(), projectId: project.id, createdAt: nowIso(), name: name.trim() || 'Version', note: note.trim(), doc: ProjectSchema.parse(project) };
    await this.db.versions.put(row);
    return { id: row.id, projectId: row.projectId, createdAt: row.createdAt, name: row.name, note: row.note };
  }

  /** A project's named versions, newest first (without their contents). */
  async listVersions(projectId: string): Promise<VersionInfo[]> {
    const rows = await this.db.versions.where('projectId').equals(projectId).toArray();
    return rows.map(({ id, projectId: pid, createdAt, name, note }) => ({ id, projectId: pid, createdAt, name, note })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getVersion(id: string): Promise<Project> {
    const row = await this.db.versions.get(id);
    if (!row) throw new NotFoundError(`Version ${id} not found`);
    return migrateProject(row.doc);
  }

  async renameVersion(id: string, name: string, note: string): Promise<void> {
    await this.db.versions.update(id, { name: name.trim() || 'Version', note: note.trim() });
  }

  async deleteVersion(id: string): Promise<void> {
    await this.db.versions.delete(id);
  }

  /** Keep a photo of a physical build on this device; returns its ID. */
  async addPhoto(projectId: string, blob: Blob, thumb: string, caption = ''): Promise<string> {
    const id = newId();
    await this.db.photos.put({ id, projectId, createdAt: nowIso(), blob, thumb, caption });
    return id;
  }

  /** Photos by ID (missing ones, e.g. taken on another device, are left out). */
  async getPhotos(ids: string[]): Promise<PhotoRow[]> {
    const rows = await this.db.photos.bulkGet(ids);
    return rows.filter((r): r is PhotoRow => !!r);
  }

  async deletePhoto(id: string): Promise<void> {
    await this.db.photos.delete(id);
  }

  /** Your parts (one list for all projects), or an empty one. */
  async getInventory(): Promise<Inventory> {
    const row = await this.db.meta.get(INVENTORY);
    const parsed = InventorySchema.safeParse(row?.value);
    return parsed.success ? parsed.data : emptyInventory();
  }

  async saveInventory(inv: Inventory): Promise<void> {
    await this.db.meta.put({ key: INVENTORY, value: InventorySchema.parse(inv) });
  }

  async seedStarters(starters: Project[], legacyIds: string[] = []): Promise<number> {
    const db = this.db;
    return db.transaction('rw', db.projects, db.meta, async () => {
      const row = await db.meta.get(SEEDED_STARTERS);
      const seeded = new Set<string>(Array.isArray(row?.value) ? (row.value as string[]) : []);
      if (!row && (await db.meta.get(LEGACY_STARTERS_SEEDED))) for (const id of legacyIds) seeded.add(id);
      let added = 0;
      for (const p of starters) {
        if (seeded.has(p.id)) continue;
        seeded.add(p.id);
        if (!(await db.projects.get(p.id))) {
          await db.projects.add({ id: p.id, updatedAt: p.updatedAt, doc: ProjectSchema.parse(p) });
          added++;
        }
      }
      await db.meta.put({ key: SEEDED_STARTERS, value: [...seeded] });
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
