// Turning by hand (25 Nov 2026): a piece that doesn't sit square.
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule, angleOf, rotateItems, setItemAngle, turnItems } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { baseRect, footprint } from '../../src/domain/geometry';
import { itemAt } from '../../src/domain/hit';
import { checkLayout } from '../../src/domain/validation';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';

function brickOnTable() {
  const p = createProject({ name: 'Turn', table: { widthIn: 40, depthIn: 30 } });
  const levelId = p.levels[0]!.id;
  const r = addObject(p, { levelId, type: 'piece', name: 'Brick 2×8', width: 8, depth: 2, color: lego('Red'), center: { x: 20, y: 20 } }, 'full');
  return { p: r.project, levelId, id: r.id };
}
const centre = (o: { x: number; y: number; width: number; depth: number; rotation: 0 | 90 | 180 | 270 }) => {
  const b = baseRect(o);
  return { x: b.x + b.width / 2, y: b.y + b.depth / 2 };
};

describe('turning by hand', () => {
  it('turns about its middle; the angle reads back; small turns are a tilt on the quarter turn', () => {
    const { p, id } = brickOnTable();
    let q = turnItems(p, [id], 7);
    let o = q.objects.find((x) => x.id === id)!;
    expect(angleOf(o)).toBe(7);
    expect(o).toMatchObject({ rotation: 0, tilt: 7 });
    expect(centre(o)).toEqual({ x: 20, y: 20 });
    // Further than 45°: the quarter turn changes, the tilt stays small; still the same middle.
    q = setItemAngle(q, id, 100);
    o = q.objects.find((x) => x.id === id)!;
    expect(o).toMatchObject({ rotation: 90, tilt: 10 });
    expect(centre(o)).toEqual({ x: 20, y: 20 });
    expect(angleOf(setItemAngle(q, id, -3).objects.find((x) => x.id === id)!)).toBe(-3);
    // Back to square: no tilt kept.
    expect(setItemAngle(q, id, 90).objects.find((x) => x.id === id)!.tilt).toBeUndefined();
  });

  it('what it covers is its turned shape: its box grows, clicks follow the shape', () => {
    const { p, levelId, id } = brickOnTable();
    const q = setItemAngle(p, id, 30);
    const o = q.objects.find((x) => x.id === id)!;
    const f = footprint(o);
    expect(f.width).toBeCloseTo(8 * Math.cos(Math.PI / 6) + 2 * Math.sin(Math.PI / 6));
    // The brick's own end, turned down-right: picked. Where its square end used to be: not.
    expect(itemAt(q, levelId, 20 + 3.4 * Math.cos(Math.PI / 6), 20 + 3.4 * Math.sin(Math.PI / 6))?.id).toBe(id);
    expect(itemAt(q, levelId, 23.8, 19.2)).toBeNull();
  });

  it('a group turns as one block about its middle', () => {
    const { p, levelId, id } = brickOnTable();
    const second = addObject(p, { levelId, type: 'piece', name: 'Brick 2×8', width: 8, depth: 2, color: lego('Red'), center: { x: 30, y: 20 } }, 'full');
    const q = turnItems(second.project, [id, second.id], 90);
    const a = q.objects.find((x) => x.id === id)!;
    const b = q.objects.find((x) => x.id === second.id)!;
    expect(centre(a)).toEqual({ x: 25, y: 15 });
    expect(centre(b)).toEqual({ x: 25, y: 25 });
    expect([a.rotation, b.rotation]).toEqual([90, 90]);
  });

  it('quarter turns still work on a tilted piece; it stays tilted', () => {
    const { p, id } = brickOnTable();
    const q = rotateItems(setItemAngle(p, id, 5), [id], 1, 'full');
    expect(angleOf(q.objects.find((x) => x.id === id)!)).toBe(95);
  });

  it('a tilted plate at the table edge overhangs by its corner; saved and drawn turned', () => {
    const p = createProject({ name: 'Edge', table: { widthIn: 20, depthIn: 20 } });
    const levelId = p.levels[0]!.id;
    const m = addModule(p, { levelId, kind: '16x16', center: { x: 8, y: 8 }, exact: true }, 'full');
    expect(checkLayout(m.project).filter((w) => w.kind === 'overhang')).toEqual([]);
    const q = setItemAngle(m.project, m.id, 10);
    expect(checkLayout(q).filter((w) => w.kind === 'overhang')).toHaveLength(1);
    expect(parseProjectFile(exportProject(q)).modules[0]!.tilt).toBe(10);
    expect(overheadSvg(q)).toContain('<polygon class="pv-module"');
  });
});
