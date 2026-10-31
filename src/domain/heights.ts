// Heights (Phase 2). Plates are the canonical vertical unit: 1 plate = 3.2 mm,
// 1 brick = 3 plates. Heights are measured from the top of the table.
// Stacking is automatic: a thing sits on top of whatever is under it, unless its base
// height was set by hand (baseHeightPlates present = set by hand).
import { footprint, rectsOverlap, type Rect } from './geometry';
import { allItems, isModule, type Item } from './edits';
import { drawOrder } from './hit';
import { moduleDisplayName, type Project } from './schema';
import { SpatialIndex } from './spatial';
import { partByKey } from './catalog';

export const MM_PER_PLATE = 3.2;
export const PLATES_PER_BRICK = 3;

export const platesToInches = (plates: number) => (plates * MM_PER_PLATE) / 25.4;
export const inchesToPlates = (inches: number) => (inches * 25.4) / MM_PER_PLATE;

/** "79 plates (10.0 in)", or "3 plates (1 brick)" for small heights. */
export function formatHeight(plates: number): string {
  const p = +plates.toFixed(1);
  const bricks = plates / PLATES_PER_BRICK;
  const extra = plates < 30 && Number.isInteger(bricks) && bricks > 0 ? `${bricks} brick${bricks === 1 ? '' : 's'}` : `${platesToInches(plates).toFixed(1)} in`;
  return `${p} plate${p === 1 ? '' : 's'} (${extra})`;
}

/**
 * Read a height typed by the user: plain numbers are plates; "10 in", "10\"", "25 cm",
 * "8 bricks"/"8 b" also work. Returns whole plates, or null if it can't be read.
 */
export function parseHeight(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(plates?|p|bricks?|b|in(?:ches)?|"|cm|mm)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  const unit = (m[2] ?? 'p').toLowerCase();
  let plates = n;
  if (unit.startsWith('b')) plates = n * PLATES_PER_BRICK;
  else if (unit.startsWith('in') || unit === '"') plates = inchesToPlates(n);
  else if (unit === 'cm') plates = (n * 10) / MM_PER_PLATE;
  else if (unit === 'mm') plates = n / MM_PER_PLATE;
  return Math.round(plates);
}

/** Height of a thing if the user hasn't set one: bricks 3 plates, plates/tiles 1, unknown 0. */
export function defaultHeight(i: Item): number {
  if (isModule(i)) return 0; // heights are measured from the top of the module plate
  const part = partByKey(i.catalogKey);
  if (part) return part.height;
  if (i.type === 'setupMarker') return i.markerKind === 'flowerpot' ? 1 : 3;
  return 0;
}

export const heightOf = (i: Item) => i.heightPlates ?? defaultHeight(i);

export interface StackInfo {
  /** Plates above the table where it sits. */
  base: number;
  height: number;
  top: number;
  /** Base height set by hand (not stacked automatically). */
  manual: boolean;
  /** What it sits on (auto), for the stack view. */
  restsOn: string | null;
}

/**
 * Work out where everything on a level sits. Things are stacked in drawing order
 * (layers bottom to top): each sits on the highest thing under it.
 */
export function computeStack(project: Project, levelId: string): Map<string, StackInfo> {
  const stack = new Map<string, StackInfo>();
  const placed = new SpatialIndex([]);
  for (const item of drawOrder(project, allItems(project).filter((i) => i.levelId === levelId))) {
    const r = footprint(item);
    const height = heightOf(item);
    let base = 0;
    let restsOn: string | null = null;
    if (item.baseHeightPlates !== undefined) base = item.baseHeightPlates;
    else {
      for (const id of placed.overlapping(r)) {
        const top = stack.get(id)!.top;
        if (top > base) {
          base = top;
          restsOn = id;
        }
      }
    }
    stack.set(item.id, { base, height, top: base + height, manual: item.baseHeightPlates !== undefined, restsOn });
    placed.insert(item);
  }
  return stack;
}

export interface StackEntry {
  item: Item;
  name: string;
  info: StackInfo;
}

/** Everything whose footprint overlaps `rect`, bottom to top (the stack view). */
export function stackAt(project: Project, levelId: string, rect: Rect, stack = computeStack(project, levelId)): StackEntry[] {
  const items = allItems(project).filter((i) => i.levelId === levelId);
  const index = new SpatialIndex(items);
  const byId = new Map(items.map((i) => [i.id, i]));
  return index
    .overlapping(rect)
    .map((id) => {
      const item = byId.get(id)!;
      return { item, name: isModule(item) ? moduleDisplayName(item) : item.name || 'Item', info: stack.get(id)! };
    })
    .sort((a, b) => a.info.base - b.info.base || a.info.top - b.info.top);
}

export interface ClearanceProblem {
  itemId: string;
  levelId: string;
  message: string;
}

/**
 * Things tall enough to reach a higher level's surface above them (TR-36). Positions use
 * each level's offset; heights use each level's elevation above the floor (inches).
 */
export function clearanceProblems(project: Project): ClearanceProblem[] {
  const out: ClearanceProblem[] = [];
  for (const lower of project.levels) {
    const uppers = project.levels.filter((l) => l.id !== lower.id && l.elevationIn > lower.elevationIn);
    if (uppers.length === 0) continue;
    const stack = computeStack(project, lower.id);
    for (const item of allItems(project).filter((i) => i.levelId === lower.id)) {
      const info = stack.get(item.id)!;
      if (info.top <= 0) continue;
      const topIn = lower.elevationIn + platesToInches(info.top);
      const f = footprint(item);
      const abs = { x: f.x + lower.offsetX, y: f.y + lower.offsetY, width: f.width, depth: f.depth };
      for (const upper of uppers) {
        if (topIn <= upper.elevationIn) continue;
        const under = project.tables
          .filter((t) => t.levelId === upper.id)
          .map((t) => {
            const r = footprint(t);
            return { x: r.x + upper.offsetX, y: r.y + upper.offsetY, width: r.width, depth: r.depth };
          })
          .some((t) => rectsOverlap(abs, t));
        if (!under) continue;
        const name = isModule(item) ? moduleDisplayName(item) : item.name || 'Item';
        out.push({
          itemId: item.id,
          levelId: lower.id,
          message: `${name} (${platesToInches(info.top).toFixed(1)} in tall) reaches ${upper.name}, which is ${(upper.elevationIn - lower.elevationIn).toFixed(1)} in above`,
        });
      }
    }
  }
  return out;
}

// Low ground green, then tan and brown, to grey-white at the top (like a relief map).
const RAMP: [number, [number, number, number]][] = [
  [0, [58, 125, 68]],
  [0.35, [216, 192, 138]],
  [0.7, [139, 90, 43]],
  [1, [232, 232, 232]],
];

/** Colour for a height, from the bottom (0) to the highest point (max). */
export function heightColor(top: number, max: number): string {
  const t = max > 0 ? Math.min(1, Math.max(0, top / max)) : 0;
  let i = 0;
  while (i < RAMP.length - 2 && t > RAMP[i + 1]![0]) i++;
  const [t0, a] = RAMP[i]!;
  const [t1, b] = RAMP[i + 1]!;
  const f = (t - t0) / (t1 - t0 || 1);
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const HEIGHT_RAMP_CSS = `linear-gradient(to right, ${RAMP.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

