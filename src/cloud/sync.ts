// Sync with the cloud folder (OneDrive). What is synced: every project, the parts book,
// saved versions and build photos. Each device remembers, per project, the cloud copy it
// last saw (eTag) and the local revision it last sent or took. From that:
//   only this device changed  → send it      only the cloud changed → take it
//   both changed              → a conflict the user decides; nothing is overwritten.
// Taking a cloud copy keeps the local one as a checkpoint. Versions and photos never change
// once saved, so they are simply copied both ways.
import { exportProject, parseProjectFile } from '../domain/exchange';
import { InventorySchema, type Inventory } from '../domain/inventory';
import { fromBase64, toBase64 } from '../domain/backup';
import { migrateProject } from '../domain/migrations';
import type { Project } from '../domain/schema';
import type { ProjectRepository } from '../storage/repository';
import { RemoteChangedError, type CloudDrive } from './drive';

interface Seen {
  eTag: string;
  revisionId: string;
}

export interface Conflict {
  projectId: string;
  name: string;
  /** When each copy was last changed. */
  here: string;
  there: string;
}

export interface SyncReport {
  sent: string[];
  taken: string[];
  added: string[];
  conflicts: Conflict[];
  versions: number;
  photos: number;
  partsBook: 'sent' | 'taken' | null;
}

const P = (id: string) => `projects/${id}.json`;
const seenKey = (id: string) => `cloud:seen:${id}`;
const INV_DIR = 'account';
const INV = `${INV_DIR}/parts-book.json`;
const INV_SEEN = 'cloud:seen:parts-book';

export class SyncEngine {
  constructor(
    private repo: ProjectRepository,
    private drive: CloudDrive,
  ) {}

  private seen = (id: string) => this.repo.getMeta<Seen>(seenKey(id));
  private remember = (id: string, s: Seen) => this.repo.setMeta(seenKey(id), s);

  private async send(p: Project, ifMatch: string | null) {
    const { eTag } = await this.drive.write(P(p.id), exportProject(p), ifMatch);
    await this.remember(p.id, { eTag, revisionId: p.revisionId });
  }

  private async take(remote: Project, eTag: string, local: Project | null) {
    if (local) await this.repo.replaceWithVersion(remote, 'Before taking the version from OneDrive', { keepRevisionId: true });
    else await this.repo.putProjectAsIs(remote);
    await this.remember(remote.id, { eTag, revisionId: remote.revisionId });
  }

  private async fetchProject(id: string): Promise<{ project: Project; eTag: string } | null> {
    const f = await this.drive.read(P(id));
    return f ? { project: parseProjectFile(f.text), eTag: f.eTag } : null;
  }

  /** Sync everything. Conflicts are reported, never resolved here. */
  async syncAll(): Promise<SyncReport> {
    const report: SyncReport = { sent: [], taken: [], added: [], conflicts: [], versions: 0, photos: 0, partsBook: null };
    const remote = new Map((await this.drive.list('projects')).filter((f) => f.name.endsWith('.json')).map((f) => [f.name.slice(0, -5), f]));
    const { projects: local } = await this.repo.listProjects({ includeArchived: true });

    for (const p of local) {
      const rf = remote.get(p.id);
      remote.delete(p.id);
      const seen = await this.seen(p.id);
      try {
        if (!rf) {
          await this.send(p, null);
          report.sent.push(p.id);
          continue;
        }
        // Never synced: a copy nobody has edited (revision 0, e.g. the starters every device
        // gets) has nothing to keep, so the cloud copy simply wins.
        const hereChanged = seen ? seen.revisionId !== p.revisionId : p.revision > 0;
        const thereChanged = !seen || seen.eTag !== rf.eTag;
        if (!hereChanged && !thereChanged) continue;
        if (hereChanged && !thereChanged) {
          await this.send(p, rf.eTag);
          report.sent.push(p.id);
          continue;
        }
        const r = await this.fetchProject(p.id);
        if (!r) continue;
        if (r.project.revisionId === p.revisionId) {
          await this.remember(p.id, { eTag: r.eTag, revisionId: p.revisionId }); // already the same
        } else if (!hereChanged) {
          await this.take(r.project, r.eTag, p);
          report.taken.push(p.id);
        } else {
          report.conflicts.push({ projectId: p.id, name: p.name, here: p.updatedAt, there: r.project.updatedAt });
        }
      } catch (e) {
        if (e instanceof RemoteChangedError) report.conflicts.push({ projectId: p.id, name: p.name, here: p.updatedAt, there: '' });
        else throw e;
      }
    }
    // Projects made on another device.
    for (const [id] of remote) {
      const r = await this.fetchProject(id).catch(() => null);
      if (!r) continue;
      await this.take(r.project, r.eTag, null);
      report.added.push(id);
    }

    report.partsBook = await this.syncPartsBook();
    report.versions = await this.syncVersions();
    report.photos = await this.syncPhotos();
    await this.repo.setMeta('cloud:conflicts', report.conflicts);
    await this.repo.setMeta('cloud:lastSync', new Date().toISOString());
    return report;
  }

