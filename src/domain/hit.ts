// Stacking order and "what is under this point", computed from the layout itself
// (not from rendered pixels), so a click always matches what was last drawn.
import { footprint } from './geometry';
import { allItems, isModule, type Item } from './edits';
import type { Project } from './schema';

/** Layers stack bottom to top in their order; within a layer, modules, then rides, then items. */
export function drawOrder(project: Project, items: Item[]): Item[] {
  const layerOrder = new Map(project.layers.map((l) => [l.id, l.order]));
  const rank = (i: Item) => (isModule(i) ? 0 : i.type === 'footprint' ? 1 : 2);
  return [...items].sort((a, b) => (layerOrder.get(a.layerId) ?? 0) - (layerOrder.get(b.layerId) ?? 0) || rank(a) - rank(b));
}

/** The topmost selectable item at (x, y) studs on a level, skipping hidden and locked layers. */
export function itemAt(project: Project, levelId: string, x: number, y: number): Item | null {
  const editable = new Set(project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  const stack = drawOrder(
    project,
    allItems(project).filter((i) => i.levelId === levelId && editable.has(i.layerId)),
  );
  for (let k = stack.length - 1; k >= 0; k--) {
    const i = stack[k]!;
    const r = footprint(i);
    if (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.depth) continue;
    if (!isModule(i) && i.round) {
      const dx = (x - (r.x + r.width / 2)) / (r.width / 2);
      const dy = (y - (r.y + r.depth / 2)) / (r.depth / 2);
      if (dx * dx + dy * dy > 1) continue;
    }
    return i;
  }
  return null;
}
