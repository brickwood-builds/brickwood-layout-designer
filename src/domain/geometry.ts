// Renderer-independent geometry. Nothing here may depend on canvas/DOM state.
import { moduleDisplayName, type Project, type Rotation } from './schema';

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

export type WarningKind = 'overhang' | 'moduleOverlap' | 'duplicateLabel' | 'retiredLabel';

export interface LayoutWarning {
  kind: WarningKind;
  levelId: string;
  /** IDs of the objects involved. */
  ids: string[];
  message: string;
}

/**
 * Advisory layout checks, applied per level (FR-01.04, FR-02.04).
 * Warnings never modify or delete anything.
 */
export function checkLayout(project: Project): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const labelCounts = new Map<string, string[]>();
  for (const m of project.modules) {
    const key = m.label.trim().toUpperCase();
    if (!key) continue;
    labelCounts.set(key, [...(labelCounts.get(key) ?? []), m.id]);
  }
  for (const [label, ids] of labelCounts) {
    if (ids.length > 1) {
      const levelId = project.modules.find((m) => m.id === ids[0])!.levelId;
      warnings.push({ kind: 'duplicateLabel', levelId, ids, message: `MILS ID ${label} is used ${ids.length} times` });
    }
  }
  const retired = new Set(project.retiredLabels.map((l) => l.trim().toUpperCase()));
  for (const m of project.modules) {
    if (m.label.trim() && retired.has(m.label.trim().toUpperCase())) {
      warnings.push({ kind: 'retiredLabel', levelId: m.levelId, ids: [m.id], message: `MILS ID ${m.label} was retired and should not be reused` });
    }
  }

  for (const level of project.levels) {
    const tables = project.tables.filter((t) => t.levelId === level.id);
    const tableRects = tables.map(footprint);
    const surfaceName = tables.map((t) => t.name).join(' + ') || level.name;
    const items = [...project.modules.filter((m) => m.levelId === level.id), ...project.objects.filter((o) => o.levelId === level.id)];

    if (tableRects.length > 0) {
      for (const item of items) {
        const r = footprint(item);
        // Allowed if fully inside any single table (multi-table joins are modelled as one surface).
        if (!tableRects.some((t) => rectContains(t, r))) {
          const label = 'label' in item ? moduleDisplayName(item) : item.name || 'Object';
          warnings.push({ kind: 'overhang', levelId: level.id, ids: [item.id], message: `${label} overhangs ${surfaceName}` });
        }
      }
    }

    const mods = project.modules.filter((m) => m.levelId === level.id);
    for (let i = 0; i < mods.length; i++) {
      for (let j = i + 1; j < mods.length; j++) {
        const a = mods[i]!, b = mods[j]!;
        if (rectsOverlap(footprint(a), footprint(b))) {
          warnings.push({ kind: 'moduleOverlap', levelId: level.id, ids: [a.id, b.id], message: `${moduleDisplayName(a)} overlaps ${moduleDisplayName(b)}` });
        }
      }
    }
  }
  return warnings;
}
