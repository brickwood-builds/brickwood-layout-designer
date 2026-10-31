import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addLevel, addModule, moveItems, updateLevel, updateModule, updateObject } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { clearanceProblems, computeStack, formatHeight, inchesToPlates, parseHeight, platesToInches, stackAt } from '../../src/domain/heights';
import { checkLayout } from '../../src/domain/validation';
import { lego } from '../../src/domain/legoColors';
import type { Project } from '../../src/domain/schema';

function scene() {
  let p: Project = createProject({ name: 'Heights', table: { widthIn: 40, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const m = addModule(p, { levelId: level, kind: '32x32', center: { x: 16, y: 16 }, exact: true }, 'full');
  p = m.project;
  const plate = addObject(p, { levelId: level, type: 'piece', name: 'Plate 4×4', width: 4, depth: 4, color: lego('Tan'), catalogKey: 'plate-4x4', center: { x: 10, y: 10 }, layerId: p.layers.find((l) => l.name === 'Surface details')!.id }, 'full');
  p = plate.project;
  const brick = addObject(p, { levelId: level, type: 'piece', name: 'Brick 2×2', width: 2, depth: 2, color: lego('Red'), catalogKey: 'brick-2x2', center: { x: 10, y: 10 } }, 'full');
  p = brick.project;
  return { p, level, moduleId: m.id, plateId: plate.id, brickId: brick.id };
}

describe('units', () => {
  it('plates, bricks and inches', () => {
    expect(platesToInches(3)).toBeCloseTo(0.378, 3); // one brick = 9.6 mm
    expect(inchesToPlates(10)).toBeCloseTo(79.375);
    expect(parseHeight('24')).toBe(24);
    expect(parseHeight('8 bricks')).toBe(24);
    expect(parseHeight('8b')).toBe(24);
    expect(parseHeight('10 in')).toBe(79);
    expect(parseHeight('10"')).toBe(79);
    expect(parseHeight('3,2 cm')).toBe(10);
    expect(parseHeight('tall')).toBeNull();
    expect(formatHeight(3)).toBe('3 plates (1 brick)');
    expect(formatHeight(79)).toBe('79 plates (10.0 in)');
  });
});

describe('automatic stacking', () => {
  it('a brick on a plate on a module sits on top of the plate', () => {
    const { p, level, moduleId, plateId, brickId } = scene();
    const s = computeStack(p, level);
    expect(s.get(moduleId)).toMatchObject({ base: 0, height: 0, top: 0 });
    expect(s.get(plateId)).toMatchObject({ base: 0, height: 1, top: 1 });
    expect(s.get(brickId)).toMatchObject({ base: 1, height: 3, top: 4, restsOn: plateId, manual: false });
  });

  it('moving the brick off the plate drops it back to the module', () => {
    const { p, level, brickId } = scene();
    const moved = moveItems(p, [brickId], 10, 0);
    expect(computeStack(moved, level).get(brickId)).toMatchObject({ base: 0, top: 3 });
  });

  it('a height or base set by hand wins', () => {
    const { p, level, plateId, brickId } = scene();
    const q = updateObject(updateObject(p, plateId, { heightPlates: 6 }), brickId, { baseHeightPlates: 20 });
    const s = computeStack(q, level);
    expect(s.get(plateId)!.top).toBe(6);
    expect(s.get(brickId)).toMatchObject({ base: 20, top: 23, manual: true });
  });

  it('a tall feature built on its base: its height counts from the table', () => {
    const s0 = scene();
    let p = s0.p;
    const level = s0.level;
    const f = addModule(p, { levelId: level, kind: 'custom', width: 32, depth: 32, center: { x: 60, y: 16 }, exact: true, name: 'Ferris Wheel' }, 'full');
    p = updateModule(f.project, f.id, { heightPlates: parseHeight('12 in')! });
    expect(computeStack(p, level).get(f.id)).toMatchObject({ base: 0, height: 95, top: 95 });
  });

  it('stack view lists what is at a spot, bottom to top', () => {
    const { p, level } = scene();
    expect(stackAt(p, level, { x: 9, y: 9, width: 2, depth: 2 }).map((e) => [e.name, e.info.base, e.info.top])).toEqual([
      ['C-01', 0, 0],
      ['Plate 4×4', 0, 1],
      ['Brick 2×2', 1, 4],
    ]);
  });
});

describe('shelf clearance', () => {
  function shelves(featureHeightIn: number, shelfAboveIn: number) {
    let p: Project = createProject({ name: 'Shelves', table: { widthIn: 40, depthIn: 30 } });
    p = { ...p, features: { ...p.features, heights: true } };
    const main = p.levels[0]!.id;
    p = updateLevel(p, main, { elevationIn: 30 });
    const f = addModule(p, { levelId: main, kind: 'custom', width: 32, depth: 32, center: { x: 16, y: 16 }, exact: true, name: 'Tower' }, 'full');
    p = updateModule(f.project, f.id, { heightPlates: parseHeight(`${featureHeightIn} in`)! });
    const upper = addLevel(p, { name: 'Upper shelf', elevationIn: 30 + shelfAboveIn, tableWidthIn: 40, tableDepthIn: 12 });
    return { p: upper.project, main, upperId: upper.id, towerId: f.id };
  }

  it('a tower reaching into the shelf above warns, naming the shelf', () => {
    const { p, towerId } = shelves(12, 10);
    const problems = clearanceProblems(p);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ itemId: towerId });
    expect(problems[0]!.message).toMatch(/Tower \(12\.0 in tall\) reaches Upper shelf, which is 10\.0 in above/);
    expect(checkLayout(p).filter((w) => w.kind === 'clearance')).toHaveLength(1);
  });

  it('no warning when it fits, when the shelf is elsewhere, or when heights are off', () => {
    expect(clearanceProblems(shelves(8, 10).p)).toEqual([]);
    const { p, upperId } = shelves(12, 10);
    expect(clearanceProblems(updateLevel(p, upperId, { offsetX: 500 }))).toEqual([]);
    const off = { ...p, features: { ...p.features, heights: false } };
    expect(checkLayout(off).filter((w) => w.kind === 'clearance')).toEqual([]);
  });
});

describe('stacking pieces is not a clash', () => {
  it('a brick on a plate (single pieces) gives no warning; two markers in one spot still do', () => {
    const { p, plateId, brickId, level } = scene();
    // Same layer for both, so only the "pieces stack" rule keeps it quiet.
    const markers = p.layers.find((l) => l.name === 'Markers & small items')!.id;
    const same = updateObject(p, plateId, { layerId: markers });
    expect(same.objects.every((o) => o.layerId === markers)).toBe(true);
    expect(checkLayout(same)).toEqual([]);
    expect(computeStack(same, level).get(brickId)!.base).toBe(1);
    const lamp = (q: Project) => addObject(q, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 20, y: 20 } }, 'full').project;
    expect(checkLayout(lamp(lamp(same))).map((w) => w.kind)).toEqual(['overlap']);
  });
});
