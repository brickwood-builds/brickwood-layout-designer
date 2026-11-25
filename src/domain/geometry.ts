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
  /** Degrees turned on top of `rotation` (a piece that doesn't sit square). */
  tilt?: number;
}

/**
 * Its box before any tilt: x/y are the upper-left, width/depth swap for a quarter turn.
 * Positions are worked out from this (x/y always mean this box's corner).
 */
export function baseRect(p: Placed): Rect {
  const swap = p.rotation === 90 || p.rotation === 270;
  return { x: p.x, y: p.y, width: swap ? p.depth : p.width, depth: swap ? p.width : p.depth };
}

/** The corners of a tilted box, turned about its middle (clockwise; Y points down). */
export function tiltCorners(r: Rect, tilt: number): { x: number; y: number }[] {
  const a = (tilt * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.depth / 2;
  return [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, r.y + r.depth],
    [r.x, r.y + r.depth],
  ].map(([x, y]) => ({ x: cx + (x! - cx) * cos - (y! - cy) * sin, y: cy + (x! - cx) * sin + (y! - cy) * cos }));
}

/**
 * Axis-aligned footprint of a placed object: its box, or for a tilted one the box around its
 * turned corners (what it covers on the table).
 */
export function footprint(p: Placed): Rect {
  const r = baseRect(p);
  if (!p.tilt) return r;
  const pts = tiltCorners(r, p.tilt);
  const x = Math.min(...pts.map((q) => q.x));
  const y = Math.min(...pts.map((q) => q.y));
  return { x, y, width: Math.max(...pts.map((q) => q.x)) - x, depth: Math.max(...pts.map((q) => q.y)) - y };
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
 * (a mountain built on its castle base). Only features and ride/building outlines sit on
 * things — two labelled MILS plates never nest.
 */
export function solidsClash(a: Rect, b: Rect, aCanSit = true, bCanSit = true): boolean {
  if (!rectsOverlap(a, b)) return false;
  const same = a.x === b.x && a.y === b.y && a.width === b.width && a.depth === b.depth;
  if (same) return true; // two things in exactly the same spot is a mistake, not building on
  return !((aCanSit && rectContains(b, a)) || (bCanSit && rectContains(a, b)));
}

