import { describe, expect, it } from 'vitest';
import { cellsForBox, cellsForLine, cellsForPath, countPieces, eraseCells, paintCells, type PaintTemplate } from '../../src/domain/brush';
import { createProject } from '../../src/domain/project';
import { checkLayout } from '../../src/domain/validation';
import { lego } from '../../src/domain/legoColors';

const round1x1: PaintTemplate = { type: 'piece', name: 'Plate Round 1×1', width: 1, depth: 1, color: lego('Tan'), round: true, catalogKey: 'round-1x1' };
const b1 = { cellW: 1, cellD: 1, width: 1 };
const sorted = (cells: { x: number; y: number }[]) => cells.map((c) => `${c.x},${c.y}`).sort();

describe('brush cells', () => {
  it('a fast freehand stroke leaves no gaps', () => {
    // Two samples 10 studs apart: every stud between them is filled.
    const cells = cellsForPath([{ x: 0.5, y: 0.5 }, { x: 10.5, y: 0.5 }], b1);
    expect(sorted(cells)).toEqual(sorted(Array.from({ length: 11 }, (_, i) => ({ x: i, y: 0 }))));
  });

  it('brush width 3 paints a walkway 3 studs wide', () => {
    const cells = cellsForLine({ x: 5, y: 5 }, { x: 15, y: 5 }, { ...b1, width: 3 });
    const rows = new Set(cells.map((c) => c.y));
    expect([...rows].sort()).toEqual([3, 4, 5, 6].filter((y) => cells.some((c) => c.y === y)));
    expect(rows.size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...cells.map((c) => c.x))).toBeLessThanOrEqual(4);
  });

  it('box fill covers the box; 2×2 pieces line up on a 2-stud grid', () => {
    expect(cellsForBox({ x: 0, y: 0 }, { x: 4, y: 3 }, b1)).toHaveLength(12);
    const big = cellsForBox({ x: 1, y: 1 }, { x: 6, y: 4 }, { cellW: 2, cellD: 2, width: 2 });
    expect(big.every((c) => c.x % 2 === 0 && c.y % 2 === 0)).toBe(true);
  });
});

describe('painting', () => {
  const setup = () => {
    const p = createProject({ name: 'Walkway', table: { widthIn: 30, depthIn: 20 } });
    return { p, level: p.levels[0]!.id, layer: p.layers.find((l) => l.name === 'Surface details')!.id };
  };

  it('a stroke places one round plate per stud, and painting over it adds nothing', () => {
    const { p, level, layer } = setup();
    const cells = cellsForLine({ x: 1.5, y: 5.5 }, { x: 19.5, y: 5.5 }, { ...b1, width: 2 });
    const r = paintCells(p, level, layer, round1x1, cells);
    expect(r.ids.length).toBe(cells.length);
    expect(r.project.objects.every((o) => o.round && o.layerId === layer && o.catalogKey === 'round-1x1')).toBe(true);
    expect(checkLayout(r.project)).toEqual([]);
    const again = paintCells(r.project, level, layer, round1x1, cells);
    expect(again.ids).toEqual([]);
    expect(again.project).toBe(r.project);
  });

  it('the eraser removes only things on that layer under the brush', () => {
    const { p, level, layer } = setup();
    const painted = paintCells(p, level, layer, round1x1, cellsForBox({ x: 0, y: 0 }, { x: 10, y: 2 }, b1)).project;
    const otherLayer = p.layers.find((l) => l.name === 'Markers & small items')!.id;
    const withLamp = paintCells(painted, level, otherLayer, { ...round1x1, type: 'setupMarker', name: 'Lamp' }, [{ x: 3, y: 0 }]).project;
    const { project, removed } = eraseCells(withLamp, level, layer, cellsForBox({ x: 0, y: 0 }, { x: 5, y: 2 }, b1), b1);
    expect(removed).toBe(10);
    expect(project.objects.filter((o) => o.layerId === layer)).toHaveLength(10);
    expect(project.objects.some((o) => o.name === 'Lamp')).toBe(true);
  });

  it('pieces are counted for lists', () => {
    const { p, level, layer } = setup();
    let q = paintCells(p, level, layer, round1x1, cellsForBox({ x: 0, y: 0 }, { x: 10, y: 4 }, b1)).project;
    q = paintCells(q, level, layer, { ...round1x1, color: lego('Light Bluish Gray') }, cellsForBox({ x: 10, y: 0 }, { x: 12, y: 4 }, b1)).project;
    expect(countPieces(q.objects)).toEqual([
      { name: 'Plate Round 1×1', color: lego('Tan'), count: 40 },
      { name: 'Plate Round 1×1', color: lego('Light Bluish Gray'), count: 8 },
    ]);
  });
});

describe('building a slope by stacking plates', () => {
  it('“stack on top” builds layers; heights rise one plate per layer', async () => {
    const { computeStack, heightColor } = await import('../../src/domain/heights');
    const p0 = createProject({ name: 'Hill', table: { widthIn: 30, depthIn: 20 } });
    const level = p0.levels[0]!.id;
    const layer = p0.layers.find((l) => l.name === 'Surface details')!.id;
    const plate2x2: PaintTemplate = { type: 'piece', name: 'Plate 2×2', width: 2, depth: 2, color: lego('Green'), catalogKey: 'plate-2x2' };
    const b2 = { cellW: 2, cellD: 2, width: 2 };
    let p = paintCells(p0, level, layer, plate2x2, cellsForBox({ x: 0, y: 0 }, { x: 12, y: 12 }, b2), 'stack').project; // 6×6 = 36
    p = paintCells(p, level, layer, plate2x2, cellsForBox({ x: 4, y: 4 }, { x: 8, y: 8 }, b2), 'stack').project; // 2×2 = 4
    p = paintCells(p, level, layer, plate2x2, cellsForBox({ x: 4, y: 4 }, { x: 6, y: 6 }, b2), 'stack').project; // 1
    expect(p.objects).toHaveLength(41);
    const tops = [...computeStack(p, level).values()].map((i) => i.top);
    expect(Math.max(...tops)).toBe(3);
    expect(tops.filter((t) => t === 2)).toHaveLength(4);
    // "Leave it" over the same area adds nothing.
    expect(paintCells(p, level, layer, plate2x2, cellsForBox({ x: 0, y: 0 }, { x: 12, y: 12 }, b2), 'skip').ids).toEqual([]);
    // Shading goes from green (low) to grey-white (top).
    expect(heightColor(0, 3)).toBe('rgb(58, 125, 68)');
    expect(heightColor(3, 3)).toBe('rgb(232, 232, 232)');
  });
});
