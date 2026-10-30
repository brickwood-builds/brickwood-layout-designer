import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { newId } from '../../src/domain/ids';
import { footprint } from '../../src/domain/geometry';
import { deleteItems, duplicateItems, moveItems, rotateItems } from '../../src/domain/edits';
import {
  acknowledge,
  addObject,
  canAcknowledge,
  deleteShape,
  expandToGroups,
  groupItems,
  modulesUnder,
  renameGroup,
  resizeObject,
  saveShape,
  splitWarnings,
  withCarriedItems,
  unacknowledge,
  ungroup,
  warningKey,
} from '../../src/domain/objects';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { MARKER_KINDS } from '../../src/domain/markers';
import { ProjectSchema, type MilsModule, type Project } from '../../src/domain/schema';
import { checkLayout } from '../../src/domain/validation';
import { starterProjects } from '../../src/starters';

function twoModules(): { p: Project; a: MilsModule; b: MilsModule } {
  const p = createProject({ name: 'Objects', table: { widthIn: 30, depthIn: 24 } });
  const make = (label: string, x: number): MilsModule => ({
    id: newId(), levelId: p.levels[0]!.id, layerId: p.layers[0]!.id, kind: '32x32', label, name: '', x, y: 0, width: 32, depth: 32, rotation: 0, notes: '',
  });
  const a = make('C-01', 0);
  const b = make('C-02', 32);
  p.modules.push(a, b);
  return { p, a, b };
}

const lamp = MARKER_KINDS.find((m) => m.key === 'lamp')!;
const level = (p: Project) => p.levels[0]!.id;

describe('placing objects', () => {
  it('a marker dropped across two modules sits on both, without moving or renumbering them', () => {
    const { p, a, b } = twoModules();
    const { project: q, id } = addObject(
      p,
      { levelId: level(p), type: 'setupMarker', name: lamp.name, width: lamp.width, depth: lamp.depth, color: lamp.color, markerKind: 'lamp', center: { x: 32, y: 10 } },
      'full',
    );
    const marker = q.objects.find((o) => o.id === id)!;
    expect(marker).toMatchObject({ x: 31, y: 9, width: 2, depth: 2, markerKind: 'lamp' });
    expect(modulesUnder(q, marker)).toEqual(['C-01', 'C-02']);
    expect(q.modules).toEqual([a, b]);
    expect(checkLayout(q)).toEqual([]); // markers on modules are expected
    expect(ProjectSchema.parse(q)).toEqual(q);
  });

  it('half-stud and free snapping place decimal coordinates exactly and they survive export/import', () => {
    const { p } = twoModules();
    const half = addObject(p, { levelId: level(p), type: 'item', name: 'Plate 1×2', width: 2, depth: 1, color: '#9ba19d', center: { x: 10.3, y: 10.3 } }, 'half');
    const free = addObject(half.project, { levelId: level(p), type: 'item', name: 'Tile', width: 1, depth: 1, color: '#f2cd37', center: { x: 40.37, y: 3.21 } }, 'free');
    const q = free.project;
    expect(q.objects.find((o) => o.id === half.id)).toMatchObject({ x: 9.5, y: 10 });
    expect(q.objects.find((o) => o.id === free.id)!.x).toBeCloseTo(39.87, 10);
    const back = parseProjectFile(exportProject(q));
    expect(back.objects).toEqual(q.objects);
  });

  it('rides look for free space; resize keeps the centre', () => {
    const { p } = twoModules();
    const { project: q, id } = addObject(p, { levelId: level(p), type: 'footprint', name: 'Swings', width: 32, depth: 32, color: '#c05046', center: { x: 16, y: 16 }, findSpace: true }, 'full');
    expect(checkLayout(q)).toEqual([]);
    const r = resizeObject(q, id, 16, 16, 'full');
    const before = footprint(q.objects[0]!);
    const after = footprint(r.objects[0]!);
    expect(after.x + after.width / 2).toBe(before.x + before.width / 2);
  });

  it('markers on a module travel with it when it moves (owner: moving the balloon-pop moves its markers)', () => {
    const { p, a, b } = twoModules();
    const add = (proj: Project, name: string, x: number, y: number) =>
      addObject(proj, { levelId: level(p), type: 'setupMarker', name, width: 2, depth: 2, color: '#fff000', center: { x, y } }, 'full');
    const lamp = add(p, 'Lamp', 10, 10); // on C-01
    const bush = add(lamp.project, 'Bush', 40, 10); // on C-02
    const edge = add(bush.project, 'Edge', 31, 20); // straddles; centre on C-01
    const q = edge.project;
    const carried = withCarriedItems(q, [a.id]);
    expect(carried.sort()).toEqual([a.id, lamp.id, edge.id].sort());
    const moved = moveItems(q, carried, 0, 40);
    expect(modulesUnder(moved, moved.objects.find((o) => o.id === lamp.id)!)).toEqual(['C-01']);
    expect(moved.objects.find((o) => o.id === bush.id)).toEqual(q.objects.find((o) => o.id === bush.id));
    expect(withCarriedItems(q, [b.id]).sort()).toEqual([b.id, bush.id].sort());
    // Locked markers stay put.
    const markerLayer = q.objects[0]!.layerId;
    const locked = { ...q, layers: q.layers.map((l) => (l.id === markerLayer ? { ...l, locked: true } : l)) };
    expect(withCarriedItems(locked, [a.id])).toEqual([a.id]);
    // Items alone don't pull anything.
    expect(withCarriedItems(q, [lamp.id])).toEqual([lamp.id]);
  });

  it('two small items in the same spot is a warning', () => {
    const { p } = twoModules();
    const one = addObject(p, { levelId: level(p), type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: '#ffffff', center: { x: 5, y: 5 } }, 'full');
    const two = addObject(one.project, { levelId: level(p), type: 'setupMarker', name: 'Bush', width: 2, depth: 2, color: '#00ff00', center: { x: 5, y: 5 } }, 'full');
    const warnings = checkLayout(two.project);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.ids.sort()).toEqual([one.id, two.id].sort());
    expect(warnings[0]!.message).toMatch(/^(Lamp overlaps Bush|Bush overlaps Lamp)$/);
  });
});

