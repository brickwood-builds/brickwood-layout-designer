import { footprint, rectContains } from '../domain/geometry';
import { allItems, isModule, type Item } from '../domain/edits';
import { warningKey } from '../domain/objects';
import type { Project } from '../domain/schema';
import { SpatialIndex } from '../domain/spatial';

const isSolid = (i: Item) => isModule(i) || i.type === 'footprint';

/**
 * Built once when a drag starts: indexes everything that isn't moving, so each drag step
 * only checks the moved items (overlap with others, overhang off the table).
 * Matches checkLayout's rules, including warnings already marked as intended.
 */
export function makeDragChecker(project: Project, levelId: string, draggedIds: ReadonlySet<string>) {
  const onLevel = allItems(project).filter((i) => i.levelId === levelId);
  const others = onLevel.filter((i) => !draggedIds.has(i.id));
  const solid = new SpatialIndex(others.filter(isSolid));
  // Small items only clash with small items on the same layer.
  const smallByLayer = new Map<string, SpatialIndex>();
  for (const layerId of new Set(others.filter((i) => !isSolid(i)).map((i) => i.layerId))) {
    smallByLayer.set(layerId, new SpatialIndex(others.filter((i) => !isSolid(i) && i.layerId === layerId)));
  }
  const tables = project.tables.filter((t) => t.levelId === levelId).map(footprint);
  const acknowledged = new Set(project.acknowledgements.map((a) => a.key));
  const dragged = onLevel.filter((i) => draggedIds.has(i.id));

  return (dx: number, dy: number): Set<string> => {
    const problems = new Set<string>();
    for (const item of dragged) {
      const r = footprint({ ...item, x: item.x + dx, y: item.y + dy });
      const index = isSolid(item) ? solid : smallByLayer.get(item.layerId);
      for (const other of index?.overlapping(r) ?? []) {
        if (!acknowledged.has(warningKey({ kind: 'overlap', ids: [item.id, other] }))) problems.add(item.id);
      }
      if (tables.length && !tables.some((t) => rectContains(t, r)) && !acknowledged.has(warningKey({ kind: 'overhang', ids: [item.id] }))) {
        problems.add(item.id);
      }
    }
    return problems;
  };
}