  /** Settle a conflict: keep this device's copy (send it) or the other device's (take it). */
  async resolve(projectId: string, keep: 'here' | 'there'): Promise<void> {
    const r = await this.fetchProject(projectId);
    const local = await this.repo.getProject(projectId).catch(() => null);
    if (keep === 'there' && r) await this.take(r.project, r.eTag, local);
    if (keep === 'here' && local) await this.send(local, r ? r.eTag : null);
    const left = ((await this.repo.getMeta<Conflict[]>('cloud:conflicts')) ?? []).filter((c) => c.projectId !== projectId);
    await this.repo.setMeta('cloud:conflicts', left);
  }

  /** Parts book: one per account. If both changed, the most recently changed one wins. */
  private async syncPartsBook(): Promise<'sent' | 'taken' | null> {
    const seen = await this.repo.getMeta<{ eTag: string; updatedAt: string }>(INV_SEEN);
    const mine = await this.repo.getInventory();
    const list = await this.drive.list(INV_DIR);
    const rf = list.find((f) => `${INV_DIR}/${f.name}` === INV);
    const hereChanged = !seen || seen.updatedAt !== mine.updatedAt;
    const thereChanged = !!rf && (!seen || seen.eTag !== rf.eTag);
    const empty = !Object.keys(mine.have).length && !Object.keys(mine.brickwith).length && !Object.keys(mine.prices).length;
    if (!rf) {
      if (empty) return null;
      const { eTag } = await this.drive.write(INV, JSON.stringify(mine), null);
      await this.repo.setMeta(INV_SEEN, { eTag, updatedAt: mine.updatedAt });
      return 'sent';
    }
    if (!hereChanged && !thereChanged) return null;
    let theirs: Inventory | null = null;
    let theirETag = rf.eTag;
    if (thereChanged) {
      const f = await this.drive.read(INV);
      const parsed = f ? InventorySchema.safeParse(JSON.parse(f.text)) : null;
      theirs = parsed?.success ? parsed.data : null;
      if (f) theirETag = f.eTag;
    }
    if (theirs && (!hereChanged || empty || theirs.updatedAt > mine.updatedAt)) {
      await this.repo.saveInventory(theirs);
      await this.repo.setMeta(INV_SEEN, { eTag: theirETag, updatedAt: theirs.updatedAt });
      return 'taken';
    }
    if (hereChanged) {
      try {
        const { eTag } = await this.drive.write(INV, JSON.stringify(mine), theirETag);
        await this.repo.setMeta(INV_SEEN, { eTag, updatedAt: mine.updatedAt });
        return 'sent';
      } catch (e) {
        if (e instanceof RemoteChangedError) return null; // next sync sorts it out
        throw e;
      }
    }
    return null;
  }

  /** Versions never change once saved: copy any missing ones each way. */
  private async syncVersions(): Promise<number> {
    const there = new Set((await this.drive.list('versions')).map((f) => f.name.replace(/\.json$/, '')));
    const here = await this.repo.allVersionRows();
    let n = 0;
    for (const v of here) {
      if (there.has(v.id)) continue;
      await this.drive.write(`versions/${v.id}.json`, JSON.stringify(v), null).catch(() => undefined);
      n++;
    }
    const mine = new Set(here.map((v) => v.id));
    for (const id of there) {
      if (mine.has(id)) continue;
      const f = await this.drive.read(`versions/${id}.json`);
      if (!f) continue;
      const v = JSON.parse(f.text) as { id: string; projectId: string; createdAt: string; name: string; note: string; doc: unknown };
      migrateProject(v.doc); // refuse anything unreadable
      await this.repo.putVersionRow(v);
      n++;
    }
    return n;
  }

  /** Photos never change once added: copy any missing ones each way. */
  private async syncPhotos(): Promise<number> {
    const there = new Set((await this.drive.list('photos')).map((f) => f.name.replace(/\.json$/, '')));
    const here = await this.repo.allPhotoRows();
    let n = 0;
    for (const ph of here) {
      if (there.has(ph.id)) continue;
      const data = toBase64(new Uint8Array(await ph.blob.arrayBuffer()));
      await this.drive
        .write(`photos/${ph.id}.json`, JSON.stringify({ id: ph.id, projectId: ph.projectId, createdAt: ph.createdAt, caption: ph.caption, thumb: ph.thumb, type: ph.blob.type || 'image/jpeg', data }), null)
        .catch(() => undefined);
      n++;
    }
    const mine = new Set(here.map((p) => p.id));
    for (const id of there) {
      if (mine.has(id)) continue;
      const f = await this.drive.read(`photos/${id}.json`);
      if (!f) continue;
      const ph = JSON.parse(f.text) as { id: string; projectId: string; createdAt: string; caption: string; thumb: string; type: string; data: string };
      await this.repo.putPhotoRow({ id: ph.id, projectId: ph.projectId, createdAt: ph.createdAt, caption: ph.caption, thumb: ph.thumb, blob: new Blob([fromBase64(ph.data)], { type: ph.type }) });
      n++;
    }
    return n;
  }
}
