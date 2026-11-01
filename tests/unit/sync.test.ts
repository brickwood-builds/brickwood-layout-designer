// @vitest-environment node
// (Node's Blob survives IndexedDB storage like a browser's.)
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { emptyInventory, setHave } from '../../src/domain/inventory';
import { MemoryDrive } from '../../src/cloud/drive';
import { SyncEngine } from '../../src/cloud/sync';

const dbs: BrickwoodDb[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});
function device(drive: MemoryDrive) {
  const db = openDb(`s-${crypto.randomUUID()}`);
  dbs.push(db);
  const repo = new ProjectRepository(db);
  return { repo, sync: new SyncEngine(repo, drive) };
}
async function addPlate(repo: ProjectRepository, id: string) {
  const p = await repo.getProject(id);
  return repo.saveProject(addModule(p, { levelId: p.levels[0]!.id, kind: '16x16', center: { x: 8, y: 8 } }, 'full').project);
}

describe('OneDrive sync between two devices', () => {
  it('a project made on the computer appears on the iPad; changes flow both ways', async () => {
    const drive = new MemoryDrive();
    const pc = device(drive);
    const ipad = device(drive);
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await pc.repo.createProject(p);
    expect((await pc.sync.syncAll()).sent).toEqual([p.id]);
    expect((await ipad.sync.syncAll()).added).toEqual([p.id]);
    expect((await ipad.repo.getProject(p.id)).name).toBe('Park');
    // Nothing changed: nothing to do.
    const quiet = await pc.sync.syncAll();
    expect([quiet.sent, quiet.taken, quiet.added, quiet.conflicts]).toEqual([[], [], [], []]);
    // Changed on the iPad → taken on the computer (its copy kept as a checkpoint).
    await addPlate(ipad.repo, p.id);
    expect((await ipad.sync.syncAll()).sent).toEqual([p.id]);
    expect((await pc.sync.syncAll()).taken).toEqual([p.id]);
    expect((await pc.repo.getProject(p.id)).modules).toHaveLength(1);
    expect((await pc.repo.listCheckpoints(p.id)).some((c) => c.reason === 'Before taking the version from OneDrive')).toBe(true);
  });

  it('changed on both: a conflict; nothing is overwritten until you choose', async () => {
    const drive = new MemoryDrive();
    const pc = device(drive);
    const ipad = device(drive);
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await pc.repo.createProject(p);
    await pc.sync.syncAll();
    await ipad.sync.syncAll();
    await addPlate(pc.repo, p.id);
    await addPlate(ipad.repo, p.id);
    await addPlate(ipad.repo, p.id);
    await ipad.sync.syncAll();
    const r = await pc.sync.syncAll();
    expect(r.conflicts.map((c) => c.name)).toEqual(['Park']);
    expect((await pc.repo.getProject(p.id)).modules).toHaveLength(1); // untouched
    expect(await pc.repo.getMeta('cloud:conflicts')).toHaveLength(1);
    await pc.sync.resolve(p.id, 'there');
    expect((await pc.repo.getProject(p.id)).modules).toHaveLength(2);
    expect(await pc.repo.getMeta('cloud:conflicts')).toEqual([]);
    // Keeping this device's copy instead sends it.
    await addPlate(pc.repo, p.id);
    await addPlate(ipad.repo, p.id);
    await ipad.sync.syncAll();
    await pc.sync.syncAll();
    await pc.sync.resolve(p.id, 'here');
    await ipad.sync.syncAll();
    expect((await ipad.repo.getProject(p.id)).modules).toHaveLength(3);
  });

  it('parts book, versions and photos follow too', async () => {
    const drive = new MemoryDrive();
    const pc = device(drive);
    const ipad = device(drive);
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await pc.repo.createProject(p);
    await pc.repo.saveInventory(setHave(emptyInventory(), '3024', 'White', 40));
    await pc.repo.saveVersion(p, '2025 show');
    const photo = await pc.repo.addPhoto(p.id, new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }), 'thumb');
    const r1 = await pc.sync.syncAll();
    expect(r1).toMatchObject({ partsBook: 'sent', versions: 1, photos: 1 });
    const r2 = await ipad.sync.syncAll();
    expect(r2).toMatchObject({ partsBook: 'taken', versions: 1, photos: 1 });
    expect((await ipad.repo.getInventory()).have['3024|White']).toBe(40);
    expect((await ipad.repo.listVersions(p.id)).map((v) => v.name)).toEqual(['2025 show']);
    const [ph] = await ipad.repo.getPhotos([photo]);
    expect([...new Uint8Array(await ph!.blob.arrayBuffer())]).toEqual([9, 8, 7]);
    // Parts book changed on the iPad later → the computer takes it.
    await new Promise((r) => setTimeout(r, 5));
    await ipad.repo.saveInventory(setHave(await ipad.repo.getInventory(), '3024', 'White', 55));
    await ipad.sync.syncAll();
    expect((await pc.sync.syncAll()).partsBook).toBe('taken');
    expect((await pc.repo.getInventory()).have['3024|White']).toBe(55);
  });

  it('the starters every device has: the iPad takes the edited ones, no conflict', async () => {
    const drive = new MemoryDrive();
    const pc = device(drive);
    const ipad = device(drive);
    const starter = createProject({ name: 'Starter', table: { widthIn: 30, depthIn: 30 } });
    await pc.repo.createProject(starter);
    await ipad.repo.createProject(structuredClone(starter)); // same ID on both, never edited
    await addPlate(pc.repo, starter.id);
    await pc.sync.syncAll();
    const r = await ipad.sync.syncAll();
    expect(r.conflicts).toEqual([]);
    expect(r.taken).toEqual([starter.id]);
    expect((await ipad.repo.getProject(starter.id)).modules).toHaveLength(1);
  });
});
