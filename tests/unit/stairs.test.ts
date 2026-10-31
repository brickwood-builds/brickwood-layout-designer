import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { moveItems } from '../../src/domain/edits';
import { currentPoints } from '../../src/domain/curves';
import { computeStack } from '../../src/domain/heights';
import { drawStairs, reshapeStairs, stairOfGroup, stairPath, stairUnits, type StairSettings } from '../../src/domain/stairs';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';

const settings: StairSettings = { width: 4, stepDepth: 2, risePlates: 1, startPlates: 0, landingEvery: 0, color: lego('Light Bluish Gray'), smooth: true };
const setup = () => {
  const p = createProject({ name: 'Stairs', table: { widthIn: 30, depthIn: 20 } });
  return { p, spec: { ...settings, levelId: p.levels[0]!.id, layerId: p.layers.find((l) => l.name === 'Surface details')!.id } };
};

describe('stairs', () => {
  it('a straight run: one step every 2 studs, each one plate higher', () => {
    const u = stairUnits([{ x: 10, y: 10 }, { x: 22, y: 10.4 }], settings);
    expect(u).toHaveLength(6);
    expect(u.map((s) => s.top)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(u[0]!.rect).toEqual({ x: 10, y: 8, width: 2, depth: 4 });
    expect(u.every((s) => !s.landing)).toBe(true);
  });

  it('a turn gets a square landing; runs never overlap', () => {
    const u = stairUnits([{ x: 0, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 0 }], settings);
    const landing = u.find((s) => s.landing)!;
    expect(landing.rect).toEqual({ x: 10, y: 8, width: 4, depth: 4 });
    for (let i = 0; i < u.length; i++)
      for (let j = i + 1; j < u.length; j++) {
        const [a, b] = [u[i]!.rect, u[j]!.rect];
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth).toBe(false);
      }
    // Heights keep climbing round the turn.
    expect(u.map((s) => s.top)).toEqual(u.map((_, i) => i + 1));
  });

  it('landing every 3 steps, a start height and bigger rises', () => {
    const u = stairUnits([{ x: 0, y: 2 }, { x: 20, y: 2 }], { ...settings, landingEvery: 3, startPlates: 6, risePlates: 3 });
    expect(u.map((s) => (s.landing ? 'L' : 's')).join('')).toBe('sssLsssL') // ends on a top landing;
    expect(u[0]!.top).toBe(9);
    expect(u[3]!.rect.width).toBe(4);
  });

  it('the path is straightened into whole-stud runs', () => {
    expect(stairPath([{ x: 0.3, y: 0.2 }, { x: 8.6, y: 1.4 }, { x: 9, y: 9 }], 3)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 8.5, y: 0.5 },
      { x: 8.5, y: 9.5 },
    ]);
  });

  it('drawn stairs stack in Heights, and stay editable after a move', () => {
    const { p, spec } = setup();
    const r = drawStairs(p, { ...spec, points: [{ x: 4, y: 10 }, { x: 16, y: 10 }] })!;
    const stack = computeStack(r.project, spec.levelId);
    expect(r.ids.map((id) => stack.get(id)!.top)).toEqual([1, 2, 3, 4, 5, 6]);
    const g = r.project.groups[0]!;
    expect(g.name).toMatch(/^Stairs, 6 steps up to 6 plates/);
    expect(stairOfGroup(r.project, g.id)?.id).toBe(r.stairId);
    const moved = moveItems(r.project, r.ids, 5, 0);
    const pts = currentPoints(moved, moved.stairs[0]!)!;
    expect(pts[0]).toEqual({ x: 9, y: 10 });
    const steeper = reshapeStairs(moved, r.stairId, { points: pts, risePlates: 3 });
    expect(steeper.groups).toHaveLength(1);
    expect(steeper.groups[0]!.name).toContain('6 steps');
    const steps = steeper.objects.filter((o) => steeper.groups[0]!.memberIds.includes(o.id));
    expect(steps).toHaveLength(6);
    expect(Math.min(...steps.map((o) => o.x))).toBe(9);
    expect(Math.max(...steps.map((o) => o.heightPlates!))).toBe(18);
  });

  it('stairs survive export/import', () => {
    const { p, spec } = setup();
    const r = drawStairs(p, { ...spec, points: [{ x: 4, y: 10 }, { x: 16, y: 10 }] })!;
    expect(parseProjectFile(exportProject(r.project)).stairs).toEqual(r.project.stairs);
  });
});
