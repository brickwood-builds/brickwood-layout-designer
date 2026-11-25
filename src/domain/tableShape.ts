// Table shapes (24 Nov 2026): a display surface that isn't one rectangle — an L, a U, or a
// ring of tables around an open middle. Physically these are tables pushed together, so a
// shaped table is stored as several rectangular table pieces on the level; the level keeps the
// shape it was made from (so the Table dialog can show it again). Everything that asks "is
// this on the table?" treats the pieces as one surface.
import { z } from 'zod';
import { insideOutline, type Pt } from './outline';
import { inchesToStuds } from './units';
import type { Rect } from './geometry';

export const TABLE_SHAPES = ['rect', 'L', 'U', 'ring'] as const;
export type TableShapeKind = (typeof TABLE_SHAPES)[number];

/** L: where the corner is. U: which side is open. */
export const L_CORNERS = ['back-left', 'back-right', 'front-left', 'front-right'] as const;
export const U_OPENINGS = ['front', 'back', 'left', 'right'] as const;

export const TableShapeSchema = z.object({
  kind: z.enum(TABLE_SHAPES),
  /** Overall size, inches (across, and back to front). */
  widthIn: z.number().positive(),
  depthIn: z.number().positive(),
  /** How deep each arm of an L, U or ring is (one table's depth), inches. */
  armIn: z.number().positive().optional(),
  /** L: the corner; U: the open side. */
  side: z.enum([...L_CORNERS, ...U_OPENINGS]).optional(),
});
export type TableShape = z.infer<typeof TableShapeSchema>;

export const SHAPE_LABEL: Record<TableShapeKind, string> = { rect: 'Rectangle', L: 'L-shape', U: 'U-shape', ring: 'Ring (open middle)' };

/** Why these sizes don't make the shape, or null when they do. */
export function shapeProblem(s: TableShape): string | null {
  if (s.kind === 'rect') return null;
  const a = s.armIn ?? 0;
  if (!(a > 0)) return 'Enter how deep the tables are.';
  if (s.kind === 'ring' ? 2 * a >= s.widthIn || 2 * a >= s.depthIn : a >= s.widthIn || a >= s.depthIn) {
    return s.kind === 'ring' ? 'The tables are too deep for that size: there would be no open middle.' : 'The tables are as deep as the whole shape: make the overall size bigger.';
  }
  return null;
}

/** The rectangles that make the shape, in studs, from (0, 0) at the back-left corner. */
export function tablePieces(s: TableShape): Rect[] {
  const W = inchesToStuds(s.widthIn);
  const D = inchesToStuds(s.depthIn);
  const A = inchesToStuds(s.armIn ?? 0);
  const r = (x: number, y: number, width: number, depth: number): Rect => ({ x, y, width, depth });
  if (s.kind === 'rect' || shapeProblem(s)) return [r(0, 0, W, D)];
  if (s.kind === 'L') {
    switch (s.side ?? 'back-left') {
      case 'back-left':
        return [r(0, 0, W, A), r(0, A, A, D - A)];
      case 'back-right':
        return [r(0, 0, W, A), r(W - A, A, A, D - A)];
      case 'front-left':
        return [r(0, D - A, W, A), r(0, 0, A, D - A)];
      default:
        return [r(0, D - A, W, A), r(W - A, 0, A, D - A)];
    }
  }
  if (s.kind === 'U') {
    switch (s.side ?? 'front') {
      case 'front':
        return [r(0, 0, W, A), r(0, A, A, D - A), r(W - A, A, A, D - A)];
      case 'back':
        return [r(0, D - A, W, A), r(0, 0, A, D - A), r(W - A, 0, A, D - A)];
      case 'left':
        return [r(W - A, 0, A, D), r(0, 0, W - A, A), r(0, D - A, W - A, A)];
      default:
        return [r(0, 0, A, D), r(A, 0, W - A, A), r(A, D - A, W - A, A)];
    }
  }
  // Ring: back and front full width, left and right between them.
  return [r(0, 0, W, A), r(0, D - A, W, A), r(0, A, A, D - 2 * A), r(W - A, A, A, D - 2 * A)];
}

