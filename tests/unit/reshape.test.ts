// Editing a shape's corners after drawing it (27 Nov 2026).
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule, addShapedFeature, canEditShape, reshapeItem, setItemAngle, shapeCorners } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { lego } from '../../src/domain/legoColors';

const L = [{ x: 10, y: 10 }, { x: 42, y: 10 }, { x: 42, y: 26 }, { x: 26, y: 26 }, { x: 26, y: 42 }, { x: 10, y: 42 }];
function setup() {
  const p = createProject({ name: 'Town', table: { widthIn: 40, depthIn: 30 } });
  const levelId = p.levels[0]!.id;
  const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
  return { p: r.project, levelId, id: r.id };
}
const corners = (p: ReturnType<typeof setup>['p'], id: string) => shapeCorners(p.modules.find((m) => m.id === id) ?? p.objects.find((o) => o.id === id)!);

describe('editing a shape’s corners', () => {
  it('moving a corner changes the shape and its box', () => {
    const { p, id } = setup();
    const pts = corners(p, id);
    pts[1] = { x: 50, y: 10 }; // drag the top-right corner further right…
    pts[2] = { x: 50, y: 26 }; // …and the one below it
    const q = reshapeItem(p, id, pts, 'full');
    const m = q.modules.find((x) => x.id === id)!;
    expect(m).toMatchObject({ x: 10, y: 10, width: 40, depth: 32, name: 'Town hall', label: '' });
    expect(corners(q, id)).toEqual([{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 26 }, { x: 26, y: 26 }, { x: 26, y: 42 }, { x: 10, y: 42 }]);
  });

  it('adding a corner (notch) and removing one; corners snap; a line is not a shape', () => {
    const { p, id } = setup();
    // Remove the inner corner: the L becomes a 5-corner shape with a slanted side.
    const five = reshapeItem(p, id, corners(p, id).filter((_, i) => i !== 3), 'full');
    expect(corners(five, id)).toHaveLength(5);
    // A corner pulled out of the top side, dragged down to 14.4 → snaps to 14.
    const pts = corners(p, id);
    pts.splice(1, 0, { x: 26.3, y: 14.4 });
    expect(corners(reshapeItem(p, id, pts, 'full'), id)[1]).toEqual({ x: 26, y: 14 });
    // Squashed flat: left as it was.
    expect(reshapeItem(p, id, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }], 'full')).toBe(p);
  });

  it('a plain rectangle feature or item can be given a notch; a turned one keeps its corners where they are', () => {
    const p = createProject({ name: 'Park', table: { widthIn: 40, depthIn: 30 } });
    const levelId = p.levels[0]!.id;
    const pond = addObject(p, { levelId, type: 'item', name: 'Pond', width: 8, depth: 6, color: lego('Blue'), center: { x: 20, y: 20 } }, 'full');
    const pts = corners(pond.project, pond.id);
    expect(pts).toHaveLength(4);
    pts.splice(3, 0, { x: 20, y: 21 }); // a notch pushed up into the bottom side
    const q = reshapeItem(pond.project, pond.id, pts, 'full');
    expect(q.objects[0]!.outline).toHaveLength(5);
    // Turned 90°: corners on the table don't move when reshaped (it becomes square-on).
    const turned = setItemAngle(pond.project, pond.id, 90);
    const before = corners(turned, pond.id);
    const r = reshapeItem(turned, pond.id, before, 'full');
    expect(r.objects[0]!.rotation).toBe(0);
    expect(new Set(corners(r, pond.id).map((c) => `${c.x},${c.y}`))).toEqual(new Set(before.map((c) => `${c.x},${c.y}`)));
  });

  it('only features and small items can be reshaped, not MILS plates or single pieces', () => {
    const { p, levelId } = setup();
    const plate = addModule(p, { levelId, kind: '16x16', center: { x: 80, y: 80 } }, 'full');
    const piece = addObject(p, { levelId, type: 'piece', name: 'Brick', width: 2, depth: 2, color: lego('Red'), center: { x: 5, y: 5 } }, 'full');
    expect(canEditShape(plate.project.modules.find((m) => m.id === plate.id)!)).toBe(false);
    expect(canEditShape(piece.project.objects[0]!)).toBe(false);
    expect(canEditShape(p.modules[0]!)).toBe(true);
  });
});
