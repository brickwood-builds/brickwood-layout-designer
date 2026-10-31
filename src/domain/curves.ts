// Editable curves (FR-03.04): paint pieces along a smooth curve through control points,
// and reshape it later by moving the points. One undo per draw or reshape.
import { newId } from './ids';
import { cellsForPath, paintCells, type PaintTemplate, type Pt, type WhenTaken } from './brush';
import { deleteItems, findItem, type Item } from './edits';
import { footprint, unionRect } from './geometry';
import type { Curve, Project } from './schema';

/** A smooth curve through every control point (Catmull-Rom), as closely spaced samples. */
export function splinePoints(ctrl: Pt[], perSegment = 24): Pt[] {
  if (ctrl.length < 2) return [...ctrl];
  const p = [ctrl[0]!, ...ctrl, ctrl[ctrl.length - 1]!];
  const out: Pt[] = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!];
    const n = Math.max(2, Math.ceil(perSegment * Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 16)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

export interface CurveSpec {
  levelId: string;
  layerId: string;
  points: Pt[];
  width: number;
  template: PaintTemplate;
  whenTaken: WhenTaken;
}

const brushOf = (s: { width: number; template: PaintTemplate }) => ({ cellW: s.template.width, cellD: s.template.depth, width: s.width });

function lay(p: Project, spec: CurveSpec) {
  const cells = cellsForPath(splinePoints(spec.points), brushOf(spec));
  return paintCells(p, spec.levelId, spec.layerId, spec.template, cells, spec.whenTaken);
}

function boundsOf(p: Project, ids: string[]) {
  return unionRect(ids.map((id) => findItem(p, id)).filter((i): i is Item => !!i).map(footprint)) ?? { x: 0, y: 0, width: 0, depth: 0 };
}

/** Draw a curve: its pieces become a group named after them, and the curve stays editable. */
export function drawCurve(p: Project, spec: CurveSpec): { project: Project; curveId: string; ids: string[] } | null {
  if (spec.points.length < 2) return null;
  const r = lay(p, spec);
  if (!r.ids.length) return null;
  const groupId = newId();
  const curve: Curve = { id: newId(), groupId, ...structuredClone(spec), bounds: boundsOf(r.project, r.ids) };
  const project: Project = {
    ...r.project,
    groups: [...r.project.groups, { id: groupId, name: `Curve of ${spec.template.name}`, memberIds: r.ids }],
    curves: [...r.project.curves, curve],
  };
  return { project, curveId: curve.id, ids: r.ids };
}

export const curveOfGroup = (p: Project, groupId: string) => p.curves.find((c) => c.groupId === groupId && p.groups.some((g) => g.id === groupId));

/**
 * The curve's control points where its pieces are now (the group may have been moved).
 * Null when it can't be edited as a curve any more (e.g. it was rotated, or emptied).
 */
export function currentPoints(p: Project, curve: Curve): Pt[] | null {
  const g = p.groups.find((x) => x.id === curve.groupId);
  if (!g || !g.memberIds.length) return null;
  const b = boundsOf(p, g.memberIds);
  if (Math.abs(b.width - curve.bounds.width) > 1e-6 || Math.abs(b.depth - curve.bounds.depth) > 1e-6) {
    // Same size: only moved. Different size: pieces were rotated or removed — use where it was drawn.
    const rotated = Math.abs(b.width - curve.bounds.depth) < 1e-6 && Math.abs(b.depth - curve.bounds.width) < 1e-6 && b.width !== b.depth;
    if (rotated) return null;
    return curve.points;
  }
  const dx = b.x - curve.bounds.x;
  const dy = b.y - curve.bounds.y;
  return curve.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
}

/** Reshape: re-lay the pieces along new control points (one undo). */
export function reshapeCurve(p: Project, curveId: string, points: Pt[]): Project {
  const curve = p.curves.find((c) => c.id === curveId);
  const g = curve && p.groups.find((x) => x.id === curve.groupId);
  if (!curve || !g || points.length < 2) return p;
  const cleared = deleteItems(p, g.memberIds);
  const spec: CurveSpec = { levelId: curve.levelId, layerId: curve.layerId, points, width: curve.width, template: curve.template, whenTaken: curve.whenTaken };
  const r = lay(cleared, spec);
  return {
    ...r.project,
    groups: [...r.project.groups.filter((x) => x.id !== g.id), { ...g, memberIds: r.ids }],
    curves: r.project.curves.map((c) => (c.id === curveId ? { ...c, points: structuredClone(points), bounds: boundsOf(r.project, r.ids) } : c)),
  };
}
