import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addContainer, addEquipment, containerOf, contentsOf, nextContainerCode, outerContainers, packItems, retireContainer, setParent, totalWeight, unpacked, updateContainer, volumeCuFt } from '../../src/domain/packing';
import { addShow, addTrip, assignTrip, dateClashes, finishShow, progress, setCheck, showUnits, toggleOmit, tripLoads, updateShow } from '../../src/domain/shows';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';

function display() {
  let p = createProject({ name: 'Park', table: { widthIn: 96, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = addModule(p, { levelId: level, kind: '16x16', center: { x: 8 + i * 16, y: 8 }, exact: true }, 'full');
    p = r.project;
    ids.push(r.id);
  }
  const ride = addModule(p, { levelId: level, kind: '32x32', width: 32, depth: 32, center: { x: 100, y: 16 }, exact: true, name: 'Carousel' }, 'full');
  return { p: ride.project, ids, ride: ride.id };
}

describe('packing', () => {
  it('containers get permanent IDs; things go in one container at a time', () => {
    const { p, ids } = display();
    let r = addContainer(p, { kind: 'tote', name: 'Modules A', widthIn: 24, depthIn: 16, heightIn: 12, weightLb: 18 });
    const tote = r.id;
    r = addContainer(r.project, { kind: 'board', name: 'Carousel board' });
    const board = r.id;
    let q = packItems(r.project, tote, ids.slice(0, 3));
    q = packItems(q, board, [ids[2]!]); // moved, not doubled
    expect(containerOf(q, ids[2]!)?.id).toBe(board);
    expect(q.containers.find((c) => c.id === tote)!.itemIds).toHaveLength(2);
    expect(unpacked(q).map((i) => i.id).sort()).toEqual([ids[3]!, q.modules.find((m) => m.name === 'Carousel')!.id].sort());
    expect(volumeCuFt(q.containers[0]!)).toBeCloseTo(2.67, 2);
  });

  it('boxes inside boxes: weights add up once; no box inside itself', () => {
    const { p } = display();
    let r = addContainer(p, { kind: 'crate', weightLb: 10 });
    const crate = r.id;
    r = addContainer(r.project, { kind: 'box', weightLb: 4 });
    const box = r.id;
    let q = setParent(r.project, box, crate);
    expect(totalWeight(q, q.containers.find((c) => c.id === crate)!)).toBe(14);
    expect(setParent(q, crate, box)).toBe(q); // would be inside itself
    expect(outerContainers(q).map((c) => c.id)).toEqual([crate]);
    q = addEquipment(q, crate, 'Power strip', 2);
    expect(contentsOf(q, q.containers.find((c) => c.id === crate)!)).toEqual(['2 × Power strip', `Inside: BX-002 Box`]);
  });

  it('retired IDs stay reserved; storage moves are in the history', () => {
    const { p, ids } = display();
    const r = addContainer(p, { kind: 'tote' });
    let q = packItems(r.project, r.id, [ids[0]!]);
    q = updateContainer(q, r.id, { storage: 'Garage shelf 1' });
    q = retireContainer(q, r.id, 'Cracked lid');
    const c = q.containers[0]!;
    expect(c).toMatchObject({ retired: true, itemIds: [] });
    expect(c.history.map((h) => h.text)).toEqual(['BX-001 added', 'Packed: B-01', 'Now at: Garage shelf 1', 'Retired: Cracked lid']);
    expect(nextContainerCode(q)).toBe('BX-002');
  });
});

describe('shows', () => {
  function packed() {
    const { p, ids, ride } = display();
    let r = addContainer(p, { kind: 'tote', name: 'Modules', widthIn: 24, depthIn: 18, heightIn: 12 });
    const tote = r.id;
    r = addContainer(r.project, { kind: 'box', name: 'Small parts' });
    const inner = r.id;
    let q = packItems(r.project, tote, ids);
    q = setParent(q, inner, tote);
    q = addEquipment(q, inner, 'Table skirt', 1);
    return { p: q, ids, ride, tote, inner };
  }

  it('checklist units: outer containers and unboxed things; omitted things drop out', () => {
    const { p, tote, ride } = packed();
    const s = addShow(p, { name: 'BrickFair', start: '2027-08-05', end: '2027-08-08' });
    let units = showUnits(s.project, s.project.shows[0]!);
    expect(units.map((u) => u.id)).toEqual([tote, ride]);
    const q = toggleOmit(s.project, s.id, ride);
    units = showUnits(q, q.shows[0]!);
    expect(units.map((u) => u.id)).toEqual([tote]);
    expect(q.modules.some((m) => m.id === ride)).toBe(true); // the layout is unchanged
  });

  it('packed, loaded, unloaded and back home are separate ticks', () => {
    const { p, tote } = packed();
    const s = addShow(p, { name: 'Show', start: '2027-01-01', end: '2027-01-02' });
    const q = setCheck(s.project, s.id, tote, 'packed', true);
    const units = showUnits(q, q.shows[0]!);
    expect(progress(q.shows[0]!, units)).toEqual({ packed: 1, loaded: 0, unloaded: 0, home: 0 });
  });

  it('trips: each unit on one trip; over capacity is flagged', () => {
    const { p, tote, ride } = packed();
    const s = addShow(p, { name: 'Show', start: '2027-01-01', end: '2027-01-02' });
    let q = addTrip(s.project, s.id, 'Van trip 1', 2);
    q = addTrip(q, s.id, 'Car trip 2');
    const [t1, t2] = q.shows[0]!.trips;
    q = assignTrip(q, s.id, tote, t1!.id);
    q = assignTrip(q, s.id, ride, t1!.id);
    q = assignTrip(q, s.id, ride, t2!.id); // moved to the second trip
    const loads = tripLoads(q.shows[0]!, showUnits(q, q.shows[0]!));
    expect(loads[0]).toMatchObject({ volume: 3, over: true, unsized: 0 });
    expect(loads[0]!.units.map((u) => u.id)).toEqual([tote]);
    expect(loads[1]!.units.map((u) => u.id)).toEqual([ride]);
  });

  it('date clashes; finishing keeps a snapshot that later edits do not change; file round trip', () => {
    const { p, ride, tote } = packed();
    let r = addShow(p, { name: 'A', start: '2027-05-01', end: '2027-05-03' });
    r = addShow(r.project, { name: 'B', start: '2027-05-03', end: '2027-05-04' });
    expect(dateClashes(r.project).map(([a, b]) => [a.name, b.name])).toEqual([['A', 'B']]);
    let q = updateShow(r.project, r.id, { start: '2027-06-01', end: '2027-06-02' });
    expect(dateClashes(q)).toEqual([]);
    const showA = q.shows[0]!.id;
    q = toggleOmit(q, showA, ride);
    q = finishShow(q, showA);
    const snap = q.shows[0]!.snapshot!;
    expect(snap.containers.map((c) => c.code)).toEqual(['BX-001']);
    expect(snap.omitted).toEqual(['Carousel']);
    const later = packItems(q, tote, [ride]);
    expect(later.shows[0]!.snapshot).toEqual(snap);
    expect(parseProjectFile(exportProject(q)).shows).toEqual(q.shows);
  });
});
