import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../../src/domain/project';
import { newId } from '../../src/domain/ids';
import { footprint, rectContains } from '../../src/domain/geometry';
import { nextLabel, storedNotPlaced, validateLabel } from '../../src/domain/labels';
import { SpatialIndex } from '../../src/domain/spatial';
import {
  addLevel,
  addModule,
  canDeleteLevel,
  deleteItems,
  deleteLevel,
  duplicateItems,
  findFreeSpot,
  insertCopies,
  moveItems,
  resizeModule,
  rotateItems,
  setLevelTable,
} from '../../src/domain/edits';
import { milsKindForSize, type MilsModule, type Project } from '../../src/domain/schema';
import { checkLayout } from '../../src/domain/validation';
import { studsToInches } from '../../src/domain/units';
import { starterProjects } from '../../src/starters';
import { createEditorStore } from '../../src/editor/store';
import { startAutosave } from '../../src/editor/autosave';
import { fitView, gridStep, toScreen, toWorld, zoomAt } from '../../src/editor/view';
import { openDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';

function project(): Project {
  return createProject({ name: 'Edit test', table: { widthIn: 48, depthIn: 24 } });
}

function mod(p: Project, label: string, x: number, y: number, width = 32, depth = 32): MilsModule {
  const m: MilsModule = {
    id: newId(), levelId: p.levels[0]!.id, layerId: p.layers[0]!.id, kind: milsKindForSize(width, depth),
    label, name: '', x, y, width, depth, rotation: 0, notes: '',
  };
  p.modules.push(m);
  return m;
}

describe('MILS IDs', () => {
  it('next ID follows the kind prefix, numbering and retired IDs', () => {
    const p = project();
    mod(p, 'C-01', 0, 0);
    mod(p, 'C-07', 32, 0);
    p.retiredLabels = ['B-24', 'B-25'];
    mod(p, 'B-23', 0, 32, 16, 16);
    expect(nextLabel(p, '32x32')).toBe('C-08');
    expect(nextLabel(p, '16x16')).toBe('B-26');
    expect(nextLabel(p, '16x8')).toBe('A-01');
    expect(nextLabel(p, 'custom')).toBe('');
    expect(nextLabel(p, '32x32', new Set(['C-08']))).toBe('C-09');
  });

  it('follows the village style when the project uses it', () => {
    const [, kingdom] = starterProjects();
    expect(nextLabel(kingdom!.project, '16x16')).toBe('B21-V');
    expect(nextLabel(kingdom!.project, '32x32')).toBe('C06-V');
  });

  it('plates not in the layout keep their IDs: Adventure Park v5 plates are stored, deletes are kept', () => {
    const park = starterProjects()[0]!.project;
    expect(park.storedLabels).toEqual(['A-23', 'A-24', 'A-27', 'A-28', 'B-50', 'B-51', 'B-52', 'B-53', 'B-54', 'B-55', 'B-56', 'B-59', 'B-60', 'C-14', 'C-15', 'C-16', 'C-17']);
    expect(nextLabel(park, '16x16')).toBe('B-61');
    expect(nextLabel(park, '32x32')).toBe('C-18');
    const c05 = park.modules.find((m) => m.label === 'C-05')!;
    const q = deleteItems(park, [c05.id]);
    expect(q.storedLabels).toContain('C-05');
    expect(storedNotPlaced(q)).toContain('C-05');
    // Typing a stored ID back onto a module is allowed: the plate is back in the layout.
    const other = q.modules.find((m) => m.label === 'C-06')!;
    expect(validateLabel(q, other.id, 'C-14')).toBeNull();
  });

  it('validation blocks duplicates (any case) and retired IDs, allows blank', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const b = mod(p, 'C-02', 32, 0);
    p.retiredLabels = ['B-24'];
    expect(validateLabel(p, b.id, 'c-01')).toMatch(/already used/);
    expect(validateLabel(p, b.id, 'B-24')).toMatch(/retired/);
    expect(validateLabel(p, b.id, '')).toBeNull();
    expect(validateLabel(p, a.id, 'C-01')).toBeNull();
  });
});

describe('spatial index', () => {
  it('finds overlaps but not edge contact, and marquee intersections', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const b = mod(p, 'C-02', 32, 0);
    const c = mod(p, 'C-03', 16, 16);
    const idx = new SpatialIndex(p.modules);
    expect(idx.overlapping(footprint(a)).sort()).toEqual([a.id, c.id].sort());
    expect(idx.overlapPairs()).toHaveLength(2);
    expect(idx.intersecting({ x: 40, y: 20, width: 2, depth: 2 }).sort()).toEqual([b.id, c.id].sort());
  });
});

