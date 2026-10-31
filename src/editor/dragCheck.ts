import { footprint, rectContains, solidsClash } from '../domain/geometry';
import { allItems, isModule, type Item } from '../domain/edits';
import { warningKey } from '../domain/objects';
import type { Project } from '../domain/schema';
import { SpatialIndex } from '../domain/spatial';

const isSolid = (i: Item) => isModule(i) || i.type === 'footprint';
/** Single pieces stack freely (a brick on a plate), so they never clash with small items. */
const clashesAsSmall = (i: Item) => !isSolid(i) && !(!isModule(i) && i.type === 'piece');

/**
 * Built once when a drag starts: indexes everything that isn't moving, so each drag step
 * only checks the moved items (overlap with others, overhang off the table).
 * Matches checkLayout's rules, including warnings already marked as intended.
 */
export function makeDragChecker(project: Project, levelId: string, draggedIds: ReadonlySet<string>) {
  const onLevel = allItems(project).filter((i) => i.levelId === levelId);
  const others = onLevel.filter((i) => !draggedIds.has(i.id));
  const solid = new SpatialIndex(others.filter(isSolid));
  const solidRects = new Map(others.filter(isSolid).map((i) => [i.id, footprint(i)]));
  // Small items only clash with small items on the same layer.
  const smallByLayer = new Map<string, SpatialIndex>();
  for (const layerId of new Set(others.filter(clashesAsSmall).map((i) => i.layerId))) {
    smallByLayer.set(layerId, new SpatialIndex(others.filter((i) => clashesAsSmall(i) && i.layerId === layerId)));
  }
  const tables = project.tables.filter((t) => t.levelId === levelId).map(footprint);
  const acknowledged = new Set(project.acknowledgements.map((a) => a.key));
  const dragged = onLevel.filter((i) => draggedIds.has(i.id));

  return (dx: number, dy: number): Set<string> => {
    const problems = new Set<string>();
    for (const item of dragged) {
      const r = footprint({ ...item, x: item.x + dx, y: item.y + dy });
      const index = isSolid(item) ? solid : clashesAsSmall(item) ? smallByLayer.get(item.layerId) : undefined;
      for (const other of index?.overlapping(r) ?? []) {
        if (isSolid(item) && !solidsClash(r, solidRects.get(other)!)) continue; // sits entirely on it, or it on this
        if (!acknowledged.has(warningKey({ kind: 'overlap', ids: [item.id, other] }))) problems.add(item.id);
      }
      if (tables.length && !tables.some((t) => rectContains(t, r)) && !acknowledged.has(warningKey({ kind: 'overhang', ids: [item.id] }))) {
        problems.add(item.id);
      }
    }
    return problems;
  };
}
