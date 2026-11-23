// Stacking order and "what is under this point", computed from the layout itself
// (not from rendered pixels), so a click always matches what was last drawn.
import { footprint } from './geometry';
import { insideOutline, outlineOnTable } from './outline';
import { allItems, isModule, type Item } from './edits';
import type { Project } from './schema';

/** Layers stack bottom to top in their order; within a layer, modules, then rides, then items. */
export function drawOrder(project: Project, items: Item[]): Item[] {
  const layerOrder = new Map(project.layers.map((l) => [l.id, l.order]));
  const rank = (i: Item) => (isModule(i) ? 0 : i.type === 'footprint' ? 1 : 2);
  return [...items].sort((a, b) => (layerOrder.get(a.layerId) ?? 0) - (layerOrder.get(b.layerId) ?? 0) || rank(a) - rank(b));
}

/**
 * What a click at (x, y) studs picks: the topmost selectable item there (skipping hidden and
 * locked layers) — but small things win when the click is near them. Zoomed out, a brick
 * is a few pixels wide; a click that just misses it (within `reach` studs, the editor passes
 * a few screen pixels' worth) picks the brick, not the plate it sits on.
 */
export function itemAt(project: Project, levelId: string, x: number, y: number, hidden?: ReadonlySet<string>, reach = 0): Item | null {
  const exact = topmostAt(project, levelId, x, y, hidden);
  if (exact && !isModule(exact) && exact.type !== 'footprint') return exact;
  if (reach <= 0) return exact;
  // Small things (pieces, items, markers) near the click: the nearest, then the smallest.
  const editable = new Set(project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  let best: { item: Item; d: number; area: number } | null = null;
  for (const o of project.objects) {
    if (o.levelId !== levelId || o.type === 'footprint' || !editable.has(o.layerId) || hidden?.has(o.id)) continue;
    const r = footprint(o);
    const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.depth));
    const d = Math.hypot(dx, dy);
    if (d > reach) continue;
    const area = r.width * r.depth;
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && area < best.area)) best = { item: o, d, area };
  }
  return best?.item ?? exact;
}

function topmostAt(project: Project, levelId: string, x: number, y: number, hidden?: ReadonlySet<string>): Item | null {
  const editable = new Set(project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  const stack = drawOrder(
    project,
    allItems(project).filter((i) => i.levelId === levelId && editable.has(i.layerId) && !hidden?.has(i.id)),
  );
  for (let k = stack.length - 1; k >= 0; k--) {
    const i = stack[k]!;
    const r = footprint(i);
    if (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.depth) continue;
    const pts = outlineOnTable(i);
    if (pts && !insideOutline(pts, x, y)) continue;
    if (!isModule(i) && i.round) {
      const dx = (x - (r.x + r.width / 2)) / (r.width / 2);
      const dy = (y - (r.y + r.depth / 2)) / (r.depth / 2);
      if (dx * dx + dy * dy > 1) continue;
    }
    return i;
  }
  return null;
}
