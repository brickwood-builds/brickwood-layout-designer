import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';
import { createProject } from '../../src/domain/project';
import { addModule, deleteItems, moveItems, updateModule } from '../../src/domain/edits';
import { paintCells } from '../../src/domain/brush';
import { compareProjects, isSame } from '../../src/domain/compare';
import { emptyInventory } from '../../src/domain/inventory';
import { lego } from '../../src/domain/legoColors';

let db: BrickwoodDb;
let repo: ProjectRepository;
beforeEach(() => {
  db = openDb(`v-${crypto.randomUUID()}`);
  repo = new ProjectRepository(db);
});
afterEach(async () => {
  db.close();
  await db.delete();
});

function park() {
  const p = createProject({ name: 'Park', table: { widthIn: 60, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const a = addModule(p, { levelId: level, kind: '32x32', center: { x: 16, y: 16 }, exact: true }, 'full');
  const b = addModule(a.project, { levelId: level, kind: '16x16', center: { x: 48, y: 8 }, exact: true }, 'full');
  const ride = addModule(b.project, { levelId: level, kind: '16x16', width: 16, depth: 16, center: { x: 80, y: 8 }, exact: true, name: 'Carousel' }, 'full');
  const layer = p.layers.find((l) => l.name === 'Surface details')!.id;
  const walk = paintCells(ride.project, level, layer, { type: 'piece', name: 'Plate Round 1×1', width: 1, depth: 1, color: lego('Tan'), round: true, catalogKey: 'round-1x1' }, Array.from({ length: 10 }, (_, i) => ({ x: i, y: 40 })));
  return { p: walk.project, level, layer, ids: { a: a.id, b: b.id, ride: ride.id }, walk: walk.ids };
}

describe('comparing versions', () => {
  it('same layout: no differences', () => {
    const { p } = park();
    expect(isSame(compareProjects(p, p))).toBe(true);
  });

  it('added, removed, moved, changed, pieces summarised, part differences', () => {
    const { p, level, layer, ids, walk } = park();
    let q = deleteItems(p, [ids.b]);
    q = moveItems(q, [ids.ride], 4, 0);
    q = updateModule(q, ids.a, { plateColor: lego('Dark Green') });
    q = deleteItems(q, walk.slice(0, 4));
    q = paintCells(q, level, layer, { type: 'piece', name: 'Tile 1×1', width: 1, depth: 1, color: lego('Black'), smooth: true, catalogKey: 'tile-1x1' }, [{ x: 0, y: 44 }, { x: 1, y: 44 }]).project;
    const c = compareProjects(p, q);
    expect(c.removed.map((x) => x.name)).toEqual([p.modules.find((m) => m.id === ids.b)!.label]);
    expect(c.moved.map((x) => x.name)).toEqual(['Carousel']);
    expect(c.changed[0]!.what[0]).toMatch(/colour .* → Dark Green/);
    expect(c.piecesRemoved).toEqual([{ name: 'Plate Round 1×1', count: 4 }]);
    expect(c.piecesAdded).toEqual([{ name: 'Tile 1×1', count: 2 }]);
    expect(c.parts.map((x) => [x.partNo, x.change])).toEqual([
      ['3070b', 2],
      ['6141', -4],
    ]);
  });
});

describe('saved versions', () => {
  it('save, list newest first, read back, rename, delete; parts book is separate', async () => {
    const { p } = park();
    await repo.createProject(p);
    const v1 = await repo.saveVersion(p, '2025 show — 16 ft', 'full size');
    await new Promise((r) => setTimeout(r, 5));
    const v2 = await repo.saveVersion(deleteItems(p, [p.modules[0]!.id]), '2026 show — 12 ft');
    expect((await repo.listVersions(p.id)).map((v) => v.name)).toEqual(['2026 show — 12 ft', '2025 show — 16 ft']);
    expect((await repo.getVersion(v1.id)).modules).toHaveLength(3);
    expect((await repo.getVersion(v2.id)).modules).toHaveLength(2);
    await repo.renameVersion(v1.id, '2025 — full', 'x');
    expect((await repo.listVersions(p.id)).find((v) => v.id === v1.id)).toMatchObject({ name: '2025 — full', note: 'x' });
    await repo.deleteVersion(v2.id);
    expect(await repo.listVersions(p.id)).toHaveLength(1);
    expect(await repo.getInventory()).toEqual(emptyInventory());
  });

  it('going back to a version keeps the current layout as a checkpoint', async () => {
    const { p } = park();
    await repo.createProject(p);
    const v = await repo.saveVersion(p, 'Before');
    const changed = await repo.saveProject({ ...deleteItems(p, [p.modules[0]!.id]) });
    const back = await repo.replaceWithVersion({ ...(await repo.getVersion(v.id)), id: changed.id }, 'Before going back');
    expect(back.modules).toHaveLength(3);
    expect(back.revision).toBeGreaterThan(changed.revision);
    expect((await repo.listCheckpoints(p.id)).some((c) => c.reason === 'Before going back')).toBe(true);
  });
});
