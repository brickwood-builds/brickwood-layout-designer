// Table shapes (24 Nov 2026): L, U and ring tables, as table pieces that act as one surface.
import { describe, expect, it } from 'vitest';
import { onSurface, shapeProblem, surfaceEdges, tablePieces, type TableShape } from '../../src/domain/tableShape';
import { createProject } from '../../src/domain/project';
import { addLevel, addModule, findFreeSpot, setLevelTableShape } from '../../src/domain/edits';
import { checkLayout } from '../../src/domain/validation';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { tableSize } from '../../src/ui/format';
import { inchesToStuds } from '../../src/domain/units';

// 100 in = 320 studs; 50 in = 160 studs; 30 in = 96 studs (32 studs = 10 in, the Visio scale).
const S = (inches: number) => inchesToStuds(inches);
const perimeter = (s: TableShape) => surfaceEdges(tablePieces(s)).reduce((n, e) => n + Math.hypot(e.x2 - e.x1, e.y2 - e.y1), 0);
const area = (s: TableShape) => tablePieces(s).reduce((n, r) => n + r.width * r.depth, 0);

describe('table shapes', () => {
  it('a rectangle is one piece; an L two; a U three; a ring four — no overlaps', () => {
    const base = { widthIn: 100, depthIn: 50, armIn: 30 };
    expect(tablePieces({ kind: 'rect', ...base })).toEqual([{ x: 0, y: 0, width: S(100), depth: S(50) }]);
    expect(tablePieces({ kind: 'L', ...base, side: 'back-left' })).toHaveLength(2);
    expect(tablePieces({ kind: 'U', ...base, side: 'front' })).toHaveLength(3);
    expect(tablePieces({ kind: 'ring', widthIn: 100, depthIn: 80, armIn: 30 })).toHaveLength(4);
    // Areas: the shape's footprint, nothing counted twice.
    expect(area({ kind: 'L', ...base, side: 'front-right' })).toBeCloseTo(S(100) * S(30) + S(30) * S(20));
    expect(area({ kind: 'U', ...base, side: 'left' })).toBeCloseTo(S(30) * S(50) + 2 * S(70) * S(30));
    expect(area({ kind: 'ring', widthIn: 100, depthIn: 80, armIn: 30 })).toBeCloseTo(S(100) * S(80) - S(40) * S(20));
  });

  it('the outline goes round the whole shape, with no seams where tables meet', () => {
    // An L's outline is the same length as its bounding box's (2 × (W + D)).
    expect(perimeter({ kind: 'L', widthIn: 100, depthIn: 50, armIn: 30, side: 'back-left' })).toBeCloseTo(2 * (S(100) + S(50)));
    // A ring: the outside plus the inside edge of the open middle.
    expect(perimeter({ kind: 'ring', widthIn: 100, depthIn: 80, armIn: 30 })).toBeCloseTo(2 * (S(100) + S(80)) + 2 * (S(40) + S(20)));
  });

  it('says when the sizes can’t make the shape', () => {
    expect(shapeProblem({ kind: 'ring', widthIn: 50, depthIn: 50, armIn: 30 })).toMatch(/no open middle/);
    expect(shapeProblem({ kind: 'L', widthIn: 30, depthIn: 50, armIn: 30 })).toMatch(/bigger/);
    expect(shapeProblem({ kind: 'U', widthIn: 100, depthIn: 50, armIn: 30 })).toBeNull();
  });

  it('on the surface: across a join between tables is fine; over a ring’s open middle is not', () => {
    const ring = tablePieces({ kind: 'ring', widthIn: 100, depthIn: 80, armIn: 30 });
    // A 32×32 plate straddling the corner join of the back and left tables.
    expect(onSurface({ x: 0, y: S(30) - 16, width: 32, depth: 32 }, ring)).toBe(true);
    // One reaching into the open middle.
    expect(onSurface({ x: S(30) - 16, y: S(30) - 16, width: 32, depth: 32 }, ring)).toBe(false);
  });
});

describe('a level with a shaped table', () => {
  function project() {
    const p = createProject({ name: 'Show', table: { widthIn: 96, depthIn: 42 } });
    return { p, levelId: p.levels[0]!.id, tableId: p.tables[0]!.id };
  }

  it('becomes the shape’s pieces where the table was, keeping the table’s ID; back to a rectangle too', () => {
    const { p, levelId, tableId } = project();
    const q = setLevelTableShape(p, levelId, 'Show tables', { kind: 'U', widthIn: 120, depthIn: 60, armIn: 30, side: 'front' });
    const tables = q.tables.filter((t) => t.levelId === levelId);
    expect(tables).toHaveLength(3);
    expect(tables[0]!.id).toBe(tableId);
    expect(tables.every((t) => t.name === 'Show tables')).toBe(true);
    expect(Math.min(...tables.map((t) => t.x))).toBe(0);
    expect(q.levels[0]!.tableShape).toMatchObject({ kind: 'U', side: 'front' });
    expect(tableSize(q)).toBe('10 ft × 5 ft U-shape table');
    const back = setLevelTableShape(q, levelId, 'Show tables', { kind: 'rect', widthIn: 96, depthIn: 42 });
    expect(back.tables.filter((t) => t.levelId === levelId)).toHaveLength(1);
    expect(back.levels[0]!.tableShape).toBeUndefined();
    // Saved and opened again.
    expect(parseProjectFile(exportProject(q)).levels[0]!.tableShape).toMatchObject({ kind: 'U', armIn: 30 });
  });

  it('warnings: a plate over the U’s open middle overhangs; one across a join doesn’t', () => {
    const { p, levelId } = project();
    const q = setLevelTableShape(p, levelId, 'Table', { kind: 'U', widthIn: 120, depthIn: 60, armIn: 30, side: 'front' });
    // Across the join of the back table and the left leg: fine.
    const join = addModule(q, { levelId, kind: '32x32', center: { x: 16, y: S(30) }, exact: true }, 'full');
    expect(checkLayout(join.project).filter((w) => w.kind === 'overhang')).toEqual([]);
    // In the middle of the opening.
    const middle = addModule(q, { levelId, kind: '32x32', center: { x: S(60), y: S(45) }, exact: true }, 'full');
    expect(checkLayout(middle.project).filter((w) => w.kind === 'overhang').map((w) => w.message)).toEqual(['C-01 overhangs Table']);
  });

  it('new modules go on the tables, not into the open middle', () => {
    const { p, levelId } = project();
    const q = setLevelTableShape(p, levelId, 'Table', { kind: 'ring', widthIn: 120, depthIn: 100, armIn: 30 });
    const at = findFreeSpot(q, levelId, 32, 32, { x: S(60), y: S(50) }, 'full');
    expect(onSurface({ ...at, width: 32, depth: 32 }, q.tables.map((t) => t))).toBe(true);
  });

  it('a new shelf level can be shaped too, and the picture draws one outline', () => {
    const { p } = project();
    const r = addLevel(p, { name: 'Shelf', elevationIn: 40, tableWidthIn: 0, tableDepthIn: 0, tableShape: { kind: 'L', widthIn: 60, depthIn: 40, armIn: 12, side: 'back-right' } });
    expect(r.project.tables.filter((t) => t.levelId === r.id)).toHaveLength(2);
    const svg = overheadSvg(r.project, { levelId: r.id });
    expect(svg).toContain('class="pv-table-edge"');
    expect(svg.match(/class="pv-table-fill"/g)).toHaveLength(2);
  });
});
