import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { moveItems, rotateItems } from '../../src/domain/edits';
import { curveOfGroup, currentPoints, drawCurve, reshapeCurve, splinePoints, type CurveSpec } from '../../src/domain/curves';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';
import type { Project } from '../../src/domain/schema';

function setup() {
  const p = createProject({ name: 'Curves', table: { widthIn: 30, depthIn: 20 } });
  const spec: CurveSpec = {
    levelId: p.levels[0]!.id,
    layerId: p.layers.find((l) => l.name === 'Surface details')!.id,
    points: [{ x: 2, y: 20 }, { x: 20, y: 4 }, { x: 40, y: 20 }],
    width: 2,
    template: { type: 'piece', name: 'Plate Round 1×1', width: 1, depth: 1, color: lego('Tan'), round: true, catalogKey: 'round-1x1' },
    whenTaken: 'skip',
  };
  return { p, spec };
}

const near = (pts: { x: number; y: number }[], q: { x: number; y: number }) => pts.some((s) => Math.hypot(s.x - q.x, s.y - q.y) < 1e-9);

describe('curves', () => {
  it('the spline passes through every point and is smooth between them', () => {
    const ctrl = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
    const s = splinePoints(ctrl);
    for (const q of ctrl) expect(near(s, q)).toBe(true);
    // No big jumps between samples.
    for (let i = 1; i < s.length; i++) expect(Math.hypot(s[i]!.x - s[i - 1]!.x, s[i]!.y - s[i - 1]!.y)).toBeLessThan(1);
  });

  it('drawing a curve lays pieces as one named group and keeps it editable', () => {
    const { p, spec } = setup();
    const r = drawCurve(p, spec)!;
    expect(r.ids.length).toBeGreaterThan(40);
    const g = r.project.groups.find((x) => x.memberIds.length === r.ids.length)!;
    expect(g.name).toBe('Curve of Plate Round 1×1');
    expect(curveOfGroup(r.project, g.id)?.id).toBe(r.curveId);
    expect(currentPoints(r.project, r.project.curves[0]!)).toEqual(spec.points);
  });

  it('reshaping re-lays the pieces along the new curve, in the same group, one step', () => {
    const { p, spec } = setup();
    const r = drawCurve(p, spec)!;
    const flat = [{ x: 2, y: 20 }, { x: 40, y: 20 }];
    const q = reshapeCurve(r.project, r.curveId, flat);
    expect(q.groups).toHaveLength(1);
    const g = q.groups[0]!;
    const pieces = q.objects.filter((o) => g.memberIds.includes(o.id));
    expect(pieces.length).toBe(q.objects.length); // the old pieces are gone
    expect(new Set(pieces.map((o) => o.y)).size).toBeLessThanOrEqual(3); // a straight 2-wide band
    expect(q.curves[0]!.points).toEqual(flat);
  });

  it('a moved curve keeps its handles on its pieces', () => {
    const { p, spec } = setup();
    const r = drawCurve(p, spec)!;
    const moved = moveItems(r.project, r.ids, 10, 5);
    expect(currentPoints(moved, moved.curves[0]!)).toEqual(spec.points.map((q) => ({ x: q.x + 10, y: q.y + 5 })));
    // Reshaping after a move lays the pieces where the handles are.
    const pts = currentPoints(moved, moved.curves[0]!)!;
    const q = reshapeCurve(moved, r.curveId, pts);
    expect(Math.min(...q.objects.map((o) => o.x))).toBe(Math.min(...moved.objects.map((o) => o.x)));
  });

  it('a turned curve is no longer editable as a curve', () => {
    const { p, spec } = setup();
    const r = drawCurve(p, spec)!;
    const turned = rotateItems(r.project, r.ids, 1, 'full');
    expect(currentPoints(turned, turned.curves[0]!)).toBeNull();
  });

  it('curves survive export and import; older files without curves still open', () => {
    const { p, spec } = setup();
    const r = drawCurve(p, spec)!;
    const back = parseProjectFile(exportProject(r.project));
    expect(back.curves).toEqual(r.project.curves);
    const old = JSON.parse(exportProject(p)) as { project: Partial<Project> };
    delete old.project.curves;
    expect(parseProjectFile(JSON.stringify(old)).curves).toEqual([]);
  });
});
