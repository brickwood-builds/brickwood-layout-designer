// @vitest-environment node
// (Node's Blob survives IndexedDB storage like a browser's; jsdom's does not.)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { emptyInventory, setHave } from '../../src/domain/inventory';
import { fromBase64, parseBackup, restoreByDefault, restorePlan, toBase64 } from '../../src/domain/backup';

let dbs: BrickwoodDb[] = [];
const fresh = () => {
  const db = openDb(`b-${crypto.randomUUID()}`);
  dbs.push(db);
  return new ProjectRepository(db);
};
beforeEach(() => {
  dbs = [];
});
afterEach(async () => {
  for (const db of dbs) {
    db.close();
    await db.delete();
  }
});

describe('base64', () => {
  it('round trips any bytes', () => {
    for (const n of [0, 1, 2, 3, 4, 255, 1000]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
    }
    expect(toBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
  });
});

describe('back up everything, restore with a preview', () => {
  it('a new device gets projects, versions, photos and the parts book back', async () => {
    const a = fresh();
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await a.createProject(p);
    await a.saveVersion(p, '2025 show');
    const photo = await a.addPhoto(p.id, new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }), 'data:thumb');
    await a.saveInventory(setHave(emptyInventory(), '3024', 'White', 40));
    const text = JSON.stringify(await a.exportAll());
    expect(await a.lastBackupAt()).toBeTruthy();

    const b = fresh();
    const backup = parseBackup(text);
    const plan = restorePlan(backup, []);
    expect(plan.map((i) => [i.name, i.status, i.versions, i.photos])).toEqual([['Park', 'new', 1, 1]]);
    await b.restoreBackup(backup, plan.filter(restoreByDefault).map((i) => i.id), { inventory: true });
    expect((await b.getProject(p.id)).name).toBe('Park');
    expect((await b.listVersions(p.id)).map((v) => v.name)).toEqual(['2025 show']);
    const [ph] = await b.getPhotos([photo]);
    expect([...new Uint8Array(await ph!.blob.arrayBuffer())]).toEqual([1, 2, 3, 250]);
    expect((await b.getInventory()).have['3024|White']).toBe(40);
  });

  it('newer and older copies are told apart; restoring keeps what was here as a checkpoint', async () => {
    const repo = fresh();
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await repo.createProject(p);
    const backup = parseBackup(JSON.stringify(await repo.exportAll()));
    expect(restorePlan(backup, [await repo.getProject(p.id)])[0]!.status).toBe('same');
    // Work continues after the backup: the backup's copy is older now.
    const cur = await repo.getProject(p.id);
    const changed = await repo.saveProject(addModule(cur, { levelId: cur.levels[0]!.id, kind: '16x16', center: { x: 8, y: 8 } }, 'full').project);
    expect(restorePlan(backup, [changed])[0]!.status).toBe('older');
    expect(restoreByDefault(restorePlan(backup, [changed])[0]!)).toBe(false);
    await repo.restoreBackup(backup, [p.id]);
    expect((await repo.getProject(p.id)).modules).toHaveLength(0);
    expect((await repo.listCheckpoints(p.id)).some((c) => c.reason === 'Before restoring from a backup')).toBe(true);
  });

  it('refuses other files', () => {
    expect(() => parseBackup('{"kind":"x"}')).toThrow(/isn’t a Brickwood backup/);
    expect(() => parseBackup('nope')).toThrow(/isn’t a Brickwood backup/);
  });
});
