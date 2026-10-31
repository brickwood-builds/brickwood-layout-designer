import RBush from 'rbush';
import { footprint, rectsOverlap, type Placed, type Rect } from './geometry';

interface Entry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

/** R-tree over placed footprints, for overlap and area queries on large layouts. */
export class SpatialIndex {
  private tree = new RBush<Entry>();
  private rects = new Map<string, Rect>();

  constructor(items: Iterable<Placed & { id: string }> = []) {
    const entries: Entry[] = [];
    for (const item of items) {
      const r = footprint(item);
      this.rects.set(item.id, r);
      entries.push(toEntry(item.id, r));
    }
    this.tree.load(entries);
  }

  /** Add one more item. */
  insert(item: Placed & { id: string }): void {
    const r = footprint(item);
    this.rects.set(item.id, r);
    this.tree.insert(toEntry(item.id, r));
  }

  /** IDs whose footprint overlaps the rect's interior (touching edges excluded). */
  overlapping(rect: Rect, excludeIds?: ReadonlySet<string>): string[] {
    return this.tree
      .search(toEntry('', rect))
      .filter((e) => !excludeIds?.has(e.id) && rectsOverlap(rect, this.rects.get(e.id)!))
      .map((e) => e.id);
  }

  /** IDs whose footprint touches or overlaps the rect (used for marquee selection). */
  intersecting(rect: Rect): string[] {
    return this.tree.search(toEntry('', rect)).map((e) => e.id);
  }

  /** Each overlapping pair once. */
  overlapPairs(): [string, string][] {
    const pairs: [string, string][] = [];
    for (const [id, r] of this.rects) {
      for (const other of this.overlapping(r)) if (id < other) pairs.push([id, other]);
    }
    return pairs;
  }
}

function toEntry(id: string, r: Rect): Entry {
  return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.depth, id };
}