describe('my shapes', () => {
  it('save and remove a reusable shape', () => {
    const { p } = twoModules();
    const { project: q, id } = addObject(p, { levelId: level(p), type: 'footprint', name: 'Food stand', width: 8, depth: 6, color: '#123456', center: { x: 80, y: 40 } }, 'full');
    const { project: r } = saveShape(q, q.objects.find((o) => o.id === id)!, '');
    expect(r.shapes).toEqual([expect.objectContaining({ name: 'Food stand', width: 8, depth: 6, color: '#123456', type: 'footprint' })]);
    expect(deleteShape(r, r.shapes[0]!.id).shapes).toEqual([]);
  });
});

describe('groups', () => {
  it('group, expand selection, rename, ungroup', () => {
    const { p, a, b } = twoModules();
    const { project: q, id } = groupItems(p, [a.id, b.id], 'Food court');
    expect(q.groups).toEqual([{ id, name: 'Food court', memberIds: [a.id, b.id] }]);
    expect(expandToGroups(q, [a.id]).sort()).toEqual([a.id, b.id].sort());
    expect(renameGroup(q, id, '  Midway ').groups[0]!.name).toBe('Midway');
    expect(renameGroup(q, id, '   ').groups[0]!.name).toBe('Food court');
    expect(ungroup(q, id).groups).toEqual([]);
  });

  it('an item belongs to one group: regrouping moves it, leftover singletons dissolve', () => {
    const { p, a, b } = twoModules();
    const { project: q } = groupItems(p, [a.id, b.id], 'one');
    const { project: r, id } = addObject(q, { levelId: level(p), type: 'item', name: 'x', width: 1, depth: 1, color: '#000000', center: { x: 70, y: 5 } }, 'full');
    const { project: s } = groupItems(r, [b.id, id], 'two');
    expect(s.groups.map((g) => g.name)).toEqual(['two']);
  });

  it('a group moves, rotates and is duplicated as a whole; the copy is its own group', () => {
    const { p, a, b } = twoModules();
    const { project: q } = groupItems(p, [a.id, b.id], 'Pair');
    const rotated = rotateItems(q, [a.id, b.id], 1, 'full');
    expect(rotated.groups).toEqual(q.groups);
    expect(checkLayout(rotated).filter((w) => w.kind === 'overlap')).toEqual([]);
    const { project: d, ids } = duplicateItems(q, [a.id, b.id]);
    expect(d.groups).toHaveLength(2);
    expect(d.groups[1]).toMatchObject({ name: 'Pair (copy)', memberIds: ids });
    expect(d.modules.filter((m) => ids.includes(m.id)).map((m) => m.label)).toEqual(['C-03', 'C-04']);
  });

  it('deleting a member leaves the rest of the group', () => {
    const { p, a, b } = twoModules();
    const { project: q } = groupItems(p, [a.id, b.id], 'Pair');
    expect(deleteItems(q, [a.id]).groups).toEqual([]); // one left: dissolved
  });
});

describe('warning acknowledgement', () => {
  it('marking an overhang as intended hides it, keeps an audit record, and can be undone', () => {
    const { p, b } = twoModules();
    const q = moveItems(p, [b.id], 80, 0); // off the 30 in (95 stud) table
    const [w] = checkLayout(q);
    expect(w!.kind).toBe('overhang');
    expect(canAcknowledge(w!)).toBe(true);
    const r = acknowledge(q, w!, 'Hangs over on purpose for the bridge');
    expect(splitWarnings(r, checkLayout(r))).toEqual({ open: [], acknowledged: [w] });
    expect(r.acknowledgements[0]).toMatchObject({ key: warningKey(w!), message: w!.message, note: 'Hangs over on purpose for the bridge' });
    expect(acknowledge(r, w!)).toBe(r); // no duplicates
    expect(splitWarnings(unacknowledge(r, warningKey(w!)), checkLayout(r)).open).toEqual([w]);
  });

  it('ID problems cannot be marked as intended', () => {
    const { p, b } = twoModules();
    b.label = 'C-01';
    const dup = checkLayout(p).find((w) => w.kind === 'duplicateLabel')!;
    expect(canAcknowledge(dup)).toBe(false);
  });
});

describe('older files', () => {
  it('a 1A/1B export without shapes or acknowledgements still opens', () => {
    const park = starterProjects()[0]!.project;
    const legacy = JSON.parse(exportProject(park));
    delete legacy.project.shapes;
    delete legacy.project.acknowledgements;
    delete legacy.project.storedLabels;
    const back = parseProjectFile(JSON.stringify(legacy));
    expect(back.shapes).toEqual([]);
    expect(back.acknowledgements).toEqual([]);
    expect(back.storedLabels).toEqual([]);
    expect(back.modules).toEqual(park.modules);
  });
});
