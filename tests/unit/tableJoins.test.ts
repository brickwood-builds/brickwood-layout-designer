// Table joins (25 Nov 2026): lines the user marks where one physical table ends and the next begins.
import { describe, expect, it } from 'vitest';
import { joinAt, tableCount, tablePieces } from '../../src/domain/tableShape';
import { createProject } from '../../src/domain/project';
import { levelSurface, setLevelTableShape, toggleTableJoin } from '../../src/domain/edits';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { inchesToStuds } from '../../src/domain/units';

const S = (inches: number) => inchesToStuds(inches);
// A U, 120 × 72 in, tables 30 in deep, open at the front: a back stretch and two legs.
const U = { kind: 'U' as const, widthIn: 120, depthIn: 72, armIn: 30, side: 'front' as const };

function uTable() {
  const p = createProject({ name: 'Show', table: { widthIn: 96, depthIn: 42 } });
  const levelId = p.levels[0]!.id;
  return { p: setLevelTableShape(p, levelId, 'Table', U), levelId };
}

describe('where a click puts a join', () => {
  const pieces = tablePieces(U);
  it('across the stretch clicked, on whole studs', () => {
    // On the back stretch (wide): an up-and-down line across it.
    expect(joinAt(pieces, 100.4, 20)).toEqual({ x1: 100, y1: 0, x2: 100, y2: S(30) });
    // On a leg (long front to back): a side-to-side line across it.
    expect(joinAt(pieces, 20, 150.3)).toEqual({ x1: 0, y1: 150, x2: S(30), y2: 150 });
  });
  it('near where a leg meets the back: right on that line', () => {
    expect(joinAt(pieces, 20, S(30) + 2)).toEqual({ x1: 0, y1: S(30), x2: S(30), y2: S(30) });
  });
  it('Shift turns it; off the table, or on its outside edge, there is none', () => {
    expect(joinAt(pieces, 100, 20, true)).toEqual({ x1: 0, y1: 20, x2: S(120), y2: 20 });
    expect(joinAt(pieces, S(60), S(60))).toBeNull(); // the open middle
    expect(joinAt([{ x: 0, y: 0, width: 100, depth: 40 }], 0.2, 20)).toBeNull();
  });
});

describe('marking joins on a level', () => {
  it('each click adds one; clicking a join removes it; the count of tables follows', () => {
    const { p, levelId } = uTable();
    expect(tableCount(levelSurface(p, levelId), [])).toBe(1);
    // Legs meet the back: 2 joins → 3 tables. The back split in the middle: 4 tables.
    let q = toggleTableJoin(p, levelId, 20, S(30) + 1, 1);
    q = toggleTableJoin(q, levelId, S(120) - 20, S(30) + 1, 1);
    q = toggleTableJoin(q, levelId, S(60), 20, 1);
    const joins = q.levels[0]!.tableJoins!;
    expect(joins).toHaveLength(3);
    expect(tableCount(levelSurface(q, levelId), joins)).toBe(4);
    // Clicking the middle join again takes it away.
    q = toggleTableJoin(q, levelId, S(60) + 0.5, 30, 1);
    expect(q.levels[0]!.tableJoins).toHaveLength(2);
    expect(tableCount(levelSurface(q, levelId), q.levels[0]!.tableJoins!)).toBe(3);
  });

  it('kept in the project file and drawn on the picture; ones left off a changed table go', () => {
    const { p, levelId } = uTable();
    let q = toggleTableJoin(p, levelId, S(60), 20, 1); // on the back
    q = toggleTableJoin(q, levelId, 20, 150, 1); // on the left leg
    expect(parseProjectFile(exportProject(q)).levels[0]!.tableJoins).toHaveLength(2);
    expect(overheadSvg(q)).toContain('class="pv-table-join"');
    // Back to a 96 × 42 rectangle: the back join is still on it, the leg one isn't.
    const r = setLevelTableShape(q, levelId, 'Table', { kind: 'rect', widthIn: 96, depthIn: 42 });
    expect(r.levels[0]!.tableJoins).toEqual([{ x1: Math.round(S(60)), y1: 0, x2: Math.round(S(60)), y2: S(42) }]); // across the whole new table
  });
});