const EPS = 1e-6;
const within = (s: Rect, x: number, y: number) => x > s.x - EPS && x < s.x + s.width + EPS && y > s.y - EPS && y < s.y + s.depth + EPS;

/** Split [a, b] at every given position that falls inside it. */
function cuts(a: number, b: number, at: number[]): number[] {
  return [...new Set([a, b, ...at.filter((v) => v > a + EPS && v < b - EPS)])].sort((p, q) => p - q);
}

/**
 * Is the rectangle (or the shape `pts` inside it) fully on the surface made by these table
 * pieces? Across a join between pieces is on; over the open middle of a ring is off.
 */
export function onSurface(r: Rect, surfaces: Rect[], pts?: Pt[] | null): boolean {
  if (!surfaces.length) return true;
  // A shape (turned or shaped): every half stud of it must be on the table — thin corners
  // poking past an edge count.
  if (pts) {
    for (let x = r.x + 0.25; x < r.x + r.width; x += 0.5) {
      for (let y = r.y + 0.25; y < r.y + r.depth; y += 0.5) {
        if (insideOutline(pts, x, y) && !surfaces.some((s) => within(s, x, y))) return false;
      }
    }
    return true;
  }
  if (surfaces.some((s) => s.x <= r.x + EPS && s.y <= r.y + EPS && s.x + s.width >= r.x + r.width - EPS && s.y + s.depth >= r.y + r.depth - EPS)) return true;
  const xs = cuts(r.x, r.x + r.width, surfaces.flatMap((s) => [s.x, s.x + s.width]));
  const ys = cuts(r.y, r.y + r.depth, surfaces.flatMap((s) => [s.y, s.y + s.depth]));
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (!surfaces.some((s) => within(s, cx, cy))) return false;
    }
  }
  return true;
}

/** The outline of the joined pieces as line segments (no seams where pieces meet). */
export function surfaceEdges(surfaces: Rect[]): { x1: number; y1: number; x2: number; y2: number }[] {
  if (!surfaces.length) return [];
  const xs = [...new Set(surfaces.flatMap((s) => [s.x, s.x + s.width]))].sort((a, b) => a - b);
  const ys = [...new Set(surfaces.flatMap((s) => [s.y, s.y + s.depth]))].sort((a, b) => a - b);
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i + 1 < xs.length && j + 1 < ys.length && surfaces.some((s) => within(s, (xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2));
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      if (!on(i, j)) continue;
      const [x1, x2, y1, y2] = [xs[i]!, xs[i + 1]!, ys[j]!, ys[j + 1]!];
      if (!on(i, j - 1)) out.push({ x1, y1, x2, y2: y1 });
      if (!on(i, j + 1)) out.push({ x1, y1: y2, x2, y2 });
      if (!on(i - 1, j)) out.push({ x1, y1, x2: x1, y2 });
      if (!on(i + 1, j)) out.push({ x1: x2, y1, x2, y2 });
    }
  }
  return out;
}

// ---------- Joins: where one physical table ends and the next begins ----------

/** A join line across the table, studs (on the level). Straight across one stretch of table. */
export const TableJoinSchema = z.object({ x1: z.number().finite(), y1: z.number().finite(), x2: z.number().finite(), y2: z.number().finite() });
export type TableJoin = z.infer<typeof TableJoinSchema>;

/** A click this near (studs) to where two stretches of table meet puts the join right there. */
const SNAP_TO_EDGE = 3;

/**
 * The join a click at (x, y) would make: straight across the stretch of table clicked (across
 * its short way — a long table is split along its length), on whole studs, and onto the edge
 * where two stretches meet (the corner of an L) when within a few studs of it. `turned`: the
 * other way (Shift-click). Null off the table, or on its outer edge.
 */
