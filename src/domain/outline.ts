// Shaped features (19 Nov 2026): a building or ride base whose outline isn't a rectangle —
// an L, a T, a notched corner, a slanted wall. Drawn once by clicking its corners; it is
// then one object like any other feature (moves, turns, copies, resizes as one).
//
// The outline is stored on the object as corner points in studs, relative to the object's
// own upper-left corner before turning (0…width across, 0…depth down). x/y/width/depth stay
// the bounding box, so everything that works with boxes keeps working.
import { baseRect, rectsOverlap, snap, solidsClash, tiltCorners, type Rect } from './geometry';
import type { CanvasObject, Rotation } from './schema';

export interface Pt {
  x: number;
  y: number;
}

type SnapMode = 'full' | 'half' | 'free';
const EPS = 1e-9;

/** Twice the signed area (positive or negative by winding). */
const area2 = (pts: Pt[]) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length]!;
  return s + p.x * q.y - q.x * p.y;
}, 0);

const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/**
 * Tidy the corners clicked: snap them, drop repeats (and a last click back on the first
 * corner) and corners in the middle of a straight wall. Null when it isn't a shape (fewer
 * than three corners, or no area).
 */
export function cleanOutline(points: Pt[], mode: SnapMode): Pt[] | null {
  let pts = points.map((p) => ({ x: snap(p.x, mode), y: snap(p.y, mode) }));
  pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1]!.x) > EPS || Math.abs(p.y - pts[i - 1]!.y) > EPS);
  while (pts.length > 1 && Math.abs(pts[0]!.x - pts.at(-1)!.x) < EPS && Math.abs(pts[0]!.y - pts.at(-1)!.y) < EPS) pts.pop();
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const c = pts[(i + 1) % pts.length]!;
      if (Math.abs(cross(a, pts[i]!, c)) < EPS) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (pts.length < 3 || Math.abs(area2(pts)) < EPS) return null;
  return pts;
}

/** Bounding box of corners on the table, and the corners relative to it. */
export function outlineBox(points: Pt[]): Rect & { outline: Pt[] } {
  const x = Math.min(...points.map((p) => p.x));
  const y = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - x;
  const depth = Math.max(...points.map((p) => p.y)) - y;
  return { x, y, width, depth, outline: points.map((p) => ({ x: p.x - x, y: p.y - y })) };
}

/** Where a corner of the unturned shape ends up after turning (clockwise; Y points down). */
function turn(p: Pt, rotation: Rotation, width: number, depth: number): Pt {
  switch (rotation) {
    case 90:
      return { x: depth - p.y, y: p.x };
    case 180:
      return { x: width - p.x, y: depth - p.y };
    case 270:
      return { x: p.y, y: width - p.x };
    default:
      return p;
  }
}

/** The outline's corners on the table (studs) — a shaped feature's, or a tilted box's — or null for an ordinary square-on rectangle. */
export function outlineOnTable(o: Pick<CanvasObject, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'outline' | 'tilt'> & { round?: boolean }): Pt[] | null {
  const box = baseRect(o);
  // A tilted plain box (not a round piece: a circle looks the same turned) is its four corners.
  if (!o.outline) return o.tilt && !o.round ? tiltCorners(box, o.tilt) : null;
  const pts = o.outline.map((p) => {
    const t = turn(p, o.rotation, o.width, o.depth);
    return { x: o.x + t.x, y: o.y + t.y };
  });
  if (!o.tilt) return pts;
  // A tilted shaped feature: its corners turned about the middle of its box.
  const a = (o.tilt * Math.PI) / 180;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.depth / 2;
  return pts.map((q) => ({ x: cx + (q.x - cx) * Math.cos(a) - (q.y - cy) * Math.sin(a), y: cy + (q.x - cx) * Math.sin(a) + (q.y - cy) * Math.cos(a) }));
}

/** Is a point inside a shape (edges count as inside)? */
export function insideOutline(pts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    // On an edge.
    if (Math.abs(cross(a, b, { x, y })) < EPS && x >= Math.min(a.x, b.x) - EPS && x <= Math.max(a.x, b.x) + EPS && y >= Math.min(a.y, b.y) - EPS && y <= Math.max(a.y, b.y) + EPS) return true;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Stretch an outline to a new size (Width / Depth changed in the panel). */
export const scaleOutline = (outline: Pt[], from: { width: number; depth: number }, to: { width: number; depth: number }): Pt[] =>
  outline.map((p) => ({ x: (p.x * to.width) / from.width, y: (p.y * to.depth) / from.depth }));

/** Floor area in square studs (the bounding box for a plain rectangle). */
export const outlineArea = (o: Pick<CanvasObject, 'width' | 'depth' | 'outline'>) => (o.outline ? Math.abs(area2(o.outline)) / 2 : o.width * o.depth);

/** A feature or plate as far as clashing goes: its box, and its corners when shaped. */
export interface Solid extends Rect {
  pts: Pt[] | null;
}

const insideSolid = (s: Solid, x: number, y: number) => (s.pts ? insideOutline(s.pts, x, y) : x > s.x && x < s.x + s.width && y > s.y && y < s.y + s.depth);

/** Check spots every half stud across an area (between grid lines, so never on an edge). */
function anySpot(r: Rect, f: (x: number, y: number) => boolean): boolean {
  for (let x = r.x + 0.25; x < r.x + r.width; x += 0.5) for (let y = r.y + 0.25; y < r.y + r.depth; y += 0.5) if (f(x, y)) return true;
  return false;
}

/**
 * solidsClash for shapes: two things overlap unless one sits entirely on the other. A
 * building in the notch of an L-shaped one doesn't overlap it. Shapes are compared every
 * half stud.
 */
export function shapesClash(a: Solid, b: Solid, aCanSit = true, bCanSit = true): boolean {
  if (!a.pts && !b.pts) return solidsClash(a, b, aCanSit, bCanSit);
  if (!rectsOverlap(a, b)) return false;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const common = { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, depth: Math.min(a.y + a.depth, b.y + b.depth) - y };
  if (!anySpot(common, (px, py) => insideSolid(a, px, py) && insideSolid(b, px, py))) return false;
  const same = a.x === b.x && a.y === b.y && a.width === b.width && a.depth === b.depth && JSON.stringify(a.pts) === JSON.stringify(b.pts);
  if (same) return true;
  const aOnB = aCanSit && !anySpot(a, (px, py) => insideSolid(a, px, py) && !insideSolid(b, px, py));
  const bOnA = bCanSit && !anySpot(b, (px, py) => insideSolid(b, px, py) && !insideSolid(a, px, py));
  return !(aOnB || bOnA);
}

/** A point inside the shape to put its name on (the middle when that is inside). */
export function labelSpot(pts: Pt[]): Pt {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  if (insideOutline(pts, mid.x, mid.y)) return mid;
  // Otherwise the middle of the widest stretch across, on a few heights.
  let best = { at: pts[0]!, len: -1 };
  const top = Math.min(...ys);
  const h = Math.max(...ys) - top;
  for (const f of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
    const y = top + h * f;
    const cuts: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > y !== b.y > y) cuts.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const len = cuts[k + 1]! - cuts[k]!;
      if (len > best.len) best = { at: { x: (cuts[k]! + cuts[k + 1]!) / 2, y }, len };
    }
  }
  return best.at;
}
