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
  if (!pts && surfaces.some((s) => s.x <= r.x + EPS && s.y <= r.y + EPS && s.x + s.width >= r.x + r.width - EPS && s.y + s.depth >= r.y + r.depth - EPS)) return true;
  const xs = cuts(r.x, r.x + r.width, [...surfaces.flatMap((s) => [s.x, s.x + s.width]), ...(pts ?? []).map((p) => p.x)]);
  const ys = cuts(r.y, r.y + r.depth, [...surfaces.flatMap((s) => [s.y, s.y + s.depth]), ...(pts ?? []).map((p) => p.y)]);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      if (pts && !insideOutline(pts, cx, cy)) continue;
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
