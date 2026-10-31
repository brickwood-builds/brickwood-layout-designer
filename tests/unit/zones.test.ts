import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule, updateModule } from '../../src/domain/edits';
import { acknowledge, addObject, splitWarnings } from '../../src/domain/objects';
import { checkLayout } from '../../src/domain/validation';
import { zoneProblems, zoneRect } from '../../src/domain/zones';
import { lego } from '../../src/domain/legoColors';
import type { Project } from '../../src/domain/schema';

/** Swings (32×32 base) with plates around it and a 4-stud operating zone. */
function swings(margin = 4) {
  let p: Project = createProject({ name: 'Zones', table: { widthIn: 40, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const plate = addModule(p, { levelId: level, kind: '32x32', center: { x: 16, y: 48 }, exact: true }, 'full');
  const ride = addModule(plate.project, { levelId: level, kind: 'custom', width: 32, depth: 32, center: { x: 16, y: 16 }, exact: true, name: 'Swings' }, 'full');
  p = updateModule(ride.project, ride.id, { clearanceStuds: margin });
  return { p, level, rideId: ride.id, plateId: plate.id };
}
const lamp = (p: Project, level: string, x: number, y: number) =>
  addObject(p, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x, y } }, 'full');

describe('operating zones', () => {
  it('the zone is the footprint grown by the margin', () => {
    const { p, rideId } = swings(4);
    expect(zoneRect(p.modules.find((m) => m.id === rideId)!)).toEqual({ x: -4, y: -4, width: 40, depth: 40 });
  });

  it('a lamp just outside the ride but inside the zone warns; the plate under the zone does not', () => {
    const { p, level } = swings(4);
    expect(zoneProblems(p)).toEqual([]);
    const near = lamp(p, level, 16, 34); // on the plate, 1 stud below the ride: inside the zone
    expect(zoneProblems(near.project).map((z) => z.message)).toEqual(['Lamp is inside the operating zone of Swings']);
    const far = lamp(p, level, 16, 44); // 11 studs away: fine
    expect(zoneProblems(far.project)).toEqual([]);
  });

  it('things built on the ride itself are part of it', () => {
    const { p, level } = swings(4);
    expect(zoneProblems(lamp(p, level, 16, 16).project)).toEqual([]);
  });

  it('with heights on, low things may sit under the zone', () => {
    const s0 = swings(4);
    let p = s0.p;
    const { level, rideId } = s0;
    p = { ...p, features: { ...p.features, heights: true } };
    const tile = addObject(p, { levelId: level, type: 'piece', name: 'Tile 2×2', width: 2, depth: 2, color: lego('Tan'), catalogKey: 'tile-2x2', center: { x: 16, y: 34 } }, 'full');
    expect(zoneProblems(tile.project)).toHaveLength(1);
    const lowOk = updateModule(tile.project, rideId, { clearAbovePlates: 3 });
    expect(zoneProblems(lowOk)).toEqual([]);
  });

  it('shows in the warnings and can be marked intended', () => {
    const { p, level } = swings(4);
    const q = lamp(p, level, 16, 34).project;
    const w = checkLayout(q).find((x) => x.kind === 'zone')!;
    expect(w).toBeTruthy();
    expect(splitWarnings(acknowledge(q, w), checkLayout(q)).open).toEqual([]);
  });
});

describe('a feature built on a plate', () => {
  it('sitting entirely on a base is not an overlap; hanging partly off it is', async () => {
    const { addModule: add, moveItems: move } = await import('../../src/domain/edits');
    let p: Project = createProject({ name: 'Castle', table: { widthIn: 40, depthIn: 30 } });
    const level = p.levels[0]!.id;
    const base = add(p, { levelId: level, kind: 'custom', width: 64, depth: 48, center: { x: 32, y: 24 }, exact: true, name: 'Castle Base' }, 'full');
    const mountain = add(base.project, { levelId: level, kind: 'custom', width: 32, depth: 48, center: { x: 40, y: 24 }, exact: true, name: 'Castle Mountain' }, 'full');
    p = mountain.project;
    expect(checkLayout(p).filter((w) => w.kind === 'overlap')).toEqual([]);
    const off = move(p, [mountain.id], 30, 0);
    expect(checkLayout(off).filter((w) => w.kind === 'overlap')).toHaveLength(1);
  });
});
