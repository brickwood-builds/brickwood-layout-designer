// Stairs (FR-04.04): steps along straight whole-stud runs, a landing at each turn (and
// optionally every N steps), each step one rise higher. Editable: path and settings.
import { newId } from './ids';
import type { Pt } from './brush';
import { boundsOf } from './curves';
import { deleteItems } from './edits';
import type { Rect } from './geometry';
import { formatHeight } from './heights';
import type { CanvasObject, Project, Stair } from './schema';

export type StairSettings = Pick<Stair, 'width' | 'stepDepth' | 'risePlates' | 'startPlates' | 'landingEvery' | 'color' | 'smooth'>;

export interface StairSpec extends StairSettings {
  levelId: string;
  layerId: string;
  points: Pt[];
}

export interface StairUnit {
  rect: Rect;
  /** Plates from what it sits on to its top. */
  top: number;
  landing: boolean;
}

/**
 * Straighten a clicked path into runs across or down, on whole studs: each point keeps
 * the bigger of its moves from the previous one. Points sit on the centre line of the
 * stairs, so for an odd width they fall on half studs.
 */
export function stairPath(points: Pt[], width: number): Pt[] {
  const h = (width / 2) % 1;
  const on = (v: number) => Math.round(v - h) + h;
  const out: Pt[] = [];
  for (const q of points) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ x: on(q.x), y: on(q.y) });
      continue;
    }
    const across = Math.abs(q.x - prev.x) >= Math.abs(q.y - prev.y);
    const next = across ? { x: prev.x + Math.round(q.x - prev.x), y: prev.y } : { x: prev.x, y: prev.y + Math.round(q.y - prev.y) };
    if (next.x === prev.x && next.y === prev.y) continue;
    // Carrying on the same way: extend the run instead of making a turn.
    const before = out[out.length - 2];
    if (before && Math.sign(next.x - prev.x) === Math.sign(prev.x - before.x) && Math.sign(next.y - prev.y) === Math.sign(prev.y - before.y)) out[out.length - 1] = next;
    else out.push(next);
  }
  return out;
}

/** The steps and landings, bottom to top. */
export function stairUnits(points: Pt[], s: StairSettings): StairUnit[] {
  const path = stairPath(points, s.width);
  const w = s.width;
  const units: StairUnit[] = [];
  let level = s.startPlates;
  let sinceLanding = 0;
  const add = (rect: Rect, landing: boolean) => {
    level += s.risePlates;
    units.push({ rect, top: level, landing });
    sinceLanding = landing ? 0 : sinceLanding + 1;
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const horizontal = a.y === b.y;
    const sign = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
    const len = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const start = i > 1 ? w / 2 : 0; // the turn's landing is already there
    const end = i < path.length - 1 ? len - w / 2 : len;
    // A run of `depth` studs starting `t` studs along this leg.
    const run = (t: number, depth: number): Rect => {
      const along = (horizontal ? a.x : a.y) + sign * t;
      const lo = sign > 0 ? along : along - depth;
      return horizontal ? { x: lo, y: a.y - w / 2, width: depth, depth: w } : { x: a.x - w / 2, y: lo, width: w, depth };
    };
    let t = start;
    while (end - t > 1e-9) {
      const landing = s.landingEvery > 0 && sinceLanding >= s.landingEvery;
      let depth = Math.min(landing ? w : s.stepDepth, end - t);
      // Don't leave a sliver: a short leftover joins this step.
      if (end - t - depth > 0 && end - t - depth < s.stepDepth) depth = end - t;
      add(run(t, depth), landing);
      t += depth;
    }
    if (i < path.length - 1) add({ x: b.x - w / 2, y: b.y - w / 2, width: w, depth: w }, true);
  }
  return units;
}

function lay(p: Project, spec: StairSpec): { project: Project; ids: string[]; units: StairUnit[] } {
  const units = stairUnits(spec.points, spec);
  const objects: CanvasObject[] = units.map((u) => ({
    id: newId(),
    levelId: spec.levelId,
    layerId: spec.layerId,
    type: 'piece',
    name: u.landing ? 'Stair landing' : 'Stair step',
    catalogKey: 'stairs',
    x: u.rect.x,
    y: u.rect.y,
    width: u.rect.width,
    depth: u.rect.depth,
    rotation: 0,
    color: spec.color,
    notes: '',
    heightPlates: u.top,
    ...(spec.smooth ? { smooth: true } : {}),
  }));
  return { project: { ...p, objects: [...p.objects, ...objects] }, ids: objects.map((o) => o.id), units };
}

export function stairName(units: StairUnit[]): string {
  const steps = units.filter((u) => !u.landing).length;
  const top = units[units.length - 1]?.top ?? 0;
  return `Stairs, ${steps} step${steps === 1 ? '' : 's'} up to ${formatHeight(top)}`;
}

/** Lay new stairs as one group that stays editable. */
export function drawStairs(p: Project, spec: StairSpec): { project: Project; stairId: string; ids: string[] } | null {
  const r = lay(p, spec);
  if (!r.ids.length) return null;
  const groupId = newId();
  const stair: Stair = {
    id: newId(),
    groupId,
    levelId: spec.levelId,
    layerId: spec.layerId,
    points: stairPath(spec.points, spec.width),
    width: spec.width,
    stepDepth: spec.stepDepth,
    risePlates: spec.risePlates,
    startPlates: spec.startPlates,
    landingEvery: spec.landingEvery,
    color: spec.color,
    smooth: spec.smooth,
    bounds: boundsOf(r.project, r.ids),
  };
  return {
    project: { ...r.project, groups: [...r.project.groups, { id: groupId, name: stairName(r.units), memberIds: r.ids }], stairs: [...r.project.stairs, stair] },
    stairId: stair.id,
    ids: r.ids,
  };
}

export const stairOfGroup = (p: Project, groupId: string) => p.stairs.find((s) => s.groupId === groupId && p.groups.some((g) => g.id === groupId));

/** Change the path and/or settings: the steps are laid again in the same group (one undo). */
export function reshapeStairs(p: Project, stairId: string, change: Partial<StairSettings> & { points?: Pt[] }): Project {
  const stair = p.stairs.find((s) => s.id === stairId);
  const g = stair && p.groups.find((x) => x.id === stair.groupId);
  if (!stair || !g) return p;
  const next = { ...stair, ...change };
  const points = stairPath(next.points, next.width);
  if (points.length < 2) return p;
  const r = lay(deleteItems(p, g.memberIds), { ...next, points });
  if (!r.ids.length) return p;
  const autoName = g.name.startsWith('Stairs, ');
  return {
    ...r.project,
    groups: [...r.project.groups.filter((x) => x.id !== g.id), { ...g, memberIds: r.ids, name: autoName ? stairName(r.units) : g.name }],
    stairs: r.project.stairs.map((s) => (s.id === stairId ? { ...next, points, bounds: boundsOf(r.project, r.ids) } : s)),
  };
}
