// Pattern stamping (FR-03.05): one piece or one design every N studs along a stroke
// (or in a grid for a box), with a turn, skipping spots that are already taken.
// One undo per stroke.
import { paintCells, type PaintTemplate, type Pt, type WhenTaken } from './brush';
import { allItems, isModule, moveItems, rotateItems } from './edits';
import { footprint, rectsOverlap, type Rect } from './geometry';
import { designSize, placeDesign } from './designs';
import type { Project } from './schema';
import { SpatialIndex } from './spatial';

/** How stamps are turned: a fixed quarter turn, or along the direction of the stroke. */
export type Turn = 0 | 90 | 180 | 270 | 'follow';

export interface StampSpot {
  /** Centre of the stamp, studs. */
  at: Pt;
  /** Direction of the stroke there (unit-ish vector). */
  dir: Pt;
}

/** Spots every `spacing` studs along a path, starting at its first point. */
export function spotsAlongPath(path: Pt[], spacing: number): StampSpot[] {
  if (!path.length) return [];
  const first = path[0]!;
  const dirAt = (i: number): Pt => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, Math.max(1, i))]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return l ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 };
  };
  const spots: StampSpot[] = [{ at: first, dir: dirAt(1) }];
  if (spacing <= 0) return spots;
  let carried = 0; // distance travelled since the last spot
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (!seg) continue;
    const dir = { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
    let t = spacing - carried;
    while (t <= seg + 1e-9) {
      spots.push({ at: { x: a.x + dir.x * t, y: a.y + dir.y * t }, dir });
      t += spacing;
    }
    carried = seg - (t - spacing);
  }
  return spots;
}

/** Spots in a grid every `spacing` studs across the box between two corners. */
export function spotsInBox(a: Pt, z: Pt, spacing: number): StampSpot[] {
  const x0 = Math.min(a.x, z.x);
  const y0 = Math.min(a.y, z.y);
  const x1 = Math.max(a.x, z.x);
  const y1 = Math.max(a.y, z.y);
  const out: StampSpot[] = [];
  for (let x = x0; x <= x1 + 1e-9; x += spacing) for (let y = y0; y <= y1 + 1e-9; y += spacing) out.push({ at: { x, y }, dir: { x: 1, y: 0 } });
  return out;
}

/** Quarter turns (0–3) for a stamp at this spot. */
export function quarterTurns(turn: Turn, dir: Pt): number {
  if (turn !== 'follow') return turn / 90;
  if (Math.abs(dir.x) >= Math.abs(dir.y)) return dir.x >= 0 ? 0 : 2;
  return dir.y >= 0 ? 1 : 3;
}

export type StampSource = { kind: 'piece'; template: PaintTemplate } | { kind: 'design'; designId: string };

export interface StampPlan {
  rect: Rect;
  turns: number;
  /** False where something is already there (shown red, and skipped). */
  ok: boolean;
}

function sourceSize(p: Project, src: StampSource): { width: number; depth: number } | null {
  if (src.kind === 'piece') return src.template;
  const d = p.designs.find((x) => x.id === src.designId);
  if (!d) return null;
  const s = designSize(d);
  return s.width > 0 ? s : null;
}

/** Centre-to-centre distance when stamps should just touch ("Solid" spacing for a design). */
export function touchingSpacing(p: Project, src: StampSource): number {
  const s = sourceSize(p, src);
  return s ? Math.max(1, Math.max(s.width, s.depth)) : 1;
}

/** Things a stamp must not land on: on the same layer for pieces; anything but plates and pieces for designs. */
function blockers(p: Project, levelId: string, layerId: string, src: StampSource) {
  const items = allItems(p).filter((i) => i.levelId === levelId);
  if (src.kind === 'piece') return new SpatialIndex(items.filter((i) => !isModule(i) && i.layerId === layerId));
  return new SpatialIndex(items.filter((i) => (isModule(i) ? !i.label.trim() : i.type !== 'piece')));
}

/** Where each stamp goes, and whether it fits. Stamps never overlap each other. */
export function planStamps(p: Project, levelId: string, layerId: string, src: StampSource, spots: StampSpot[], turn: Turn, whenTaken: WhenTaken): StampPlan[] {
  const size = sourceSize(p, src);
  if (!size) return [];
  const taken = whenTaken === 'skip' ? blockers(p, levelId, layerId, src) : new SpatialIndex([]);
  const placed: Rect[] = [];
  return spots.map((s) => {
    const turns = quarterTurns(turn, s.dir);
    const w = turns % 2 ? size.depth : size.width;
    const d = turns % 2 ? size.width : size.depth;
    const rect = { x: Math.round(s.at.x - w / 2), y: Math.round(s.at.y - d / 2), width: w, depth: d };
    const ok = !placed.some((r) => rectsOverlap(r, rect)) && !taken.overlapping(rect).length;
    if (ok) placed.push(rect);
    return { rect, turns, ok };
  });
}

/** Stamp along the spots (one change). Returns the new things' IDs and how many spots were skipped. */
export function stamp(p: Project, levelId: string, layerId: string, src: StampSource, spots: StampSpot[], turn: Turn, whenTaken: WhenTaken): { project: Project; ids: string[]; skipped: number } {
  const plan = planStamps(p, levelId, layerId, src, spots, turn, whenTaken);
  const good = plan.filter((s) => s.ok);
  let project = p;
  const ids: string[] = [];
  if (src.kind === 'piece') {
    // A turned piece is the same piece with its sides swapped.
    for (const odd of [false, true]) {
      const cells = good.filter((s) => s.turns % 2 === 1 === odd).map((s) => ({ x: s.rect.x, y: s.rect.y }));
      if (!cells.length) continue;
      const t = odd ? { ...src.template, width: src.template.depth, depth: src.template.width } : src.template;
      const r = paintCells(project, levelId, layerId, t, cells, 'stack'); // overlaps were settled by the plan
      project = r.project;
      ids.push(...r.ids);
    }
  } else {
    const size = sourceSize(p, src)!;
    for (const s of good) {
      const cx = s.rect.x + s.rect.width / 2;
      const cy = s.rect.y + s.rect.depth / 2;
      const r = placeDesign(project, src.designId, levelId, { x: cx - size.width / 2, y: cy - size.depth / 2 }, 'free');
      if (!r) continue;
      project = r.project;
      for (let k = 0; k < s.turns; k++) project = rotateItems(project, r.ids, 1, 'free');
      // Settle the turned copy exactly on its planned spot.
      const b = r.ids.map((id) => allItems(project).find((i) => i.id === id)!).map(footprint);
      const minX = Math.min(...b.map((f) => f.x));
      const minY = Math.min(...b.map((f) => f.y));
      if (minX !== s.rect.x || minY !== s.rect.y) project = moveItems(project, r.ids, s.rect.x - minX, s.rect.y - minY);
      ids.push(...r.ids);
    }
  }
  return { project, ids, skipped: plan.length - good.length };
}
