import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addObject } from '../../src/domain/objects';
import { saveDesign } from '../../src/domain/designs';
import { planStamps, spotsAlongPath, spotsInBox, stamp, type StampSource } from '../../src/domain/stamps';
import { lego } from '../../src/domain/legoColors';

const setup = () => {
  const p = createProject({ name: 'Stamps', table: { widthIn: 60, depthIn: 30 } });
  return { p, level: p.levels[0]!.id, layer: p.layers.find((l) => l.name === 'Surface details')!.id };
};
const lamp: StampSource = { kind: 'piece', template: { type: 'item', name: 'Lamp', width: 1, depth: 1, color: lego('Black'), round: true } };
const bench: StampSource = { kind: 'piece', template: { type: 'item', name: 'Bench', width: 4, depth: 1, color: lego('Reddish Brown') } };

describe('pattern stamping', () => {
  it('spots every N studs along a bent path', () => {
    const spots = spotsAlongPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 4);
    expect(spots.map((s) => [s.at.x, s.at.y])).toEqual([[0, 0], [4, 0], [8, 0], [10, 2], [10, 6], [10, 10]]);
    expect(spotsInBox({ x: 0, y: 0 }, { x: 8, y: 4 }, 4)).toHaveLength(6);
  });

  it('a lamp every 8 studs; a second pass over the same line adds nothing', () => {
    const { p, level, layer } = setup();
    const spots = spotsAlongPath([{ x: 2, y: 5 }, { x: 42, y: 5 }], 8);
    const r = stamp(p, level, layer, lamp, spots, 0, 'skip');
    expect(r.ids).toHaveLength(6);
    expect(r.project.objects.map((o) => o.x)).toEqual([2, 10, 18, 26, 34, 42].map((x) => Math.round(x - 0.5)));
    const again = stamp(r.project, level, layer, lamp, spots, 0, 'skip');
    expect(again.ids).toHaveLength(0);
    expect(again.skipped).toBe(6);
  });

  it('benches follow the path: across on a run across, turned on a run down', () => {
    const { p, level, layer } = setup();
    const spots = spotsAlongPath([{ x: 2, y: 2 }, { x: 22, y: 2 }, { x: 22, y: 22 }], 10);
    const r = stamp(p, level, layer, bench, spots, 'follow', 'skip');
    const sizes = r.project.objects.map((o) => `${o.width}x${o.depth}`);
    expect(sizes).toEqual(['4x1', '4x1', '4x1', '1x4', '1x4']); // the corner one still faces the way it came
  });

  it('stamps that would overlap each other or what is there are shown as conflicts and skipped', () => {
    const { p, level, layer } = setup();
    const blocked = addObject(p, { levelId: level, layerId: layer, type: 'item', name: 'Tree', width: 2, depth: 2, color: lego('Green'), center: { x: 11, y: 5 } }, 'full').project;
    const plan = planStamps(blocked, level, layer, bench, spotsAlongPath([{ x: 2, y: 5 }, { x: 22, y: 5 }], 2), 0, 'skip');
    expect(plan.some((s) => !s.ok)).toBe(true);
    const r = stamp(blocked, level, layer, bench, spotsAlongPath([{ x: 2, y: 5 }, { x: 22, y: 5 }], 2), 0, 'skip');
    const benches = r.project.objects.filter((o) => o.name === 'Bench');
    expect(benches.length).toBe(plan.filter((s) => s.ok).length);
    expect(benches.every((b) => b.x + b.width <= 10 || b.x >= 12)).toBe(true);
  });

  it('stamps a design: linked copies, turned on request', () => {
    const { p, level, layer } = setup();
    const b = addObject(p, { levelId: level, layerId: layer, type: 'item', name: 'Bench', width: 4, depth: 1, color: lego('Reddish Brown'), center: { x: 50, y: 50 } }, 'full');
    const l = addObject(b.project, { levelId: level, layerId: layer, type: 'item', name: 'Lamp', width: 1, depth: 1, color: lego('Black'), center: { x: 54, y: 50 } }, 'full');
    const saved = saveDesign(l.project, [b.id, l.id], 'Bench and lamp')!;
    const src: StampSource = { kind: 'design', designId: saved.designId };
    const r = stamp(saved.project, level, layer, src, spotsAlongPath([{ x: 5, y: 5 }, { x: 5, y: 25 }], 10), 90, 'skip');
    expect(r.project.groups.filter((g) => g.designId === saved.designId)).toHaveLength(4); // original + 3
    const copy = r.project.objects.filter((o) => r.ids.includes(o.id) && o.name === 'Bench');
    expect(copy.every((o) => o.rotation === 90)).toBe(true);
  });
});
