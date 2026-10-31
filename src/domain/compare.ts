// Compare two versions of a layout (FR-06.01): what was added, removed, moved or changed,
// and how the real parts needed differ (for a redesign shopping list).
import { allItems, isModule, type Item } from './edits';
import { partsNeeded, type NeededPart } from './inventory';
import { legoColorName } from './legoColors';
import { moduleDisplayName, type Project } from './schema';

export interface ItemChange {
  item: Item;
  name: string;
  what: string[];
}

export interface PartDiff extends Omit<NeededPart, 'needed'> {
  before: number;
  after: number;
  change: number;
}

export interface Comparison {
  added: ItemChange[];
  removed: ItemChange[];
  moved: ItemChange[];
  changed: ItemChange[];
  /** Single pieces are summarised by name (a walkway can be hundreds of plates). */
  piecesAdded: { name: string; count: number }[];
  piecesRemoved: { name: string; count: number }[];
  piecesMoved: number;
  parts: PartDiff[];
  levelsAdded: string[];
  levelsRemoved: string[];
  /** Every added / removed / moved thing, pieces included (for marking pictures). */
  addedIds: string[];
  removedIds: string[];
  movedIds: string[];
}

const nameOf = (i: Item) => (isModule(i) ? moduleDisplayName(i) : i.name || 'Item');
const isPiece = (i: Item) => !isModule(i) && i.type === 'piece';

function summarise(items: Item[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(nameOf(i), (m.get(nameOf(i)) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function differences(a: Item, b: Item): string[] {
  const what: string[] = [];
  if (a.width !== b.width || a.depth !== b.depth) what.push(`size ${a.depth}×${a.width} → ${b.depth}×${b.width}`);
  if (nameOf(a) !== nameOf(b)) what.push(`name “${nameOf(a)}” → “${nameOf(b)}”`);
  const ca = isModule(a) ? (a.plateColor ?? a.color) : a.color;
  const cb = isModule(b) ? (b.plateColor ?? b.color) : b.color;
  if (ca !== cb) what.push(`colour ${legoColorName(ca ?? '') ?? ca ?? 'none'} → ${legoColorName(cb ?? '') ?? cb ?? 'none'}`);
  if ((a.heightPlates ?? null) !== (b.heightPlates ?? null)) what.push('height');
  if (a.layerId !== b.layerId) what.push('layer');
  return what;
}

/** What changed going from `before` to `after` (things are matched by their identity). */
export function compareProjects(before: Project, after: Project): Comparison {
  const A = new Map(allItems(before).map((i) => [i.id, i]));
  const B = new Map(allItems(after).map((i) => [i.id, i]));
  const added = [...B.values()].filter((i) => !A.has(i.id));
  const removed = [...A.values()].filter((i) => !B.has(i.id));
  const moved: ItemChange[] = [];
  const changed: ItemChange[] = [];
  let piecesMoved = 0;
  const movedIds: string[] = [];
  for (const b of B.values()) {
    const a = A.get(b.id);
    if (!a) continue;
    const didMove = a.x !== b.x || a.y !== b.y || a.rotation !== b.rotation || a.levelId !== b.levelId;
    const what = differences(a, b);
    if (didMove) {
      movedIds.push(b.id);
      if (isPiece(b)) piecesMoved++;
      else moved.push({ item: b, name: nameOf(b), what: [a.levelId !== b.levelId ? 'to another level' : a.rotation !== b.rotation ? 'turned' : 'moved'] });
    }
    if (what.length) changed.push({ item: b, name: nameOf(b), what });
  }
  const pa = partsNeeded(before).parts;
  const pb = partsNeeded(after).parts;
  const key = (p: NeededPart) => `${p.partNo}|${p.colorName}`;
  const parts = new Map<string, PartDiff>();
  for (const p of pa) parts.set(key(p), { partNo: p.partNo, name: p.name, colorName: p.colorName, color: p.color, before: p.needed, after: 0, change: -p.needed });
  for (const p of pb) {
    const e = parts.get(key(p)) ?? { partNo: p.partNo, name: p.name, colorName: p.colorName, color: p.color, before: 0, after: 0, change: 0 };
    e.after = p.needed;
    e.change = e.after - e.before;
    parts.set(key(p), e);
  }
  const levelNames = (p: Project) => new Map(p.levels.map((l) => [l.id, l.name]));
  const la = levelNames(before);
  const lb = levelNames(after);
  return {
    added: added.filter((i) => !isPiece(i)).map((i) => ({ item: i, name: nameOf(i), what: [] })),
    removed: removed.filter((i) => !isPiece(i)).map((i) => ({ item: i, name: nameOf(i), what: [] })),
    moved,
    changed: changed.filter((c) => !isPiece(c.item)),
    piecesAdded: summarise(added.filter(isPiece)),
    piecesRemoved: summarise(removed.filter(isPiece)),
    piecesMoved,
    parts: [...parts.values()].filter((p) => p.change !== 0).sort((x, y) => y.change - x.change || x.name.localeCompare(y.name)),
    levelsAdded: [...lb].filter(([id]) => !la.has(id)).map(([, n]) => n),
    levelsRemoved: [...la].filter(([id]) => !lb.has(id)).map(([, n]) => n),
    addedIds: added.map((i) => i.id),
    removedIds: removed.map((i) => i.id),
    movedIds,
  };
}

export const isSame = (c: Comparison) =>
  !c.added.length && !c.removed.length && !c.moved.length && !c.changed.length && !c.piecesAdded.length && !c.piecesRemoved.length && !c.piecesMoved && !c.levelsAdded.length && !c.levelsRemoved.length;
