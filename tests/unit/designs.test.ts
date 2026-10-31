import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule, moveItems, updateObject } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { copiesOf, deleteDesign, designSize, isOutdated, placeDesign, saveDesign, unlinkCopy, updateCopyToDesign, updateDesignFromCopy } from '../../src/domain/designs';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';
import type { Project } from '../../src/domain/schema';

/** A food stand: a 16×16 base (feature) with a bench and a lamp, on a MILS plate. */
function foodStand() {
  let p: Project = createProject({ name: 'Designs', table: { widthIn: 60, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const plate = addModule(p, { levelId: level, kind: '32x32', center: { x: 16, y: 16 }, exact: true }, 'full');
  const stand = addModule(plate.project, { levelId: level, kind: '16x16', width: 16, depth: 16, center: { x: 12, y: 12 }, exact: true, name: 'Food stand', color: '#c05046' }, 'full');
  p = stand.project;
  const bench = addObject(p, { levelId: level, type: 'item', name: 'Bench', width: 4, depth: 1, color: lego('Reddish Brown'), center: { x: 12, y: 24 } }, 'full');
  const lamp = addObject(bench.project, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 24, y: 24 } }, 'full');
  return { p: lamp.project, level, plateId: plate.id, ids: [plate.id, stand.id, bench.id, lamp.id] };
}

describe('reusable designs', () => {
  it('save: MILS plates stay out; things are stored relative to the corner; the original becomes copy 1', () => {
    const { p, ids, plateId } = foodStand();
    const r = saveDesign(p, ids, 'Food court stand')!;
    const d = r.project.designs[0]!;
    expect(d).toMatchObject({ name: 'Food court stand', version: 1 });
    expect(d.modules.map((m) => m.name)).toEqual(['Food stand']);
    expect(d.objects.map((o) => o.name).sort()).toEqual(['Bench', 'Lamp']);
    expect(designSize(d)).toMatchObject({ x: 0, y: 0 });
    const g = r.project.groups.find((x) => x.id === r.groupId)!;
    expect(g).toMatchObject({ designId: d.id, designVersion: 1 });
    expect(g.memberIds).not.toContain(plateId);
  });

  it('place copies: new IDs, same arrangement, linked to the design', () => {
    const { p, ids, level } = foodStand();
    const saved = saveDesign(p, ids, 'Stand')!;
    const placed = placeDesign(saved.project, saved.designId, level, { x: 100.4, y: 10.2 }, 'full')!;
    const q = placed.project;
    expect(copiesOf(q, saved.designId)).toHaveLength(2);
    expect(q.groups).toHaveLength(2); // exactly one group per copy, nothing duplicated
    const copy = [...q.modules, ...q.objects].filter((i) => placed.ids.includes(i.id));
    expect(copy).toHaveLength(3);
    expect(Math.min(...copy.map((i) => i.x))).toBe(100);
    const lamp = copy.find((i) => i.name === 'Lamp')!;
    const stand = copy.find((i) => i.name === 'Food stand')!;
    const origLamp = q.objects.find((o) => o.name === 'Lamp' && !placed.ids.includes(o.id))!;
    const origStand = q.modules.find((m) => m.name === 'Food stand' && !placed.ids.includes(m.id))!;
    expect(lamp.x - stand.x).toBe(origLamp.x - origStand.x); // same arrangement
    expect(placed.ids.some((id) => ids.includes(id))).toBe(false); // new identities
  });

  it('changing the design flags other copies; they update only when asked, in place, in one step', () => {
    const { p, ids, level } = foodStand();
    const saved = saveDesign(p, ids, 'Stand')!;
    const placed = placeDesign(saved.project, saved.designId, level, { x: 100, y: 0 }, 'full')!;
    let q = placed.project;
    // Edit copy 1 (recolour its bench) and push it to the design.
    const bench1 = q.objects.find((o) => o.name === 'Bench' && !placed.ids.includes(o.id))!;
    q = updateObject(q, bench1.id, { color: lego('Dark Green') });
    q = updateDesignFromCopy(q, saved.groupId);
    expect(q.designs[0]!.version).toBe(2);
    const copy2 = q.groups.find((g) => g.id === placed.groupId)!;
    expect(isOutdated(q, copy2)).toBe(true);
    expect(isOutdated(q, q.groups.find((g) => g.id === saved.groupId)!)).toBe(false);
    // Copy 2 still has the old bench until asked.
    expect(q.objects.find((o) => o.name === 'Bench' && placed.ids.includes(o.id))!.color).toBe(lego('Reddish Brown'));
    const updated = updateCopyToDesign(q, placed.groupId);
    expect(updated.groups).toHaveLength(2);
    const g2 = updated.groups.find((g) => g.id === placed.groupId)!;
    expect(isOutdated(updated, g2)).toBe(false);
    const benches = updated.objects.filter((o) => g2.memberIds.includes(o.id) && o.name === 'Bench');
    expect(benches.map((b) => b.color)).toEqual([lego('Dark Green')]);
    expect(Math.min(...[...updated.modules, ...updated.objects].filter((i) => g2.memberIds.includes(i.id)).map((i) => i.x))).toBe(100); // same place
  });

  it('a moved copy updates where it now is', () => {
    const { p, ids, level } = foodStand();
    const saved = saveDesign(p, ids, 'Stand')!;
    const placed = placeDesign(saved.project, saved.designId, level, { x: 100, y: 0 }, 'full')!;
    let q = moveItems(placed.project, placed.ids, 20, 30);
    q = updateDesignFromCopy(q, saved.groupId); // version 2, same content
    q = updateCopyToDesign(q, placed.groupId);
    const g2 = q.groups.find((g) => g.id === placed.groupId)!;
    const items = [...q.modules, ...q.objects].filter((i) => g2.memberIds.includes(i.id));
    expect(Math.min(...items.map((i) => i.x))).toBe(120);
    expect(Math.min(...items.map((i) => i.y))).toBe(30);
  });

  it('keep as is (unlink), delete design, and designs survive export/import', () => {
    const { p, ids, level } = foodStand();
    const saved = saveDesign(p, ids, 'Stand')!;
    const placed = placeDesign(saved.project, saved.designId, level, { x: 100, y: 0 }, 'full')!;
    const unlinked = unlinkCopy(placed.project, placed.groupId);
    expect(unlinked.groups.find((g) => g.id === placed.groupId)).not.toHaveProperty('designId');
    expect(copiesOf(unlinked, saved.designId)).toHaveLength(1);
    const gone = deleteDesign(placed.project, saved.designId);
    expect(gone.designs).toEqual([]);
    expect(gone.groups.every((g) => !g.designId)).toBe(true);
    expect(gone.objects).toHaveLength(placed.project.objects.length); // copies stay
    const back = parseProjectFile(exportProject(placed.project));
    expect(back.designs).toEqual(placed.project.designs);
    expect(back.groups).toEqual(placed.project.groups);
  });

  it('a selection of only MILS plates cannot become a design', () => {
    const { p, plateId } = foodStand();
    expect(saveDesign(p, [plateId], 'Plates')).toBeNull();
  });
});