export function joinAt(surfaces: Rect[], x: number, y: number, turned = false): TableJoin | null {
  const piece = surfaces.find((s) => within(s, x, y));
  if (!piece) return null;
  // A wide stretch is split by an up-and-down line; `turned` (Shift-click) the other way.
  const across = piece.width >= piece.depth !== turned;
  const at = across ? x : y;
  const lo = across ? piece.x : piece.y;
  const hi = across ? piece.x + piece.width : piece.y + piece.depth;
  // Edges this stretch shares with another one (where a join is real, not the table's outside).
  const shared = surfaces
    .filter((s) => s !== piece && touches(piece, s))
    .flatMap((s) => (across ? [s.x, s.x + s.width] : [s.y, s.y + s.depth]).filter((e) => Math.abs(e - lo) < EPS || Math.abs(e - hi) < EPS));
  const near = shared.find((e) => Math.abs(e - at) <= SNAP_TO_EDGE);
  const pos = near ?? Math.round(at);
  if (near === undefined && (pos <= lo + EPS || pos >= hi - EPS)) return null;
  return across ? { x1: pos, y1: piece.y, x2: pos, y2: piece.y + piece.depth } : { x1: piece.x, y1: pos, x2: piece.x + piece.width, y2: pos };
}

/** Two stretches meet along an edge (not just at a corner). */
function touches(a: Rect, b: Rect): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return (overlapX > EPS && Math.abs(overlapY) < EPS) || (overlapY > EPS && Math.abs(overlapX) < EPS);
}

/** Distance from a point to a join line. */
export function joinDistance(j: TableJoin, x: number, y: number): number {
  const dx = j.x2 - j.x1;
  const dy = j.y2 - j.y1;
  const t = Math.max(0, Math.min(1, ((x - j.x1) * dx + (y - j.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (j.x1 + t * dx), y - (j.y1 + t * dy));
}

/**
 * Joins after the table changed shape: each one still on the table is fitted again across
 * its stretch (same direction); ones now off the table go.
 */
export function keepJoins(surfaces: Rect[], joins: TableJoin[]): TableJoin[] {
  const out: TableJoin[] = [];
  for (const j of joins) {
    const mx = (j.x1 + j.x2) / 2;
    const my = (j.y1 + j.y2) / 2;
    const piece = surfaces.find((s) => within(s, mx, my));
    if (!piece) continue;
    const upDown = Math.abs(j.x1 - j.x2) < EPS;
    // joinAt picks the direction from the stretch; turn it if that's not this join's.
    const fitted = joinAt(surfaces, upDown ? j.x1 : mx, upDown ? my : j.y1, upDown !== piece.width >= piece.depth);
    if (fitted && !out.some((o) => o.x1 === fitted.x1 && o.y1 === fitted.y1 && o.x2 === fitted.x2 && o.y2 === fitted.y2)) out.push(fitted);
  }
  return out;
}

/** How many separate tables the joins make (the surface cut at every join). */
export function tableCount(surfaces: Rect[], joins: TableJoin[]): number {
  if (!surfaces.length) return 0;
  const vertical = joins.filter((j) => Math.abs(j.x1 - j.x2) < EPS);
  const horizontal = joins.filter((j) => Math.abs(j.y1 - j.y2) < EPS);
  const xs = [...new Set([...surfaces.flatMap((s) => [s.x, s.x + s.width]), ...vertical.map((j) => j.x1)])].sort((a, b) => a - b);
  const ys = [...new Set([...surfaces.flatMap((s) => [s.y, s.y + s.depth]), ...horizontal.map((j) => j.y1)])].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && surfaces.some((s) => within(s, (xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2));
  const parent = Array.from({ length: nx * ny }, (_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k]!)));
  const join = (a: number, b: number) => (parent[find(a)] = find(b));
  // Is the edge between two neighbouring cells on a join line?
  const cutX = (x: number, y1: number, y2: number) => vertical.some((j) => Math.abs(j.x1 - x) < EPS && Math.min(j.y1, j.y2) <= y1 + EPS && Math.max(j.y1, j.y2) >= y2 - EPS);
  const cutY = (y: number, x1: number, x2: number) => horizontal.some((j) => Math.abs(j.y1 - y) < EPS && Math.min(j.x1, j.x2) <= x1 + EPS && Math.max(j.x1, j.x2) >= x2 - EPS);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!on(i, j)) continue;
      if (on(i + 1, j) && !cutX(xs[i + 1]!, ys[j]!, ys[j + 1]!)) join(i * ny + j, (i + 1) * ny + j);
      if (on(i, j + 1) && !cutY(ys[j + 1]!, xs[i]!, xs[i + 1]!)) join(i * ny + j, i * ny + j + 1);
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (on(i, j)) roots.add(find(i * ny + j));
  return roots.size;
}
