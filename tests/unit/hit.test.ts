// What a click picks (23 Nov 2026): small things win when the click is near them.
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { itemAt } from '../../src/domain/hit';
import { lego } from '../../src/domain/legoColors';

function park() {
  let p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 20 } });
  const levelId = p.levels[0]!.id;
  const plate = addModule(p, { levelId, kind: '32x32', center: { x: 16, y: 16 }, exact: true }, 'full');
  p = plate.project;
  // A 2×4 brick on the plate, at 10..14 × 10..12.
  const brick = addObject(p, { levelId, type: 'piece', name: 'Brick 2×4', width: 4, depth: 2, color: lego('Red'), center: { x: 12, y: 11 } }, 'full');
  const lamp = addObject(brick.project, { levelId, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 17, y: 11 } }, 'full');
  return { p: lamp.project, levelId, plate: plate.id, brick: brick.id, lamp: lamp.id };
}

describe('what a click picks', () => {
  it('on the brick: the brick; well away from it: the plate', () => {
    const { p, levelId, plate, brick } = park();
    expect(itemAt(p, levelId, 12, 11, undefined, 1)?.id).toBe(brick);
    expect(itemAt(p, levelId, 25, 25, undefined, 1)?.id).toBe(plate);
  });

  it('just missing a small brick still picks it, not the plate under it', () => {
    const { p, levelId, plate, brick } = park();
    // Half a stud above the brick.
    expect(itemAt(p, levelId, 12, 9.5, undefined, 1)?.id).toBe(brick);
    // Without slack (as before), that was the plate.
    expect(itemAt(p, levelId, 12, 9.5)?.id).toBe(plate);
  });

  it('between two small things, the nearer one', () => {
    const { p, levelId, brick, lamp } = park();
    expect(itemAt(p, levelId, 14.3, 11, undefined, 2)?.id).toBe(brick);
    expect(itemAt(p, levelId, 15.7, 11, undefined, 2)?.id).toBe(lamp);
  });

  it('things on hidden or locked layers are not picked', () => {
    const { p, levelId, plate, brick } = park();
    const layerId = p.objects.find((o) => o.id === brick)!.layerId;
    const locked = { ...p, layers: p.layers.map((l) => (l.id === layerId ? { ...l, locked: true } : l)) };
    expect(itemAt(locked, levelId, 12, 9.5, undefined, 1)?.id).toBe(plate);
  });
});
