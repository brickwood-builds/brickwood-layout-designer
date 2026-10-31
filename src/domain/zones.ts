// Operating clearance zones around moving rides (FR-04.05). A zone is the feature's
// footprint grown by a margin; anything else placed in it gets an advisory warning.
import { footprint, type Rect } from './geometry';
import { allItems, isModule, type Item } from './edits';
import { computeStack } from './heights';
import { isBase, moduleDisplayName, type Project } from './schema';
import { SpatialIndex } from './spatial';

export const hasZone = (i: Item) => (i.clearanceStuds ?? 0) > 0;

export function zoneRect(i: Item, dx = 0, dy = 0): Rect {
  const f = footprint({ ...i, x: i.x + dx, y: i.y + dy });
  const m = i.clearanceStuds ?? 0;
  return { x: f.x - m, y: f.y - m, width: f.width + 2 * m, depth: f.depth + 2 * m };
}

const nameOf = (i: Item) => (isModule(i) ? moduleDisplayName(i) : i.name || 'Item');

export interface ZoneProblem {
  levelId: string;
  featureId: string;
  otherId: string;
  message: string;
}

/**
 * Things inside another feature's zone. Not counted: plain plates (the ground under the
 * zone), and anything built on the feature itself (its centre is on the feature).
 */
export function zoneProblems(project: Project): ZoneProblem[] {
  const out: ZoneProblem[] = [];
  for (const level of project.levels) {
    const items = allItems(project).filter((i) => i.levelId === level.id);
    const zoned = items.filter(hasZone);
    if (!zoned.length) continue;
    const candidates = items.filter((i) => !(isModule(i) && !isBase(i)));
    const index = new SpatialIndex(candidates);
    const byId = new Map(candidates.map((i) => [i.id, i]));
    const stack = project.features.heights ? computeStack(project, level.id) : null;
    for (const f of zoned) {
      const own = footprint(f);
      for (const id of index.overlapping(zoneRect(f))) {
        if (id === f.id) continue;
        const other = byId.get(id)!;
        const o = footprint(other);
        const cx = o.x + o.width / 2;
        const cy = o.y + o.depth / 2;
        if (cx > own.x && cx < own.x + own.width && cy > own.y && cy < own.y + own.depth) continue; // part of the ride
        if (stack && f.clearAbovePlates !== undefined && stack.get(id)!.top <= f.clearAbovePlates) continue; // low enough
        out.push({ levelId: level.id, featureId: f.id, otherId: id, message: `${nameOf(other)} is inside the operating zone of ${nameOf(f)}` });
      }
    }
  }
  return out;
}
