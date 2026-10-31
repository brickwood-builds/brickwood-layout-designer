// Renderer-independent geometry. Nothing here may depend on canvas/DOM state.
import type { Project, Rotation } from './schema';

export interface Rect {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Placed extends Rect {
  rotation: Rotation;
}

/** Axis-aligned footprint of a placed object (x/y are already the placed upper-left). */
export function footprint(p: Placed): Rect {
  const swap = p.rotation === 90 || p.rotation === 270;
  return { x: p.x, y: p.y, width: swap ? p.depth : p.width, depth: swap ? p.width : p.depth };
}

const EPS = 1e-9;

/** True when the interiors overlap (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    b.x < a.x + a.width - EPS &&
    a.y < b.y + b.depth - EPS &&
    b.y < a.y + a.depth - EPS
  );
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.depth <= outer.y + outer.depth + EPS
  );
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.depth);
  }
  return { x: minX, y: minY, width: maxX - minX, depth: maxY - minY };
}

export function snap(value: number, mode: 'full' | 'half' | 'free'): number {
  if (mode === 'free') return value;
  const step = mode === 'full' ? 1 : 0.5;
  return Math.round(value / step) * step;
}

/** Bounds of everything on one level (tables, modules and objects). */
export function levelBounds(project: Project, levelId: string): Rect | null {
  const rects = [
    ...project.tables.filter((t) => t.levelId === levelId),
    ...project.modules.filter((m) => m.levelId === levelId),
    ...project.objects.filter((o) => o.levelId === levelId),
  ].map(footprint);
  return unionRect(rects);
}

/**
 * Two plates/features overlapping is a problem, unless one sits entirely on the other
 * (a mountain built on its castle base).
 */
export function solidsClash(a: Rect, b: Rect): boolean {
  return rectsOverlap(a, b) && !rectContains(a, b) && !rectContains(b, a);
}