describe('edits', () => {
  it('move keeps decimal and negative coordinates and does not touch others', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const b = mod(p, 'C-02', 32, 0);
    const q = moveItems(p, [a.id], -4.5, 2);
    expect(q.modules[0]).toMatchObject({ x: -4.5, y: 2 });
    expect(q.modules[1]).toEqual(b);
    expect(p.modules[0]!.x).toBe(0); // input untouched
  });

  it('rotating a block keeps the modules joined and on the grid', () => {
    const p = project();
    const a = mod(p, 'A-01', 0, 0, 16, 8);
    const b = mod(p, 'A-02', 16, 0, 16, 8);
    const q = rotateItems(p, [a.id, b.id], 1, 'full');
    const fa = footprint(q.modules[0]!);
    const fb = footprint(q.modules[1]!);
    expect([fa.width, fa.depth, fb.width, fb.depth]).toEqual([8, 16, 8, 16]);
    expect(fa.x).toBe(fb.x);
    expect(Math.abs(fa.y - fb.y)).toBe(16);
    for (const f of [fa, fb]) expect(Number.isInteger(f.x) && Number.isInteger(f.y)).toBe(true);
    expect(checkLayout(q).filter((w) => w.kind === 'overlap')).toEqual([]);
    // Four turns bring it back to where it started.
    let r = q;
    for (let i = 0; i < 3; i++) r = rotateItems(r, [a.id, b.id], 1, 'full');
    expect(r.modules.map((m) => [m.x, m.y, m.rotation])).toEqual(p.modules.map((m) => [m.x, m.y, m.rotation]));
  });

  it('add places a new module with the next ID in a free spot', () => {
    const p = project();
    mod(p, 'C-01', 0, 0);
    const { project: q, id } = addModule(p, { levelId: p.levels[0]!.id, kind: '32x32', center: { x: 16, y: 16 } }, 'full');
    const m = q.modules.find((x) => x.id === id)!;
    expect(m.label).toBe('C-02');
    expect(checkLayout(q).filter((w) => w.kind === 'overlap')).toEqual([]);
    // Asking for a spot below the table finds the nearest free spot on the table.
    const spot = findFreeSpot(q, p.levels[0]!.id, 16, 16, { x: 100, y: 100 }, 'full');
    const r = { ...spot, width: 16, depth: 16 };
    expect(rectContains(footprint(q.tables[0]!), r)).toBe(true);
    expect(new SpatialIndex(q.modules).overlapping(r)).toEqual([]);
  });

  it('duplicate puts copies alongside with new IDs and next MILS labels', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const blank = mod(p, '', 32, 0);
    blank.name = 'Tavern';
    const { project: q, ids } = duplicateItems(p, [a.id, blank.id]);
    const copies = q.modules.filter((m) => ids.includes(m.id));
    expect(copies.map((m) => [m.label, m.name, m.x])).toEqual([
      ['C-02', '', 64],
      ['', 'Tavern', 96],
    ]);
    expect(ids).not.toContain(a.id);
  });

  it('paste onto another level keeps the copies on that level', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const { project: q, id: shelf } = addLevel(p, { name: 'Shelf', elevationIn: 40, tableWidthIn: 48, tableDepthIn: 12 });
    const r = insertCopies(q, [a], shelf, 0, 0);
    expect(r.project.modules.find((m) => m.id === r.ids[0])!.levelId).toBe(shelf);
  });

  it('delete removes items and their group memberships', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const b = mod(p, 'C-02', 32, 0);
    p.groups = [{ id: newId(), name: 'g', memberIds: [a.id, b.id] }, { id: newId(), name: 'solo', memberIds: [a.id] }];
    const q = deleteItems(p, [a.id]);
    expect(q.modules.map((m) => m.id)).toEqual([b.id]);
    expect(q.groups).toEqual([{ ...p.groups[0]!, memberIds: [b.id] }]);
  });

  it('resize keeps the centre', () => {
    const p = project();
    const a = mod(p, 'B-01', 8, 8, 16, 16);
    const q = resizeModule(p, a.id, '32x32', 32, 32, 'full');
    expect(q.modules[0]).toMatchObject({ x: 0, y: 0, width: 32, depth: 32, kind: '32x32' });
  });

  it('levels: add with own table, edit table, delete only when empty', () => {
    const p = project();
    const { project: q, id } = addLevel(p, { name: 'Upper shelf', elevationIn: 48, tableWidthIn: 72, tableDepthIn: 12 });
    expect(q.levels).toHaveLength(2);
    const t = q.tables.find((x) => x.levelId === id)!;
    expect(studsToInches(t.width)).toBeCloseTo(72);
    const r = setLevelTable(q, id, 'Shelf board', 60, 10);
    expect(studsToInches(r.tables.find((x) => x.levelId === id)!.width)).toBeCloseTo(60);
    expect(canDeleteLevel(r, id)).toBe(true);
    const withModule = insertCopies(r, [mod(project(), 'C-09', 0, 0)], id, 0, 0).project;
    expect(canDeleteLevel(withModule, id)).toBe(false);
    expect(deleteLevel(withModule, id)).toBe(withModule);
    expect(deleteLevel(r, id).levels).toHaveLength(1);
    expect(canDeleteLevel(p, p.levels[0]!.id)).toBe(false);
  });

  it('overhang is checked against the table of the owning level', () => {
    const p = project();
    const { project: q, id } = addLevel(p, { name: 'Shelf', elevationIn: 48, tableWidthIn: 6, tableDepthIn: 6 });
    const r = insertCopies(q, [mod(project(), 'C-01', 0, 0)], id, 0, 0).project; // 32 studs > 6 in (19 studs) shelf
    const w = checkLayout(r).find((x) => x.kind === 'overhang')!;
    expect(w.levelId).toBe(id);
    expect(w.message).toMatch(/Shelf/);
  });
});

