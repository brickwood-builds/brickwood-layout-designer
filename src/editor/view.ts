// Screen <-> world (studs) transform: screen = world * scale + offset.
import type { Rect } from '../domain/geometry';

export interface View {
  scale: number; // pixels per stud
  x: number;
  y: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 60;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function toWorld(v: View, sx: number, sy: number) {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
}

export function toScreen(v: View, wx: number, wy: number) {
  return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
}

/** Zoom by `factor` keeping the world point under (sx, sy) fixed. */
export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const scale = clampScale(v.scale * factor);
  const w = toWorld(v, sx, sy);
  return { scale, x: sx - w.x * scale, y: sy - w.y * scale };
}

/** View that fits `bounds` into a viewport with padding (pixels). */
export function fitView(bounds: Rect, width: number, height: number, padding = 24): View {
  const w = Math.max(1, width - padding * 2);
  const h = Math.max(1, height - padding * 2);
  const scale = clampScale(Math.min(w / Math.max(bounds.width, 1), h / Math.max(bounds.depth, 1)));
  return {
    scale,
    x: width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.depth / 2) * scale,
  };
}

/** Grid spacing (studs) so lines stay at least `minPx` apart. */
export function gridStep(scale: number, minPx = 8): number {
  for (const step of [1, 2, 4, 8, 16, 32, 64, 128]) if (step * scale >= minPx) return step;
  return 256;
}