describe('view math', () => {
  it('zoom keeps the point under the pointer fixed', () => {
    const v = { scale: 2, x: 10, y: 20 };
    const before = toWorld(v, 300, 200);
    const z = zoomAt(v, 300, 200, 1.7);
    const after = toWorld(z, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const s = toScreen(z, after.x, after.y);
    expect(s.x).toBeCloseTo(300);
  });

  it('fit centres the bounds and grid spacing adapts to zoom', () => {
    const v = fitView({ x: 0, y: 0, width: 590, depth: 133 }, 1000, 500, 20);
    expect(v.scale).toBeCloseTo(960 / 590);
    expect(toScreen(v, 295, 66.5).x).toBeCloseTo(500);
    expect(gridStep(10)).toBe(1);
    expect(gridStep(1.6)).toBe(8);
  });
});

describe('editor store', () => {
  it('undo/redo restore documents but keep the saved revision metadata', () => {
    const p = project();
    const a = mod(p, 'C-01', 0, 0);
    const store = createEditorStore(p);
    const s = () => store.getState();
    s().commit((x) => moveItems(x, [a.id], 4, 0));
    s().commit((x) => moveItems(x, [a.id], 4, 0));
    s().markSaved({ revision: 7, revisionId: newId(), updatedAt: new Date().toISOString() });
    s().undo();
    expect(s().project.modules[0]!.x).toBe(4);
    expect(s().project.revision).toBe(7);
    s().undo();
    s().undo(); // nothing left: no-op
    expect(s().project.modules[0]!.x).toBe(0);
    s().redo();
    expect(s().project.modules[0]!.x).toBe(4);
    s().commit((x) => moveItems(x, [a.id], 0, 1));
    expect(s().future).toEqual([]);
  });

  it('selection drops items that disappear after undo', () => {
    const p = project();
    const store = createEditorStore(p);
    const { project: q, id } = addModule(p, { levelId: p.levels[0]!.id, kind: '16x16', center: { x: 0, y: 0 } }, 'full');
    store.getState().commit(() => q, [id]);
    expect(store.getState().selection).toEqual([id]);
    store.getState().undo();
    expect(store.getState().selection).toEqual([]);
  });
});

describe('autosave', () => {
  let db: ReturnType<typeof openDb>;
  afterEach(async () => {
    vi.useRealTimers();
    db?.close();
    await db?.delete();
  });

  it('saves changes, including edits made while a save is running, and survives reopen', async () => {
    db = openDb(`as-${newId()}`);
    const repo = new ProjectRepository(db);
    const p = await repo.createProject(project());
    const store = createEditorStore(p);
    const autosave = startAutosave(store, repo, 5);
    const s = () => store.getState();
    const { project: q, id } = addModule(s().project, { levelId: p.levels[0]!.id, kind: '32x32', center: { x: 16, y: 16 } }, 'full');
    s().commit(() => q);
    const first = autosave.flush();
    s().commit((x) => moveItems(x, [id], 1, 0)); // during the save
    await first;
    await autosave.flush();
    expect(s().saveState).toBe('saved');
    const stored = await repo.getProject(p.id);
    expect(stored.modules[0]!.x).toBe(s().project.modules[0]!.x);
    expect(stored.revision).toBe(s().project.revision);
    autosave.stop();
  });

  it('stops with a conflict instead of overwriting a save from another tab', async () => {
    db = openDb(`as-${newId()}`);
    const repo = new ProjectRepository(db);
    const p = await repo.createProject(project());
    const store = createEditorStore(p);
    const autosave = startAutosave(store, repo, 5);
    await repo.rename(p.id, 'Renamed in other tab');
    store.getState().commit((x) => ({ ...x, name: 'Mine' }));
    await autosave.flush();
    expect(store.getState().saveState).toBe('conflict');
    expect((await repo.getProject(p.id)).name).toBe('Renamed in other tab');
    autosave.stop();
  });
});
